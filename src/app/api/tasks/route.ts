import { NextResponse } from "next/server";
import {
  getSpaceTasksByDropdownField,
  extractCustomFieldValue,
} from "@/lib/clickup";
import { SPACES, CUSTOM_FIELDS, PROJECT_TASK_TYPES } from "@/lib/custom-field-ids";
import type { DeliverableTask } from "@/lib/types";

let tasksCache: { data: DeliverableTask[]; timestamp: number } | null = null;
const TASKS_CACHE_TTL = 3 * 60_000; // 3 minutes

/**
 * GET /api/tasks
 *
 * Fetches all Delivery Deadline tasks from the Projects space
 * that are not complete/closed.
 */
export async function GET() {
  try {
    if (tasksCache && Date.now() - tasksCache.timestamp < TASKS_CACHE_TTL) {
      return NextResponse.json({ tasks: tasksCache.data });
    }

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

    tasksCache = { data: deliverables, timestamp: Date.now() };
    return NextResponse.json({ tasks: deliverables });
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}
