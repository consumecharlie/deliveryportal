/**
 * Live ClickUp state per project list, cached in DashboardCache: the
 * Feedback Deadline tasks (type 12) that decide review deadlines, the
 * Delivery Deadline share tasks (type 11) that make up the project's
 * roadmap, and the list's own due date / archived flag. Also the client
 * folder's own list index (`getClientFolderLists`), which is how the portal
 * finds projects that have no delivery yet.
 *
 * The client portal spans many lists per client and ClickUp is slow, so a
 * page render never waits on ClickUp when any cached copy exists: a fresh
 * row is served as is, a stale row is served immediately and refreshed after
 * the response (stale-while-revalidate), and only a total miss fetches
 * inline. A failing fetch never throws; it falls back to the stale row or an
 * empty payload.
 */
import { after } from "next/server";
import { prisma } from "@/lib/db";
import {
  getListTasksByDropdownField,
  getFolderLists,
  getList,
  getTask,
  extractCustomFieldValue,
} from "@/lib/clickup";
import { CUSTOM_FIELDS, PROJECT_TASK_TYPES } from "@/lib/custom-field-ids";
import {
  stripVersionTokens,
  versionMarkers,
  nameTokens,
  deliverableIdentityTokens,
  emailDomain,
} from "@/lib/portal-labels";
import type { Prisma } from "@prisma/client";
import type { ClickUpTask } from "@/lib/types";

export interface LiveFeedbackTask {
  taskId: string;
  name: string;
  dueMs: number | null;
  /** true while the client still owes feedback (status is not complete/closed) */
  isOpen: boolean;
  /** The deliverable this feedback task belongs to (same parent as its share task). */
  parentTaskId: string | null;
  deliverableType: string;
}

export type LiveFeedbackMap = Record<string /* deliverableType */, LiveFeedbackTask>;
/** Every Feedback Deadline task with a parent, grouped by that parent. */
export type LiveFeedbackByParent = Record<string /* parentTaskId */, LiveFeedbackTask[]>;

/** One "Share X with Client" task: a planned or delivered milestone. */
export interface LiveMilestone {
  taskId: string;
  name: string;
  parentTaskId: string | null;
  parentTaskName: string | null;
  deliverableType: string;
  dueMs: number | null;
  closedMs: number | null;
  isClosed: boolean;
}

export interface LivePayload {
  /** Bumped when the shape changes; older rows are treated as cache misses. */
  version: number;
  feedback: LiveFeedbackMap;
  feedbackByParent: LiveFeedbackByParent;
  /** Ordered by due date, undated last. */
  milestones: LiveMilestone[];
  /** The list's due date (project wrap date). */
  wrapsUpMs: number | null;
  archived: boolean;
  /** Email domains of the list's Project Contact tasks (lowercase, deduped, ours and personal ones excluded). */
  contactDomains: string[];
}

export const LIVE_PAYLOAD_VERSION = 4;

export const EMPTY_LIVE_PAYLOAD: LivePayload = Object.freeze({
  version: LIVE_PAYLOAD_VERSION,
  feedback: {},
  feedbackByParent: {},
  milestones: [],
  wrapsUpMs: null,
  archived: false,
  contactDomains: [],
}) as LivePayload;

const TTL_MS = 5 * 60_000;
/** How many lists fetch from ClickUp at once on a cache miss. */
const FETCH_WIDTH = 4;
const CLOSED_STATUSES = new Set(["complete", "closed", "done"]);
const CLOSED_TYPES = new Set(["closed", "done"]);

function cacheKey(listId: string): string {
  return `portal:fd:${listId}`;
}

function folderCacheKey(folderId: string): string {
  return `portal:folder:${folderId}`;
}

function taskTypeIs(t: ClickUpTask, label: string, optionId: string): boolean {
  const fields = t.custom_fields ?? [];
  const raw = fields.find((f) => f.id === CUSTOM_FIELDS.PROJECT_TASK_TYPE)?.value;
  const got = extractCustomFieldValue(fields, CUSTOM_FIELDS.PROJECT_TASK_TYPE);
  return got === label || String(raw) === optionId;
}

function isClosedTask(t: ClickUpTask): boolean {
  const statusName = (t.status?.status ?? "").toLowerCase();
  const statusType = (t.status?.type ?? "").toLowerCase();
  return CLOSED_STATUSES.has(statusName) || CLOSED_TYPES.has(statusType);
}

