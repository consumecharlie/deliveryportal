import { NextResponse } from "next/server";
import { getListTasks, extractCustomFieldValue } from "@/lib/clickup";
import { LISTS, TEMPLATE_FIELDS } from "@/lib/custom-field-ids";
import type { DeliverySnippetTemplate } from "@/lib/types";

let templatesCache: { data: DeliverySnippetTemplate[]; timestamp: number } | null = null;
const TEMPLATES_CACHE_TTL = 10 * 60_000; // 10 minutes

/**
 * GET /api/templates
 *
 * List all delivery snippet templates from the Delivery Snippets list.
 */
export async function GET() {
  try {
    if (templatesCache && Date.now() - templatesCache.timestamp < TEMPLATES_CACHE_TTL) {
      return NextResponse.json({ templates: templatesCache.data });
    }

    const res = await getListTasks(LISTS.DELIVERY_SNIPPETS, false);

    const templates: DeliverySnippetTemplate[] = res.tasks.map((snippet) => {
      const senderField = snippet.custom_fields.find(
        (f) => f.id === TEMPLATE_FIELDS.SENDER
      );
      let senderEmail = "";
      let senderName = "";
      if (senderField?.value && Array.isArray(senderField.value)) {
        const users = senderField.value as Array<{
          email?: string;
          username?: string;
        }>;
        senderEmail = users[0]?.email ?? "";
        senderName = users[0]?.username ?? "";
      }

      return {
        taskId: snippet.id,
        name: snippet.name,
        snippet:
          extractCustomFieldValue(
            snippet.custom_fields,
            TEMPLATE_FIELDS.DELIVERY_SNIPPET
          ) ?? "",
        subjectLine:
          extractCustomFieldValue(
            snippet.custom_fields,
            TEMPLATE_FIELDS.DELIVERY_SUBJECT_LINE
          ) ?? "",
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
        senderEmail,
        senderName,
      };
    });

    templatesCache = { data: templates, timestamp: Date.now() };
    return NextResponse.json({ templates });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to fetch templates:", message);
    return NextResponse.json(
      { error: `Failed to fetch templates: ${message}` },
      { status: 500 }
    );
  }
}
