import { NextResponse } from "next/server";
import { getListTasks, extractCustomFieldValue } from "@/lib/clickup";
import { LISTS, TEMPLATE_FIELDS } from "@/lib/custom-field-ids";
import { quillDeltaToMarkdown } from "@/lib/markdown-to-quill";
import { lintTemplate, countBySeverity, type LintIssue } from "@/lib/template-lint";

/**
 * GET /api/templates/audit
 *
 * Runs the linter against every delivery snippet template and returns
 * a summary so the audit page can show which templates have issues.
 *
 * Response shape:
 *   { templates: [{ taskId, name, deliverableType, department,
 *                   errors, warnings, issues }] }
 */

interface AuditedTemplate {
  taskId: string;
  name: string;
  deliverableType: string;
  department: string;
  errors: number;
  warnings: number;
  issues: LintIssue[];
}

let auditCache: { data: AuditedTemplate[]; timestamp: number } | null = null;
const CACHE_TTL = 60_000; // 1 minute — short, so a Fix flow refreshes quickly

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const noCache = url.searchParams.get("noCache") === "true";

    if (!noCache && auditCache && Date.now() - auditCache.timestamp < CACHE_TTL) {
      return NextResponse.json({ templates: auditCache.data });
    }

    const res = await getListTasks(LISTS.DELIVERY_SNIPPETS, false);

    const templates: AuditedTemplate[] = res.tasks.map((snippet) => {
      const snippetField = snippet.custom_fields.find(
        (f) => f.id === TEMPLATE_FIELDS.DELIVERY_SNIPPET
      );
      const richText = snippetField?.value_richtext;
      const markdown = richText
        ? quillDeltaToMarkdown(richText as string)
        : (extractCustomFieldValue(
            snippet.custom_fields,
            TEMPLATE_FIELDS.DELIVERY_SNIPPET
          ) ?? "");

      const issues = lintTemplate(markdown);
      const { errors, warnings } = countBySeverity(issues);

      return {
        taskId: snippet.id,
        name: snippet.name,
        deliverableType:
          extractCustomFieldValue(
            snippet.custom_fields,
            TEMPLATE_FIELDS.DELIVERABLE_TYPE
          ) ?? "",
        department:
          extractCustomFieldValue(
            snippet.custom_fields,
            TEMPLATE_FIELDS.DEPARTMENT
          ) ?? "",
        errors,
        warnings,
        issues,
      };
    });

    // Sort: most errors first, then most warnings, then alphabetical
    templates.sort((a, b) => {
      if (b.errors !== a.errors) return b.errors - a.errors;
      if (b.warnings !== a.warnings) return b.warnings - a.warnings;
      return a.name.localeCompare(b.name);
    });

    auditCache = { data: templates, timestamp: Date.now() };
    return NextResponse.json({ templates });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to audit templates:", message);
    return NextResponse.json(
      { error: `Failed to audit templates: ${message}` },
      { status: 500 }
    );
  }
}