function msOrNull(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** True when `entry` should win over `prev`: an open task beats a closed one; among equals the soonest due date. */
function preferred(entry: LiveFeedbackTask, prev: LiveFeedbackTask | undefined): boolean {
  return (
    !prev ||
    (entry.isOpen && !prev.isOpen) ||
    (entry.isOpen === prev.isOpen && (entry.dueMs ?? Infinity) < (prev.dueMs ?? Infinity))
  );
}

function feedbackTasks(tasks: ClickUpTask[]): LiveFeedbackTask[] {
  const out: LiveFeedbackTask[] = [];
  for (const t of tasks) {
    if (!taskTypeIs(t, "Feedback Deadline", PROJECT_TASK_TYPES.FEEDBACK_DEADLINE)) continue;
    const type = extractCustomFieldValue(t.custom_fields ?? [], CUSTOM_FIELDS.DELIVERABLE_TYPE);
    if (!type) continue;
    out.push({
      taskId: t.id,
      name: t.name,
      dueMs: msOrNull(t.due_date),
      isOpen: !isClosedTask(t),
      parentTaskId: t.parent || null,
      deliverableType: type,
    });
  }
  return out;
}

/**
 * Pure: pick one Feedback Deadline task per deliverable type from a list's
 * tasks. An open task beats a closed one; among equals the soonest due date wins.
 */
export function selectFeedbackTasks(tasks: ClickUpTask[]): LiveFeedbackMap {
  const map: LiveFeedbackMap = {};
  for (const entry of feedbackTasks(tasks)) {
    if (preferred(entry, map[entry.deliverableType])) map[entry.deliverableType] = entry;
  }
  return map;
}

/** Pure: every Feedback Deadline task that has a parent, grouped by parent id. */
export function selectFeedbackByParent(tasks: ClickUpTask[]): LiveFeedbackByParent {
  const out: LiveFeedbackByParent = {};
  for (const entry of feedbackTasks(tasks)) {
    if (!entry.parentTaskId) continue;
    (out[entry.parentTaskId] ??= []).push(entry);
  }
  return out;
}

/**
 * Rank candidates for one delivery: open first, then the soonest due date on
 * or after the delivery's send date, then the soonest overall.
 */
function pickForDelivery(candidates: LiveFeedbackTask[], sentAtMs: number | null): LiveFeedbackTask | null {
  const dueRank = (t: LiveFeedbackTask) => {
    if (t.dueMs === null) return [2, Infinity];
    if (sentAtMs !== null && t.dueMs < sentAtMs) return [1, t.dueMs];
    return [0, t.dueMs];
  };
  let best: LiveFeedbackTask | null = null;
  for (const c of candidates) {
    if (!best) {
      best = c;
      continue;
    }
    if (c.isOpen !== best.isOpen) {
      if (c.isOpen) best = c;
      continue;
    }
    const [ca, cb] = dueRank(c);
    const [ba, bb] = dueRank(best);
    if (ca - ba || cb - bb) {
      if (ca < ba || (ca === ba && cb < bb)) best = c;
    }
  }
  return best;
}

function sameType(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export interface PairingDelivery {
  parentTaskId: string | null;
  deliverableType: string;
  shareTaskName?: string | null;
  sentAtMs?: number | null;
}

/**
 * Pure: the Feedback Deadline task that goes with one delivery. Several
 * share tasks in a list can carry the same deliverable type ("Edit V1" for
 * every episode), and a feedback task's type may not equal the delivery's
 * ("LoC Edit V1"), so the delivery's parent decides first. Under the same
 * parent: 1. same type; 2. same type minus version markers; 3. most identity
 * tokens shared between the share task's variant and the feedback task name
 * ("Video" vs "Snippets"); 4. the only feedback task there is; 5. shared
 * version markers between the two types ("V2"), else an open task. Then the
 * list-wide type lookup.
 */
export function pairFeedbackTask(
  live: Pick<LivePayload, "feedback" | "feedbackByParent"> | undefined,
  delivery: PairingDelivery
): LiveFeedbackTask | null {
  if (!live) return null;
  const sentAtMs = delivery.sentAtMs ?? null;
  const siblings = delivery.parentTaskId ? live.feedbackByParent[delivery.parentTaskId] ?? [] : [];
  if (siblings.length > 0) {
    // 1. Same parent, same type.
    const exact = pickForDelivery(siblings.filter((t) => sameType(t.deliverableType, delivery.deliverableType)), sentAtMs);
    if (exact) return exact;
    // 2. Same parent, same type minus version markers.
    const stem = stripVersionTokens(delivery.deliverableType);
    const loose = pickForDelivery(siblings.filter((t) => stripVersionTokens(t.deliverableType) === stem), sentAtMs);
    if (loose) return loose;
    // 3. Same parent, most identity tokens in common with the feedback task name.
    const tokens = new Set(deliverableIdentityTokens(delivery.shareTaskName ?? null, delivery.deliverableType));
    if (tokens.size > 0) {
      let bestScore = 0;
      let bestSet: LiveFeedbackTask[] = [];
      for (const t of siblings) {
        const score = nameTokens(t.name).filter((w) => tokens.has(w)).length;
        if (score > bestScore) {
          bestScore = score;
          bestSet = [t];
        } else if (score === bestScore && score > 0) {
          bestSet.push(t);
        }
      }
      const byTokens = pickForDelivery(bestSet, sentAtMs);
      if (byTokens) return byTokens;
    }
    // 4. Same parent, only one feedback task.
    if (siblings.length === 1) return siblings[0];
    // 5. Same parent, nothing to compare by name: shared version markers, else an open task.
    if (tokens.size === 0) {
      const markers = new Set(versionMarkers(delivery.deliverableType));
      const byVersion = pickForDelivery(
        siblings.filter((t) => versionMarkers(t.deliverableType).some((m) => markers.has(m))),
        sentAtMs
      );
      if (byVersion) return byVersion;
      const open = pickForDelivery(siblings.filter((t) => t.isOpen), sentAtMs);
      if (open) return open;
    }
  }
  return live.feedback[delivery.deliverableType] ?? null;
}

/**
 * Pure: every Delivery Deadline (share) task in a list as a milestone,
 * ordered by due date with undated ones last. Parent names are filled in by
 * the fetch (`parentTaskName` is null here).
 */
export function selectMilestones(tasks: ClickUpTask[]): LiveMilestone[] {
  const out: LiveMilestone[] = [];
  for (const t of tasks) {
    if (!taskTypeIs(t, "Delivery Deadline", PROJECT_TASK_TYPES.DELIVERY_DEADLINE)) continue;
    const isClosed = isClosedTask(t);
    out.push({
      taskId: t.id,
      name: t.name,
      parentTaskId: t.parent || null,
      parentTaskName: null,
      deliverableType: extractCustomFieldValue(t.custom_fields ?? [], CUSTOM_FIELDS.DELIVERABLE_TYPE) || "",
      dueMs: msOrNull(t.due_date),
      closedMs: isClosed ? msOrNull(t.date_closed) ?? msOrNull(t.date_done) : null,
      isClosed,
    });
  }
  out.sort(
    (a, b) =>
      (a.dueMs ?? Infinity) - (b.dueMs ?? Infinity) ||
      a.name.localeCompare(b.name) ||
      a.taskId.localeCompare(b.taskId)
  );
  return out;
}

/**
 * Pure: the client email domains on a list's Project Contact tasks, in
 * first-seen order, deduped, without ours or personal mailbox domains.
 */
export function selectContactDomains(tasks: ClickUpTask[]): string[] {
  const out: string[] = [];
  for (const t of tasks) {
    if (!taskTypeIs(t, "Project Contact", PROJECT_TASK_TYPES.PROJECT_CONTACT)) continue;
    const domain = emailDomain(extractCustomFieldValue(t.custom_fields ?? [], CUSTOM_FIELDS.CONTACT_EMAIL));
    if (domain && !out.includes(domain)) out.push(domain);
  }
  return out;
}

/**
 * Run `fn` over `items` with at most `width` in flight. Results keep the
 * input order; a rejection is captured, never thrown.
 */
export async function runPool<T, R>(
  items: T[],
  width: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      const [r] = await Promise.allSettled([fn(items[i])]);
      results[i] = r;
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker));
  return results;
}

