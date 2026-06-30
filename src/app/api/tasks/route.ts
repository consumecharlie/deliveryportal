import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  getSpaceTasksByDropdownField,
  extractCustomFieldValue,
} from "@/lib/clickup";
import { SPACES, CUSTOM_FIELDS, PROJECT_TASK_TYPES } from "@/lib/custom-field-ids";
import type { DeliverableTask } from "@/lib/types";

const TASKS_CACHE_TAG = "dashboard-tasks";
const TASKS_REVALIDATE_SECONDS = 5 * 60; // 5 minutes

/**
 * Fetch the non-complete Delivery Deadline tasks for the dashboard, mapped to
 * the shape the table needs. Hits ClickUp; no caching here.
 */
async function fetchDeliverables(): Promise<DeliverableTask[]> {
  // Ask ClickUp for only the Delivery Deadline tasks in the Projects space
  // (server-side custom-field filter), instead of pulling every task from
  // every list and discarding non-deliverables client-side. This collapses
  // ~23 pages across ~30 lists (~2,200 tasks) into ~3 pages of matches.
  const { tasks } = await getSpaceTasksByDropdownField(
    SPACES.PROJECTS,
    CUSTOM_FIELDS.PROJECT_TASK_TYPE,
    PROJECT_TASK_TYPES.DELIVERY_DEADLINE,
    true
  );

  const deliverables: DeliverableTask[] = [];

  for (const task of tasks) {
    // Exclude completed/closed tasks
    const status = task.status.status.toLowerCase();
    if (status === "complete" || status === "closed") continue;

    const deliverableType =
      extractCustomFieldValue(
        task.custom_fields,
        CUSTOM_FIELDS.DELIVERABLE_TYPE
      ) ?? "";

    const department =
      extractCustomFieldValue(
        task.custom_fields,
        CUSTOM_FIELDS.DEPARTMENT
      ) ?? "";

    deliverables.push({
      id: task.id,
      name: task.name,
      status: task.status.status,
      statusColor: task.status.color,
      assignee: task.assignees[0]
        ? {
            id: task.assignees[0].id,
            name: task.assignees[0].username,
            email: task.assignees[0].email,
            avatar: task.assignees[0].profilePicture,
          }
        : undefined,
      dueDate: task.due_date,
      // The Filtered Team Tasks endpoint returns each task's parent folder
      // (client) and list (project) inline.
      clientName: task.folder?.name ?? "",
      projectName: task.list?.name ?? "",
      deliverableType,
      department,
      listId: task.list?.id ?? "",
      folderId: task.folder?.id ?? "",
      clickUpUrl: task.url,
    });
  }

  // Sort by due date (soonest first), nulls last
  deliverables.sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return Number(a.dueDate) - Number(b.dueDate);
  });

  return deliverables;
}

// Vercel Data Cache wrapper: persists the mapped result across serverless
// invocations (survives cold starts, unlike a module-level variable) without
// touching Neon. Stale-while-revalidate — after the 5-min window, the next
// request is served the cached copy while the refresh runs in the background.
// The cache is reset on each deploy (first load after a deploy pays the full
// ClickUp fetch) and can be busted on demand via `?refresh=1`.
const getCachedDeliverables = unstable_cache(
  fetchDeliverables,
  ["dashboard-deliverables"],
  { revalidate: TASKS_REVALIDATE_SECONDS, tags: [TASKS_CACHE_TAG] }
);

/**
 * GET /api/tasks
 *
 * Returns the non-complete Delivery Deadline tasks from the Projects space.
 * Cached via the Vercel Data Cache; pass `?refresh=1` to force a fresh pull.
 */
export async function GET(req: Request) {
  try {
    const forceRefresh =
      new URL(req.url).searchParams.get("refresh") === "1";

    if (forceRefresh) {
      // Bypass the cache and pull straight from ClickUp for this response. The
      // shared cached entry refreshes on its normal 5-min cycle afterward.
      const tasks = await fetchDeliverables();
      return NextResponse.json({ tasks });
    }

    const tasks = await getCachedDeliverables();
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}
