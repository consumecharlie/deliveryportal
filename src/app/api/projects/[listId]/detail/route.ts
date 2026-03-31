import { NextResponse } from "next/server";
import {
  getList,
  getListTasks,
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
import type {
  ProjectContact,
  FeedbackDeadline,
  TaskDetail,
  DeliverySnippetTemplate,
} from "@/lib/types";

/**
 * GET /api/projects/[listId]/detail?deliverableType=XYZ
 *
 * Assembles a TaskDetail-compatible response from a project list ID,
 * without requiring an existing deliverable task. Used for ad hoc deliveries.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ listId: string }> }
) {
  const { listId } = await params;
  const { searchParams } = new URL(req.url);
  const deliverableType = searchParams.get("deliverableType") ?? "";

  try {
    // Fetch list info, sibling tasks, and delivery snippets in parallel
    const [listInfo, siblingRes, snippetsRes] = await Promise.all([
      getList(listId),
      getListTasks(listId, true),
      getListTasks(LISTS.DELIVERY_SNIPPETS, false),
    ]);

    const siblings = siblingRes.tasks;
    const snippets = snippetsRes.tasks;

    const clientName = listInfo.folder.name;
    const projectName = listInfo.name;
    const folderId = listInfo.folder.id;

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
        deliverableType &&
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
    if (deliverableType) {
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
    }

    // ── Build synthetic task ──

    const taskName = deliverableType
      ? `Share ${deliverableType} with Client`
      : "New Delivery";

    const result: TaskDetail = {
      task: {
        id: "__adhoc__",
        name: taskName,
        status: "open",
        statusColor: "",
        dueDate: null,
        clientName,
        projectName,
        deliverableType,
        department: template?.department ?? "",
        listId,
        folderId,
        clickUpUrl: "",
      },
      contacts,
      feedbackDeadline,
      slackChannelId,
      projectPlanLink,
      template,
      reviewLinks: {
        googleDeliverableLink: undefined,
        frameReviewLink: undefined,
        animaticReviewLink: undefined,
        loomReviewLink: undefined,
        flexLink: undefined,
      },
      revisionRounds: "",
      feedbackWindows: "",
      versionNotes: "",
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch project detail:", error);
    return NextResponse.json(
      { error: "Failed to fetch project detail" },
      { status: 500 }
    );
  }
}