interface CacheRow {
  key: string;
  data: unknown;
  updatedAt: Date;
}

function isFresh(row: CacheRow): boolean {
  return Date.now() - row.updatedAt.getTime() < TTL_MS;
}

/** The cached payload, or null when the row predates the current shape. */
function rowData(row: CacheRow): LivePayload | null {
  const d = row.data as Partial<LivePayload> | null;
  if (!d || d.version !== LIVE_PAYLOAD_VERSION) return null;
  return {
    version: LIVE_PAYLOAD_VERSION,
    feedback: d.feedback ?? {},
    feedbackByParent: d.feedbackByParent ?? {},
    milestones: d.milestones ?? [],
    wrapsUpMs: d.wrapsUpMs ?? null,
    archived: Boolean(d.archived),
    contactDomains: d.contactDomains ?? [],
  };
}

async function readCacheRow(key: string): Promise<CacheRow | null> {
  try {
    return await prisma.dashboardCache.findUnique({ where: { key } });
  } catch {
    return null; // DB optional
  }
}

async function writeCacheRow(key: string, payload: unknown): Promise<void> {
  try {
    const data = payload as Prisma.InputJsonObject;
    await prisma.dashboardCache.upsert({
      where: { key },
      create: { key, data },
      update: { data },
    });
  } catch {
    /* ignore: the cache is an optimization */
  }
}

