import { NextResponse } from "next/server";
import {
  getList,
  getFolderLists,
  getListTasks,
  extractCustomFieldValue,
} from "@/lib/clickup";
import {
  CUSTOM_FIELDS,
  PROJECT_TASK_TYPES,
} from "@/lib/custom-field-ids";

interface EligibleProject {
  listId: string;
  projectName: string;
  clientName: string;
  primaryContactName: string;
  primaryContactEmail: string;
  hasActiveDeliveryDeadlines: boolean;
}

/**
 * GET /api/projects/[listId]/eligible-addons
 *
 * Returns sibling projects (same client folder) that share the same primary
 * contact as the given project. Used to power the "Add Project" button in
 * the delivery editor.
 *
 * Matching is resilient: compares by email (case-insensitive) OR by name
 * (case-insensitive, trimmed). This handles Slack-only projects that may
 * not have email populated, as well as email-only projects without Slack IDs.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ listId: string }> }
) {
  const { listId } = await params;

  try {
    // Get current project's folder info
    const listInfo = await getList(listId);
    const folderId = listInfo.folder.id;
    const clientName = listInfo.folder.name;

    if (!folderId || folderId === "0") {
      return NextResponse.json({ projects: [] });
    }

    // Get sibling lists in the same client folder
    const folderListsRes = await getFolderLists(folderId);
    const siblingLists = folderListsRes.lists.filter(
      (l) => l.id !== listId
    );
    if (siblingLists.length === 0) {
      return NextResponse.json({ projects: [] });
    }

    // Fetch current project's contacts to find primary
    const currentTasksRes = await getListTasks(listId, true);
    let currentPrimaryEmail = "";
    let currentPrimaryName = "";

    for (const task of currentTasksRes.tasks) {
      const rawType = task.custom_fields.find(
        (f) => f.id === CUSTOM_FIELDS.PROJECT_TASK_TYPE
      )?.value;
      const taskType = extractCustomFieldValue(
        task.custom_fields,
        CUSTOM_FIELDS.PROJECT_TASK_TYPE
      );

      const isContact =
        taskType === "Project Contact" ||
        String(rawType) === PROJECT_TASK_TYPES.PROJECT_CONTACT;
      if (!isContact) continue;

      const role =
        extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.CONTACT_ROLE) ?? "";
      if (role !== "Primary") continue;

      currentPrimaryEmail = (
        extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.CONTACT_EMAIL) ?? ""
      ).toLowerCase().trim();
      currentPrimaryName = (
        extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.CONTACT_FIRST_NAME) ??
        task.name
      ).toLowerCase().trim();
      break;
    }

    if (!currentPrimaryEmail && !currentPrimaryName) {
      return NextResponse.json({ projects: [] });
    }

    // Check each sibling project for matching primary contact
    const eligible: EligibleProject[] = [];
    const BATCH_SIZE = 10;

    for (let i = 0; i < siblingLists.length; i += BATCH_SIZE) {
      const batch = siblingLists.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (sibList) => {
          const tasksRes = await getListTasks(sibList.id, true);
          let primaryEmail = "";
          let primaryName = "";
          let hasActiveDeliveryDeadlines = false;

          for (const task of tasksRes.tasks) {
            const rawType = task.custom_fields.find(
              (f) => f.id === CUSTOM_FIELDS.PROJECT_TASK_TYPE
            )?.value;
            const taskType = extractCustomFieldValue(
              task.custom_fields,
              CUSTOM_FIELDS.PROJECT_TASK_TYPE
            );

            const isContact =
              taskType === "Project Contact" ||
              String(rawType) === PROJECT_TASK_TYPES.PROJECT_CONTACT;
            const isDeliveryDeadline =
              taskType === "Delivery Deadline" ||
              String(rawType) === PROJECT_TASK_TYPES.DELIVERY_DEADLINE;

            if (isContact) {
              const role =
                extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.CONTACT_ROLE) ?? "";
              if (role === "Primary") {
                primaryEmail = (
                  extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.CONTACT_EMAIL) ?? ""
                ).toLowerCase().trim();
                primaryName = (
                  extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.CONTACT_FIRST_NAME) ??
                  task.name
                ).toLowerCase().trim();
              }
            }

            if (isDeliveryDeadline) {
              const status = task.status.status.toLowerCase();
              if (status !== "complete" && status !== "closed") {
                hasActiveDeliveryDeadlines = true;
              }
            }
          }

          const emailMatch =
            currentPrimaryEmail &&
            primaryEmail &&
            currentPrimaryEmail === primaryEmail;
          const nameMatch =
            currentPrimaryName &&
            primaryName &&
            currentPrimaryName === primaryName;

          if (emailMatch || nameMatch) {
            return {
              listId: sibList.id,
              projectName: sibList.name,
              clientName,
              primaryContactName: primaryName || primaryEmail,
              primaryContactEmail: primaryEmail,
              hasActiveDeliveryDeadlines,
            } as EligibleProject;
          }
          return null;
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          eligible.push(result.value);
        }
      }
    }

    return NextResponse.json({ projects: eligible });
  } catch (error) {
    console.error("Failed to fetch eligible add-on projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch eligible add-on projects" },
      { status: 500 }
    );
  }
}
