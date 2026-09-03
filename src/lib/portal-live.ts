/**
 * Live ClickUp state per project list, cached in DashboardCache: the
 * Feedback Deadline tasks (type 12) that decide review deadlines, the
 * Delivery Deadline share tasks (type 11) that make up the project's
 * roadmap, and the list's own due date / archived flag.
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
  getList,
  getTask,
  extractCustomFieldValue,
} from "@/lib/clickup";
import { CUSTOM_FIELDS, PROJECT_TASK_TYPES } from "@/lib/custom-field-ids";
import type { Prisma } from "@prisma/client";
import type { ClickUpTask } from "@/lib/types";

export interface LiveFeedbackTask {
  taskId: string;
  name: string;
  dueMs: number | null;
  /** true while the client still owes feedback (status is not complete/closed) */
  isOpen: boolean;
}

export type LiveFeedbackMap = Record<string /* deliverableType */, LiveFeedbackTask>;

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
  /** Ordered by due date, undated last. */
  milestones: LiveMilestone[];
  /** The list's due date (project wrap date). */
  wrapsUpMs: number | null;
  archived: boolean;
}

export const LIVE_PAYLOAD_VERSION = 2;

export const EMPTY_LIVE_PAYLOAD: LivePayload = Object.freeze({
  version: LIVE_PAYLOAD_VERSION,
  feedback: {},
  milestones: [],
  wrapsUpMs: null,
  archived: false,
}) as LivePayload;

const TTL_MS = 5 * 60_000;
/** How many lists fetch from ClickUp at once on a cache miss. */
const FETCH_WIDTH = 4;
const CLOSED_STATUSES = new Set(["complete", "closed", "done"]);
const CLOSED_TYPES = new Set(["closed", "done"]);

function cacheKey(listId: string): string {
  return `portal:fd:${listId}`;
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

/**
 * Pure: pick one Feedback Deadline task per deliverable type from a list's
 * tasks. An open task beats a closed one; among equals the soonest due date wins.
 */
export function selectFeedbackTasks(tasks: ClickUpTask[]): LiveFeedbackMap {
  const map: LiveFeedbackMap = {};
  for (const t of tasks) {
    if (!taskTypeIs(t, "Feedback Deadline", PROJECT_TASK_TYPES.FEEDBACK_DEADLINE)) continue;
    const type = extractCustomFieldValue(t.custom_fields ?? [], CUSTOM_FIELDS.DELIVERABLE_TYPE);
    if (!type) continue;
    const entry: LiveFeedbackTask = {
      taskId: t.id,
      name: t.name,
      dueMs: msOrNull(t.due_date),
      isOpen: !isClosedTask(t),
    };
    const prev = map[type];
    if (
      !prev ||
      (entry.isOpen && !prev.isOpen) ||
      (entry.isOpen === prev.isOpen && (entry.dueMs ?? Infinity) < (prev.dueMs ?? Infinity))
    ) {
      map[type] = entry;
    }
  }
  return map;
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
    milestones: d.milestones ?? [],
    wrapsUpMs: d.wrapsUpMs ?? null,
    archived: Boolean(d.archived),
  };
}

async function readRow(listId: string): Promise<CacheRow | null> {
  try {
    return await prisma.dashboardCache.findUnique({ where: { key: cacheKey(listId) } });
  } catch {
    return null; // DB optional
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
  const [fd, dd, list] = await Promise.all([
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
    getList(listId),
  ]);
  const milestones = selectMilestones(dd.tasks);
  await fillParentNames(milestones);
  const payload: LivePayload = {
    version: LIVE_PAYLOAD_VERSION,
    feedback: selectFeedbackTasks(fd.tasks),
    milestones,
    wrapsUpMs: msOrNull(list.due_date),
    archived: Boolean(list.archived),
  };
  try {
    const key = cacheKey(listId);
    const data = payload as unknown as Prisma.InputJsonObject;
    await prisma.dashboardCache.upsert({
      where: { key },
      create: { key, data },
      update: { data },
    });
  } catch {
    /* ignore: the cache is an optimization */
  }
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
  const row = await readRow(listId);
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

export async function invalidateLiveFeedback(listId: string): Promise<void> {
  try {
    await prisma.dashboardCache.delete({ where: { key: cacheKey(listId) } });
  } catch {
    /* ignore */
  }
}
