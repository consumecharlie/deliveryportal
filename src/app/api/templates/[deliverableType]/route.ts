import { NextResponse } from "next/server";
import { getListTasks, extractCustomFieldValue } from "@/lib/clickup";
import { LISTS, TEMPLATE_FIELDS } from "@/lib/custom-field-ids";
import { quillDeltaToMarkdown } from "@/lib/markdown-to-quill";
import type { DeliverySnippetTemplate } from "@/lib/types";

/**
 * GET /api/templates/[deliverableType]
 *
 * Fetches the delivery snippet template matching a given deliverable type.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ deliverableType: string }> }
) {
  const { deliverableType } = await params;
  const decodedType = decodeURIComponent(deliverableType);

  try {
    const res = await getListTasks(LISTS.DELIVERY_SNIPPETS, false);

    for (const snippet of res.tasks) {
      const snippetType = extractCustomFieldValue(
        snippet.custom_fields,
        TEMPLATE_FIELDS.DELIVERABLE_TYPE
      );

      if (snippetType === decodedType) {
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

        // Prefer rich text (Quill Delta) → markdown for full formatting;
        // fall back to plain text value if no rich text is available.
        const snippetField = snippet.custom_fields.find(
          (f) => f.id === TEMPLATE_FIELDS.DELIVERY_SNIPPET
        );
        const richText = snippetField?.value_richtext;
        const snippetBody = richText
          ? quillDeltaToMarkdown(richText as string)
          : (extractCustomFieldValue(
              snippet.custom_fields,
              TEMPLATE_FIELDS.DELIVERY_SNIPPET
            ) ?? "");

        const template: DeliverySnippetTemplate = {
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
            extractCustomFieldValue(
              snippet.custom_fields,
              TEMPLATE_FIELDS.DEPARTMENT
            ) ?? "",
          senderEmail,
          senderName,
          senderUserId,
          senderProfilePicture,
        };

        return NextResponse.json(template);
      }
    }

    return NextResponse.json(
      { error: `No template found for deliverable type: ${decodedType}` },
      { status: 404 }
    );
  } catch (error) {
    console.error("Failed to fetch template:", error);
    return NextResponse.json(
      { error: "Failed to fetch template" },
      { status: 500 }
    );
  }
}
