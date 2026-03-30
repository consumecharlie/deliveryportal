import { NextResponse } from "next/server";
import {
  getSpaceFolders,
  getFolderlessLists,
  getListTasks,
  extractCustomFieldValue,
} from "@/lib/clickup";
import {
  SPACES,
  CUSTOM_FIELDS,
  PROJECT_TASK_TYPES,
} from "@/lib/custom-field-ids";
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

    // Get all folders (clients) and folderless lists in the Projects space
    const [foldersRes, folderlessRes] = await Promise.all([
      getSpaceFolders(SPACES.PROJECTS),
      getFolderlessLists(SPACES.PROJECTS),
    ]);

    // Collect all list IDs with their parent folder (client) info
    const listMeta: Array<{
      listId: string;
      listName: string;
      folderId: string;
      folderName: string;
    }> = [];

    for (const folder of foldersRes.folders) {
      for (const list of folder.lists) {
        listMeta.push({
          listId: list.id,
          listName: list.name,
          folderId: folder.id,
          folderName: folder.name,
        });
      }
    }

    for (const list of folderlessRes.lists) {
      listMeta.push({
        listId: list.id,
        listName: list.name,
        folderId: "",
        folderName: "",
      });
    }

    // Fetch tasks from all lists in parallel (batched to avoid rate limits)
    const BATCH_SIZE = 25;
    const deliverables: DeliverableTask[] = [];

    for (let i = 0; i < listMeta.length; i += BATCH_SIZE) {
      const batch = listMeta.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((meta) => getListTasks(meta.listId, true))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const meta = batch[j];
        if (result.status !== "fulfilled") continue;

        for (const task of result.value.tasks) {
          // Filter: only Delivery Deadline tasks
          const taskType = extractCustomFieldValue(
            task.custom_fields,
            CUSTOM_FIELDS.PROJECT_TASK_TYPE
          );

          // Check if this is a Delivery Deadline by comparing the value
          // The field stores orderindex, so we check the resolved name
          const isDeliveryDeadline =
            taskType === "Delivery Deadline" ||
            task.custom_fields.some(
              (f) =>
                f.id === CUSTOM_FIELDS.PROJECT_TASK_TYPE &&
                String(f.value) === PROJECT_TASK_TYPES.DELIVERY_DEADLINE
            );

          if (!isDeliveryDeadline) continue;

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
            clientName: meta.folderName,
            projectName: meta.listName,
            deliverableType,
            department,
            listId: meta.listId,
            folderId: meta.folderId,
            clickUpUrl: task.url,
          });
        }
      }
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
