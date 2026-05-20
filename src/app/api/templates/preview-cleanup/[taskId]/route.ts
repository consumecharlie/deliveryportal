import { NextResponse } from "next/server";
import { getTask, extractCustomFieldValue } from "@/lib/clickup";
import { TEMPLATE_FIELDS } from "@/lib/custom-field-ids";
import { quillDeltaToMarkdown } from "@/lib/markdown-to-quill";
import { magicCleanup } from "@/lib/template-cleanup";
import { lintTemplate, type LintIssue } from "@/lib/template-lint";

/**
 * GET /api/templates/preview-cleanup/[taskId]
 *
 * Mounted under `preview-cleanup/[taskId]` rather than the more
 * intuitive `[taskId]/preview-cleanup` to avoid a Next.js slug-name
 * conflict at the /api/templates/ level: the sibling
 * `[deliverableType]/route.ts` already owns the dynamic slot, and
 * mixing slug names at the same level (`[deliverableType]` vs
 * `[taskId]`) compiles silently but throws an unhandled rejection at
 * runtime that hangs every route — including /api/auth/*. Learned the
 * hard way on commit c0b0b80.
 *
 * Read-only: returns the current snippet markdown and what Magic Cleanup
 * would produce. Does NOT mutate ClickUp. The audit page uses this to
 * show a before/after diff in the fix-preview modal.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  try {
    const task = await getTask(taskId);

    const snippetField = task.custom_fields.find(
      (f) => f.id === TEMPLATE_FIELDS.DELIVERY_SNIPPET
    );
    const before = snippetField?.value_richtext
      ? quillDeltaToMarkdown(snippetField.value_richtext as string)
      : (extractCustomFieldValue(
          task.custom_fields,
          TEMPLATE_FIELDS.DELIVERY_SNIPPET
        ) ?? "");

    const deliverableType =
      extractCustomFieldValue(
        task.custom_fields,
        TEMPLATE_FIELDS.DELIVERABLE_TYPE
      ) ?? "";
    const department =
      extractCustomFieldValue(
        task.custom_fields,
        TEMPLATE_FIELDS.DEPARTMENT
      ) ?? "";

    const after = magicCleanup(before, { deliverableType, department });

    const beforeIssues: LintIssue[] = lintTemplate(before);
    const afterIssues: LintIssue[] = lintTemplate(after);

    return NextResponse.json({
      taskId,
      name: task.name,
      deliverableType,
      department,
      before,
      after,
      beforeIssues,
      afterIssues,
      unchanged: before.trim() === after.trim(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to preview cleanup:", message);
    return NextResponse.json(
      { error: `Failed to preview cleanup: ${message}` },
      { status: 500 }
    );
  }
}
