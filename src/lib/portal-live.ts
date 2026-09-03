/**
 * Live ClickUp feedback-deadline state per project list, cached in
 * DashboardCache for a few minutes. The client portal spans many lists per
 * client and ClickUp is slow, so every page render must not fan out to it.
 */
import { prisma } from "@/lib/db";
import { getListTasks, extractCustomFieldValue } from "@/lib/clickup";
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

export async function getLiveFeedback(listId: string, force = false): Promise<LiveFeedbackMap> {
  const key = cacheKey(listId);
  if (!force) {
    try {
      const cached = await prisma.dashboardCache.findUnique({ where: { key } });
      if (cached && Date.now() - cached.updatedAt.getTime() < TTL_MS) {
        return cached.data as unknown as LiveFeedbackMap;
      }
    } catch {
      /* DB optional */
    }
  }

  // Closed tasks are included on purpose: a completed Feedback Deadline task
  // is how the team marks feedback as received, and the portal must see it.
  const { tasks } = await getListTasks(listId, true, true);
  const map = selectFeedbackTasks(tasks);

  try {
    const data = map as unknown as Prisma.InputJsonObject;
    await prisma.dashboardCache.upsert({
      where: { key },
      create: { key, data },
      update: { data },
    });
  } catch {
    /* ignore */
  }
  return map;
}

export async function invalidateLiveFeedback(listId: string): Promise<void> {
  try {
    await prisma.dashboardCache.delete({ where: { key: cacheKey(listId) } });
  } catch {
    /* ignore */
  }
}
