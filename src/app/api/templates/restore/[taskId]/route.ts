import { NextResponse } from "next/server";
import { getTask, updateTaskCustomField, extractCustomFieldValue } from "@/lib/clickup";
import { TEMPLATE_FIELDS } from "@/lib/custom-field-ids";
import { prisma } from "@/lib/db";
import { markdownToQuillDelta, markdownToPlainText } from "@/lib/markdown-to-quill";

/**
 * POST /api/templates/restore/[taskId]
 *
 * Restore a template to a previous version. Saves the current state
 * as a new version entry before overwriting with the restored version.
 *
 * Body: { versionId: string }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  try {
    const { versionId } = await req.json();

    if (!versionId) {
      return NextResponse.json(
        { error: "versionId is required" },
        { status: 400 }
      );
    }

    // Fetch the version to restore
    const version = await prisma.templateVersion.findUnique({
      where: { id: versionId },
    });

    if (!version || version.templateTaskId !== taskId) {
      return NextResponse.json(
        { error: "Version not found or does not belong to this template" },
        { status: 404 }
      );
    }

    // Save current state as a version before overwriting
    try {
      const currentTask = await getTask(taskId);
      const currentSnippet =
        extractCustomFieldValue(
          currentTask.custom_fields,
          TEMPLATE_FIELDS.DELIVERY_SNIPPET
        ) ?? "";
      const currentSubject =
        extractCustomFieldValue(
          currentTask.custom_fields,
          TEMPLATE_FIELDS.DELIVERY_SUBJECT_LINE
        ) ?? "";
      const currentType =
        extractCustomFieldValue(
          currentTask.custom_fields,
          TEMPLATE_FIELDS.DELIVERABLE_TYPE
        ) ?? "";
      const currentDept =
        extractCustomFieldValue(
          currentTask.custom_fields,
          TEMPLATE_FIELDS.DEPARTMENT
        ) ?? "";

      await prisma.templateVersion.create({
        data: {
          templateTaskId: taskId,
          templateName: currentTask.name,
          snippet: currentSnippet,
          subjectLine: currentSubject,
          deliverableType: currentType,
          department: currentDept,
          sender: "",
          editedBy: "portal-user",
          changeNote: `Auto-saved before restoring to version from ${version.editedAt.toISOString()}`,
        },
      });
    } catch (saveErr) {
      console.warn("Could not save current state before restore:", saveErr);
      // Continue with restore anyway
    }

    // Write the restored version back to ClickUp (with Quill Delta rich text)
    const quillDelta = markdownToQuillDelta(version.snippet);
    const plainText = markdownToPlainText(version.snippet);
    await Promise.allSettled([
      updateTaskCustomField(
        taskId,
        TEMPLATE_FIELDS.DELIVERY_SNIPPET,
        plainText,
        JSON.stringify(quillDelta)
      ),
      updateTaskCustomField(
        taskId,
        TEMPLATE_FIELDS.DELIVERY_SUBJECT_LINE,
        version.subjectLine
      ),
    ]);

    return NextResponse.json({
      success: true,
      restoredVersion: {
        id: version.id,
        editedAt: version.editedAt,
        snippet: version.snippet,
        subjectLine: version.subjectLine,
      },
    });
  } catch (error) {
    console.error("Failed to restore template:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to restore template",
      },
      { status: 500 }
    );
  }
}
