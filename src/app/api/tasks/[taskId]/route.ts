import { NextResponse } from "next/server";
import {
  getTask,
  getListTasks,
  updateTaskCustomField,
  extractCustomFieldValue,
  extractCustomFieldUrl,
} from "@/lib/clickup";
import {
  CUSTOM_FIELDS,
  TEMPLATE_FIELDS,
  PROJECT_TASK_TYPES,
  LISTS,
} from "@/lib/custom-field-ids";
import { quillDeltaToMarkdown } from "@/lib/markdown-to-quill";
import { prisma } from "@/lib/db";
import { getSessionUserEmail } from "@/lib/get-session-user";
import type {
  ProjectContact,
  FeedbackDeadline,
  TaskDetail,
  DeliverySnippetTemplate,
  DeliveryFormState,
  ClickUpTask,
} from "@/lib/types";

/**
 * GET /api/tasks/[taskId]
 *
 * Fetches full task detail + resolves sibling tasks (contacts, feedback
 * deadline, Slack channel, project plan) + matching delivery snippet template.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  try {
    // Fetch the main task
    const task = await getTask(taskId);
    const listId = task.list.id;

    // Fetch sibling tasks and delivery snippets in parallel
    const [siblingRes, snippetsRes] = await Promise.all([
      getListTasks(listId, true),
      getListTasks(LISTS.DELIVERY_SNIPPETS, false),
    ]);

    const siblings = siblingRes.tasks;
    const snippets = snippetsRes.tasks;

    // Extract the deliverable type from the main task
    const deliverableType =
      extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.DELIVERABLE_TYPE) ?? "";
    const department =
      extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.DEPARTMENT) ?? "";

    // ── Resolve sibling tasks ──

    const contacts: ProjectContact[] = [];
    let slackChannelId: string | null = null;
    let projectPlanLink: string | null = null;
    let feedbackDeadline: FeedbackDeadline | null = null;

    for (const sibling of siblings) {
      const taskType = extractCustomFieldValue(
        sibling.custom_fields,
        CUSTOM_FIELDS.PROJECT_TASK_TYPE
      );

      // Match by resolved name or raw option value
      const rawTaskType = sibling.custom_fields.find(
        (f) => f.id === CUSTOM_FIELDS.PROJECT_TASK_TYPE
      )?.value;

      if (
        taskType === "Project Contact" ||
        String(rawTaskType) === PROJECT_TASK_TYPES.PROJECT_CONTACT
      ) {
        contacts.push({
          taskId: sibling.id,
          name:
            extractCustomFieldValue(sibling.custom_fields, CUSTOM_FIELDS.CONTACT_FIRST_NAME) ??
            sibling.name,
          email:
            extractCustomFieldValue(sibling.custom_fields, CUSTOM_FIELDS.CONTACT_EMAIL) ?? "",
          role:
            extractCustomFieldValue(sibling.custom_fields, CUSTOM_FIELDS.CONTACT_ROLE) ?? "Standard",
          slackHandle:
            extractCustomFieldValue(sibling.custom_fields, CUSTOM_FIELDS.SLACK_HANDLE) ?? undefined,
          slackUserId:
            extractCustomFieldValue(sibling.custom_fields, CUSTOM_FIELDS.SLACK_USER_ID) ?? undefined,
        });
      }

      if (
        taskType === "Slack Channel" ||
        String(rawTaskType) === PROJECT_TASK_TYPES.SLACK_CHANNEL
      ) {
        slackChannelId =
          extractCustomFieldValue(sibling.custom_fields, CUSTOM_FIELDS.SLACK_DELIVERY_CHANNEL_ID) ??
          null;
      }

      if (
        taskType === "Project Plan" ||
        String(rawTaskType) === PROJECT_TASK_TYPES.PROJECT_PLAN
      ) {
        projectPlanLink =
          extractCustomFieldUrl(sibling.custom_fields, CUSTOM_FIELDS.PROJECT_PLAN_LINK) ?? null;
      }

      // Find the paired feedback deadline (same deliverable type, future due date)
      if (
        (taskType === "Feedback Deadline" ||
          String(rawTaskType) === PROJECT_TASK_TYPES.FEEDBACK_DEADLINE) &&
        sibling.due_date &&
        Number(sibling.due_date) > Date.now()
      ) {
        const sibDeliverableType = extractCustomFieldValue(
          sibling.custom_fields,
          CUSTOM_FIELDS.DELIVERABLE_TYPE
        );
        if (sibDeliverableType === deliverableType) {
          // Pick the nearest future deadline
          if (
            !feedbackDeadline ||
            Number(sibling.due_date) < Number(feedbackDeadline.dueDate)
          ) {
            const dueMs = Number(sibling.due_date);
            const date = new Date(dueMs);
            feedbackDeadline = {
              taskId: sibling.id,
              name: sibling.name,
              deliverableType: sibDeliverableType ?? "",
              department:
                extractCustomFieldValue(sibling.custom_fields, CUSTOM_FIELDS.DEPARTMENT) ?? "",
              dueDate: sibling.due_date,
              formattedDate: date.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              }),
            };
          }
        }
      }
    }

    // ── Find matching delivery snippet template ──

    let template: DeliverySnippetTemplate | null = null;
    for (const snippet of snippets) {
      const snippetType = extractCustomFieldValue(
        snippet.custom_fields,
        TEMPLATE_FIELDS.DELIVERABLE_TYPE
      );
      if (snippetType === deliverableType) {
        const senderField = snippet.custom_fields.find(
          (f) => f.id === TEMPLATE_FIELDS.SENDER
        );
        let senderEmail = "";
        let senderName = "";
        let senderUserId: number | undefined;
        let senderProfilePicture: string | undefined;
        if (senderField?.value && Array.isArray(senderField.value)) {
          const users = senderField.value as Array<{
            id?: number;
            email?: string;
            username?: string;
            profilePicture?: string;
          }>;
          senderEmail = users[0]?.email ?? "";
          senderName = users[0]?.username ?? "";
          senderUserId = users[0]?.id;
          senderProfilePicture = users[0]?.profilePicture ?? undefined;
        }

        // Prefer rich text (Quill Delta) → markdown for formatting
        const snippetField = snippet.custom_fields.find(
          (f) => f.id === TEMPLATE_FIELDS.DELIVERY_SNIPPET
        );
        const richText = snippetField?.value_richtext;
        const snippetBody = richText
          ? quillDeltaToMarkdown(richText as string)
          : (extractCustomFieldValue(snippet.custom_fields, TEMPLATE_FIELDS.DELIVERY_SNIPPET) ?? "");

        template = {
          taskId: snippet.id,
          name: snippet.name,
          snippet: snippetBody,
          snippetRichText: richText,
          subjectLine:
            extractCustomFieldValue(
              snippet.custom_fields,
              TEMPLATE_FIELDS.DELIVERY_SUBJECT_LINE
            ) ?? "",
          deliverableType: snippetType ?? "",
          department:
            extractCustomFieldValue(snippet.custom_fields, TEMPLATE_FIELDS.DEPARTMENT) ?? "",
          senderEmail,
          senderName,
          senderUserId,
          senderProfilePicture,
        };
        break;
      }
    }

    // ── Extract review links from the main task ──

    const reviewLinks = {
      googleDeliverableLink:
        extractCustomFieldUrl(task.custom_fields, CUSTOM_FIELDS.GOOGLE_LINK) ?? undefined,
      frameReviewLink:
        extractCustomFieldUrl(task.custom_fields, CUSTOM_FIELDS.FRAME_IO_LINK) ?? undefined,
      loomReviewLink:
        extractCustomFieldUrl(task.custom_fields, CUSTOM_FIELDS.LOOM_LINK) ?? undefined,
      animaticReviewLink:
        extractCustomFieldUrl(task.custom_fields, CUSTOM_FIELDS.ANIMATIC_LINK) ?? undefined,
      flexLink:
        CUSTOM_FIELDS.FLEX_LINK
          ? (extractCustomFieldUrl(task.custom_fields, CUSTOM_FIELDS.FLEX_LINK) ?? undefined)
          : undefined,
    };

    const result: TaskDetail = {
      task: {
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
        clientName: task.folder.name,
        projectName: task.list.name,
        deliverableType,
        department,
        listId: task.list.id,
        folderId: task.folder.id,
        clickUpUrl: task.url,
      },
      contacts,
      feedbackDeadline,
      slackChannelId,
      projectPlanLink,
      template,
      reviewLinks,
      revisionRounds:
        extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.REVISION_ROUNDS) ?? "",
      feedbackWindows:
        extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.FEEDBACK_WINDOWS) ?? "",
      versionNotes:
        extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.VERSION_NOTES) ?? "",
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch task detail:", error);
    return NextResponse.json(
      { error: "Failed to fetch task detail" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tasks/[taskId]
 *
 * Save draft: writes form fields to ClickUp custom fields and saves
 * the full form state to the portal database for resumption.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  try {
    const body: DeliveryFormState = await req.json();
    const userEmail = await getSessionUserEmail();

    // ── 1. Write review links to ClickUp ──

    const fieldUpdates: Array<{ fieldId: string; value: unknown }> = [];

    if (body.reviewLinks.googleDeliverableLink) {
      fieldUpdates.push({
        fieldId: CUSTOM_FIELDS.GOOGLE_LINK,
        value: body.reviewLinks.googleDeliverableLink,
      });
    }
    if (body.reviewLinks.frameReviewLink) {
      fieldUpdates.push({
        fieldId: CUSTOM_FIELDS.FRAME_IO_LINK,
        value: body.reviewLinks.frameReviewLink,
      });
    }
    if (body.reviewLinks.loomReviewLink) {
      fieldUpdates.push({
        fieldId: CUSTOM_FIELDS.LOOM_LINK,
        value: body.reviewLinks.loomReviewLink,
      });
    }
    if (body.versionNotes) {
      fieldUpdates.push({
        fieldId: CUSTOM_FIELDS.VERSION_NOTES,
        value: body.versionNotes,
      });
    }
    if (body.slackChannelId) {
      fieldUpdates.push({
        fieldId: CUSTOM_FIELDS.SLACK_DELIVERY_CHANNEL_ID,
        value: body.slackChannelId,
      });
    }

    // Write to ClickUp in parallel
    await Promise.allSettled(
      fieldUpdates.map((update) =>
        updateTaskCustomField(taskId, update.fieldId, update.value)
      )
    );

    // ── 2. Save draft to portal database ──

    try {
      await prisma.draft.upsert({
        where: { taskId },
        update: {
          formData: JSON.parse(JSON.stringify(body)),
          savedBy: userEmail,
          savedAt: new Date(),
        },
        create: {
          taskId,
          formData: JSON.parse(JSON.stringify(body)),
          savedBy: "portal-user",
        },
      });
    } catch (dbErr) {
      console.warn("Draft DB save failed (DB may not be connected):", dbErr);
      // Non-fatal: ClickUp fields were still saved
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save draft failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Save draft failed" },
      { status: 500 }
    );
  }
}
