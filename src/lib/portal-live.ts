/**
 * Live ClickUp feedback-deadline state per project list, cached in
 * DashboardCache. The client portal spans many lists per client and ClickUp
 * is slow, so a page render never waits on ClickUp when any cached copy
 * exists: a fresh row is served as is, a stale row is served immediately and
 * refreshed after the response (stale-while-revalidate), and only a total
 * miss fetches inline. A failing fetch never throws; it falls back to the
 * stale row or an empty map.
 */
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { getListTasksByDropdownField, extractCustomFieldValue } from "@/lib/clickup";
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

const TTL_MS = 5 * 60_000;
/** How many lists fetch from ClickUp at once on a cache miss. */
const FETCH_WIDTH = 4;
const CLOSED_STATUSES = new Set(["complete", "closed", "done"]);
const CLOSED_TYPES = new Set(["closed", "done"]);

function cacheKey(listId: string): string {
  return `portal:fd:${listId}`;
}

/**
 * Pure: pick one Feedback Deadline task per deliverable type from a list's
 * tasks. An open task beats a closed one; among equals the soonest due date wins.
 */
export function selectFeedbackTasks(tasks: ClickUpTask[]): LiveFeedbackMap {
  const map: LiveFeedbackMap = {};
  for (const t of tasks) {
    const fields = t.custom_fields ?? [];
    const raw = fields.find((f) => f.id === CUSTOM_FIELDS.PROJECT_TASK_TYPE)?.value;
    const label = extractCustomFieldValue(fields, CUSTOM_FIELDS.PROJECT_TASK_TYPE);
    const isFd =
      label === "Feedback Deadline" || String(raw) === PROJECT_TASK_TYPES.FEEDBACK_DEADLINE;
    if (!isFd) continue;
    const type = extractCustomFieldValue(fields, CUSTOM_FIELDS.DELIVERABLE_TYPE);
    if (!type) continue;
    const statusName = (t.status?.status ?? "").toLowerCase();
    const statusType = (t.status?.type ?? "").toLowerCase();
    const entry: LiveFeedbackTask = {
      taskId: t.id,
      name: t.name,
      dueMs: t.due_date ? Number(t.due_date) : null,
      isOpen: !CLOSED_STATUSES.has(statusName) && !CLOSED_TYPES.has(statusType),
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

function rowData(row: CacheRow): LiveFeedbackMap {
  return (row.data ?? {}) as LiveFeedbackMap;
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

/** Fetch from ClickUp and store. Throws when ClickUp fails. */
async function fetchAndStore(listId: string): Promise<LiveFeedbackMap> {
  // Closed tasks are included on purpose: a completed Feedback Deadline task
  // is how the team marks feedback as received, and the portal must see it.
  const { tasks } = await getListTasksByDropdownField(
    listId,
    CUSTOM_FIELDS.PROJECT_TASK_TYPE,
    PROJECT_TASK_TYPES.FEEDBACK_DEADLINE,
    true
  );
  const map = selectFeedbackTasks(tasks);
  try {
    const key = cacheKey(listId);
    const data = map as unknown as Prisma.InputJsonObject;
    await prisma.dashboardCache.upsert({
      where: { key },
      create: { key, data },
      update: { data },
    });
  } catch {
    /* ignore: the cache is an optimization */
  }
  return map;
}

/** Fetch, falling back to `stale` (or an empty map) with a warning when ClickUp fails. */
async function refresh(listId: string, stale: LiveFeedbackMap | null): Promise<LiveFeedbackMap> {
  try {
    return await fetchAndStore(listId);
  } catch (err) {
    console.warn(
      `live feedback fetch failed for ${listId}, serving ${stale ? "stale cache" : "nothing"}`,
      err
    );
    return stale ?? {};
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
export async function getLiveFeedback(listId: string, force = false): Promise<LiveFeedbackMap> {
  const row = await readRow(listId);
  const cached = row ? rowData(row) : null;
  if (row && !force) {
    if (isFresh(row)) return cached!;
    scheduleRefresh([listId]);
    return cached!;
  }
  return refresh(listId, cached);
}

/**
 * Same as getLiveFeedback for many lists: one cache read, misses fetched
 * with bounded concurrency. Blank ids (ad-hoc deliveries) are skipped.
 */
export async function getLiveFeedbackMany(
  listIds: string[]
): Promise<Record<string, LiveFeedbackMap>> {
  const ids = Array.from(new Set(listIds.filter(Boolean)));
  const rows = await readRows(ids);
  const out: Record<string, LiveFeedbackMap> = {};
  const misses: string[] = [];
  const stale: string[] = [];
  for (const id of ids) {
    const row = rows.get(cacheKey(id));
    if (!row) {
      misses.push(id);
      continue;
    }
    out[id] = rowData(row);
    if (!isFresh(row)) stale.push(id);
  }
  scheduleRefresh(stale);
  const fetched = await runPool(misses, FETCH_WIDTH, (id) => refresh(id, null));
  misses.forEach((id, i) => {
    const r = fetched[i];
    out[id] = r.status === "fulfilled" ? r.value : {};
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
