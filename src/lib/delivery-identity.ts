/**
 * Identity of the deliverable behind a share task. A "Share X with Client"
 * task's parent names the real deliverable ("LOC19: Intuit"); the share
 * task's own name carries the variant ("Share Snippets Edit01 with Client").
 * Best effort: a ClickUp failure yields nulls, never throws.
 */
import { getTask } from "@/lib/clickup";

export interface ShareIdentity {
  shareTaskName: string | null;
  parentTaskId: string | null;
  parentTaskName: string | null;
}

export const EMPTY_IDENTITY: ShareIdentity = {
  shareTaskName: null,
  parentTaskId: null,
  parentTaskName: null,
};

/** Parent task id -> name (null when the lookup failed). Share across calls to avoid refetching. */
export type ParentNameCache = Map<string, string | null>;

export async function resolveParentName(
  parentTaskId: string,
  cache?: ParentNameCache
): Promise<string | null> {
  if (cache?.has(parentTaskId)) return cache.get(parentTaskId) ?? null;
  let name: string | null = null;
  try {
    name = (await getTask(parentTaskId)).name || null;
  } catch (err) {
    console.warn("Could not resolve parent task name for", parentTaskId, err);
  }
  cache?.set(parentTaskId, name);
  return name;
}

/**
 * Resolve the share task's name and parent for a delivery row. One getTask for
 * the share task, one more for its parent when present (cached per id).
 */
export async function resolveShareIdentity(
  taskId: string,
  cache?: ParentNameCache
): Promise<ShareIdentity> {
  try {
    const task = await getTask(taskId);
    const parentTaskId = task.parent || null;
    return {
      shareTaskName: task.name || null,
      parentTaskId,
      parentTaskName: parentTaskId ? await resolveParentName(parentTaskId, cache) : null,
    };
  } catch (err) {
    console.warn("Could not resolve share task identity for", taskId, err);
    return EMPTY_IDENTITY;
  }
}
