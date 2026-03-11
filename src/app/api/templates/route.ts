import { NextResponse } from "next/server";
import { getListTasks, extractCustomFieldValue } from "@/lib/clickup";
import { LISTS, TEMPLATE_FIELDS } from "@/lib/custom-field-ids";
import type { DeliverySnippetTemplate } from "@/lib/types";

/**
 * GET /api/templates
 *
 * List all delivery snippet templates from the Delivery Snippets list.
 */
export async function GET() {
  try {
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