async function readRows(listIds: string[]): Promise<Map<string, CacheRow>> {
  const out = new Map<string, CacheRow>();
  if (listIds.length === 0) return out;
  try {
    const rows = await prisma.dashboardCache.findMany({
      where: { key: { in: listIds.map(cacheKey) } },
    });
    for (const r of rows) out.set(r.key, r);
  } catch {
    /* DB optional */
  }
  return out;
}

/**
 * Parent task names for the milestones, one getTask per distinct parent.
 * A failed lookup leaves that name null; the roadmap still renders from the
 * share task name.
 */
async function fillParentNames(milestones: LiveMilestone[]): Promise<void> {
  const ids = Array.from(new Set(milestones.map((m) => m.parentTaskId).filter(Boolean) as string[]));
  const results = await runPool(ids, FETCH_WIDTH, async (id) => (await getTask(id)).name);
  const names = new Map<string, string>();
  ids.forEach((id, i) => {
    const r = results[i];
    if (r.status === "fulfilled" && r.value) names.set(id, r.value);
    else console.warn(`parent task name lookup failed for ${id}`, r.status === "rejected" ? r.reason : "");
  });
  for (const m of milestones) {
    if (m.parentTaskId) m.parentTaskName = names.get(m.parentTaskId) ?? null;
  }
}

/** Fetch from ClickUp and store. Throws when ClickUp fails. */
async function fetchAndStore(listId: string): Promise<LivePayload> {
  // Closed tasks are included on purpose: a completed Feedback Deadline task
  // is how the team marks feedback as received, and completed share tasks are
  // the delivered part of the roadmap.
  const [fd, dd, contacts, list] = await Promise.all([
    getListTasksByDropdownField(
      listId,
      CUSTOM_FIELDS.PROJECT_TASK_TYPE,
      PROJECT_TASK_TYPES.FEEDBACK_DEADLINE,
      true
    ),
    getListTasksByDropdownField(
      listId,
      CUSTOM_FIELDS.PROJECT_TASK_TYPE,
      PROJECT_TASK_TYPES.DELIVERY_DEADLINE,
      true
    ),
    getListTasksByDropdownField(
      listId,
      CUSTOM_FIELDS.PROJECT_TASK_TYPE,
      PROJECT_TASK_TYPES.PROJECT_CONTACT,
      true
    ),
    getList(listId),
  ]);
  const milestones = selectMilestones(dd.tasks);
  await fillParentNames(milestones);
  const payload: LivePayload = {
    version: LIVE_PAYLOAD_VERSION,
    feedback: selectFeedbackTasks(fd.tasks),
    feedbackByParent: selectFeedbackByParent(fd.tasks),
    milestones,
    wrapsUpMs: msOrNull(list.due_date),
    archived: Boolean(list.archived),
    contactDomains: selectContactDomains(contacts.tasks),
  };
  await writeCacheRow(cacheKey(listId), payload);
  return payload;
}

/** Fetch, falling back to `stale` (or an empty payload) with a warning when ClickUp fails. */
async function refresh(listId: string, stale: LivePayload | null): Promise<LivePayload> {
  try {
    return await fetchAndStore(listId);
  } catch (err) {
    console.warn(
      `live feedback fetch failed for ${listId}, serving ${stale ? "stale cache" : "nothing"}`,
      err
    );
    return stale ?? EMPTY_LIVE_PAYLOAD;
  }
}

/**
 * Refresh after the response is sent, all lists through one bounded pool so
 * a client whose projects expire together does not burst N ClickUp calls.
 * Outside a request scope, fire and forget.
 */
function scheduleRefresh(listIds: string[]): void {
  if (listIds.length === 0) return;
  const run = async () => {
    await runPool(listIds, FETCH_WIDTH, (id) => refresh(id, null));
  };
  try {
    after(run);
  } catch {
    void run();
  }
}

