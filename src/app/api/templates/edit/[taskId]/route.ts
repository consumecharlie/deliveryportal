import { NextResponse } from "next/server";
import {
  getTask,
  updateTaskCustomField,
  extractCustomFieldValue,
  resolveDropdownOptionId,
} from "@/lib/clickup";
import { TEMPLATE_FIELDS } from "@/lib/custom-field-ids";
import { prisma } from "@/lib/db";
import { getSessionUserEmail } from "@/lib/get-session-user";
import {
  markdownToQuillDelta,
  markdownToPlainText,
  quillDeltaToMarkdown,
} from "@/lib/markdown-to-quill";
import type { DeliverySnippetTemplate } from "@/lib/types";

/**
 * GET /api/templates/edit/[taskId]
 *
 * Get a specific template by its ClickUp task ID.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  try {
    const task = await getTask(taskId);

    const senderField = task.custom_fields.find(
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

    // Prefer rich text (Quill Delta) → markdown for the snippet to preserve formatting
    const snippetField = task.custom_fields.find(
      (f) => f.id === TEMPLATE_FIELDS.DELIVERY_SNIPPET
    );
    let snippetContent = "";
    if (snippetField?.value_richtext) {
      snippetContent = quillDeltaToMarkdown(snippetField.value_richtext as string);
    } else {
      snippetContent =
        extractCustomFieldValue(
          task.custom_fields,
          TEMPLATE_FIELDS.DELIVERY_SNIPPET
        ) ?? "";
    }

    const template: DeliverySnippetTemplate = {
      taskId: task.id,
      name: task.name,
      snippet: snippetContent,
      snippetRichText: snippetField?.value_richtext,
      subjectLine:
        extractCustomFieldValue(
          task.custom_fields,
          TEMPLATE_FIELDS.DELIVERY_SUBJECT_LINE
        ) ?? "",
      deliverableType:
        extractCustomFieldValue(
          task.custom_fields,
          TEMPLATE_FIELDS.DELIVERABLE_TYPE
        ) ?? "",
      department:
        extractCustomFieldValue(
          task.custom_fields,
          TEMPLATE_FIELDS.DEPARTMENT
        ) ?? "",
      senderEmail,
      senderName,
      senderUserId,
      senderProfilePicture,
    };

    return NextResponse.json(template);
  } catch (error) {
    console.error("Failed to fetch template:", error);
    return NextResponse.json(
      { error: "Failed to fetch template" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/templates/edit/[taskId]
 *
 * Update a template's fields in ClickUp and save a version snapshot.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  try {
    const body = await req.json();
    const { snippet, subjectLine, deliverableType, department, sender } = body;

    // First, get the current task for version history + dropdown resolution
    let currentTask: Awaited<ReturnType<typeof getTask>> | null = null;
    let currentTemplate: DeliverySnippetTemplate | null = null;
    try {
      currentTask = await getTask(taskId);
      currentTemplate = {
        taskId: currentTask.id,
        name: currentTask.name,
        snippet:
          extractCustomFieldValue(
            currentTask.custom_fields,
            TEMPLATE_FIELDS.DELIVERY_SNIPPET
          ) ?? "",
        subjectLine:
          extractCustomFieldValue(
            currentTask.custom_fields,
            TEMPLATE_FIELDS.DELIVERY_SUBJECT_LINE
          ) ?? "",
        deliverableType:
          extractCustomFieldValue(
            currentTask.custom_fields,
            TEMPLATE_FIELDS.DELIVERABLE_TYPE
          ) ?? "",
        department:
          extractCustomFieldValue(
            currentTask.custom_fields,
            TEMPLATE_FIELDS.DEPARTMENT
          ) ?? "",
        senderEmail: "",
      };
    } catch {
      // Can't get current - proceed without version history
    }

    // Update fields in ClickUp
    const updates: Promise<void>[] = [];

    if (snippet !== undefined) {
      // Convert markdown → Quill Delta for rich text, plain text for fallback
      const quillDelta = markdownToQuillDelta(snippet);
      const plainText = markdownToPlainText(snippet);
      // ClickUp expects value_richtext as a JSON string
      updates.push(
        updateTaskCustomField(
          taskId,
          TEMPLATE_FIELDS.DELIVERY_SNIPPET,
          plainText,
          JSON.stringify(quillDelta)
        )
      );
    }
    if (subjectLine !== undefined) {
      updates.push(
        updateTaskCustomField(
          taskId,
          TEMPLATE_FIELDS.DELIVERY_SUBJECT_LINE,
          subjectLine
        )
      );
    }

    // Update dropdown fields using the already-fetched task for option resolution
    if (department !== undefined && currentTask) {
      const optionId = resolveDropdownOptionId(
        currentTask.custom_fields,
        TEMPLATE_FIELDS.DEPARTMENT,
        department
      );
      if (optionId !== null) {
        updates.push(
          updateTaskCustomField(taskId, TEMPLATE_FIELDS.DEPARTMENT, optionId)
        );
      }
    }

    if (deliverableType !== undefined && currentTask) {
      const optionId = resolveDropdownOptionId(
        currentTask.custom_fields,
        TEMPLATE_FIELDS.DELIVERABLE_TYPE,
        deliverableType
      );
      if (optionId !== null) {
        updates.push(
          updateTaskCustomField(
            taskId,
            TEMPLATE_FIELDS.DELIVERABLE_TYPE,
            optionId
          )
        );
      }
    }

    // Update Sender (users field) - value is { add: [userId], rem: [oldIds...] }
    // We must remove existing sender(s) before adding the new one, otherwise
    // ClickUp just appends and both users stay assigned.
    if (sender !== undefined) {
      const senderUserId = typeof sender === "number" ? sender : Number(sender);
      if (!isNaN(senderUserId)) {
        // Find current sender user IDs to remove
        const currentSenderIds: number[] = [];
        if (currentTask) {
          const senderField = currentTask.custom_fields.find(
            (f) => f.id === TEMPLATE_FIELDS.SENDER
          );
          if (senderField?.value && Array.isArray(senderField.value)) {
            for (const u of senderField.value as Array<{ id?: number }>) {
              if (u.id && u.id !== senderUserId) {
                currentSenderIds.push(u.id);
              }
            }
          }
        }
        updates.push(
          updateTaskCustomField(taskId, TEMPLATE_FIELDS.SENDER, {
            add: [senderUserId],
            rem: currentSenderIds,
          })
        );
      }
    }

    await Promise.allSettled(updates);

    // Save version history to DB
    if (currentTemplate) {
      try {
        const userEmail = await getSessionUserEmail();
        await prisma.templateVersion.create({
          data: {
            templateTaskId: taskId,
            templateName: currentTemplate.name,
            snippet: currentTemplate.snippet,
            subjectLine: currentTemplate.subjectLine,
            deliverableType: currentTemplate.deliverableType,
            department: currentTemplate.department,
            sender: currentTemplate.senderEmail,
            editedBy: userEmail,
            changeNote: body.changeNote ?? null,
          },
        });
      } catch (dbErr) {
        console.warn("Template version save failed (DB may not be connected):", dbErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update template:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update template" },
      { status: 500 }
    );
  }
}