/** @internal exported for tests; production reads go through getLiveFeedbackMany. */
export async function getLiveFeedback(listId: string, force = false): Promise<LivePayload> {
  const row = await readCacheRow(cacheKey(listId));
  const cached = row ? rowData(row) : null;
  if (row && cached && !force) {
    if (isFresh(row)) return cached;
    scheduleRefresh([listId]);
    return cached;
  }
  return refresh(listId, cached);
}

/**
 * Same as getLiveFeedback for many lists: one cache read, misses (and rows
 * from an older payload version) fetched with bounded concurrency. Blank
 * ids (ad-hoc deliveries) are skipped.
 */
export async function getLiveFeedbackMany(
  listIds: string[]
): Promise<Record<string, LivePayload>> {
  const ids = Array.from(new Set(listIds.filter(Boolean)));
  const rows = await readRows(ids);
  const out: Record<string, LivePayload> = {};
  const misses: string[] = [];
  const stale: string[] = [];
  for (const id of ids) {
    const row = rows.get(cacheKey(id));
    const cached = row ? rowData(row) : null;
    if (!row || !cached) {
      misses.push(id);
      continue;
    }
    out[id] = cached;
    if (!isFresh(row)) stale.push(id);
  }
  scheduleRefresh(stale);
  const fetched = await runPool(misses, FETCH_WIDTH, (id) => refresh(id, null));
  misses.forEach((id, i) => {
    const r = fetched[i];
    out[id] = r.status === "fulfilled" ? r.value : EMPTY_LIVE_PAYLOAD;
  });
  return out;
}

/** One list in a client folder, as the portal needs it. */
export interface FolderList {
  id: string;
  name: string;
}

interface FolderPayload {
  version: number;
  lists: FolderList[];
}

/** Bumped when the shape changes; older rows are treated as cache misses. */
export const FOLDER_PAYLOAD_VERSION = 1;

/** The cached list index, or null when the row predates the current shape. */
function folderRowData(row: CacheRow): FolderList[] | null {
  const d = row.data as Partial<FolderPayload> | null;
  if (!d || d.version !== FOLDER_PAYLOAD_VERSION || !Array.isArray(d.lists)) return null;
  return d.lists
    .filter((l) => l && typeof l.id === "string" && l.id !== "")
    .map((l) => ({ id: l.id, name: typeof l.name === "string" ? l.name : "" }));
}

/** Fetch the folder's active lists from ClickUp and store them. Throws when ClickUp fails. */
async function fetchAndStoreFolder(folderId: string): Promise<FolderList[]> {
  const { lists } = await getFolderLists(folderId, false);
  const out = lists.map((l) => ({ id: l.id, name: l.name }));
  const payload: FolderPayload = { version: FOLDER_PAYLOAD_VERSION, lists: out };
  await writeCacheRow(folderCacheKey(folderId), payload);
  return out;
}

async function refreshFolder(folderId: string, stale: FolderList[] | null): Promise<FolderList[]> {
  try {
    return await fetchAndStoreFolder(folderId);
  } catch (err) {
    console.warn(
      `folder list fetch failed for ${folderId}, serving ${stale ? "stale cache" : "nothing"}`,
      err
    );
    return stale ?? [];
  }
}

/**
 * The client folder's active (non-archived) lists, cached beside the live
 * payloads under `portal:folder:<folderId>` with the same 5 minute TTL and
 * stale-while-revalidate treatment, so a portal render does not hit ClickUp
 * for the folder on every request. Never throws: a failing fetch serves the
 * stale row, else nothing (the portal then falls back to delivery-derived
 * projects alone).
 *
 * Archived lists are deliberately not listed: a client can have a dozen of
 * them and their roadmaps are history, so completed projects stay
 * delivery-driven.
 */
export async function getClientFolderLists(folderId: string): Promise<FolderList[]> {
  if (!folderId) return [];
  const row = await readCacheRow(folderCacheKey(folderId));
  const cached = row ? folderRowData(row) : null;
  if (row && cached) {
    if (isFresh(row)) return cached;
    const run = async () => {
      await refreshFolder(folderId, null);
    };
    try {
      after(run);
    } catch {
      void run();
    }
    return cached;
  }
  return refreshFolder(folderId, cached);
}

export async function invalidateLiveFeedback(listId: string): Promise<void> {
  try {
    await prisma.dashboardCache.delete({ where: { key: cacheKey(listId) } });
  } catch {
    /* ignore */
  }
}
