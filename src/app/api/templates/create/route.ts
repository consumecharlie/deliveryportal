import { NextResponse } from "next/server";
import { createTask } from "@/lib/clickup";
import { LISTS, TEMPLATE_FIELDS } from "@/lib/custom-field-ids";

/**
 * POST /api/templates/create
 *
 * Create a new delivery snippet template as a task in the ClickUp
 * Delivery Snippets list. Sets the snippet body, subject line,
 * deliverable type, and department custom fields.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, snippet, subjectLine, deliverableType, department } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Template name is required" },
        { status: 400 }
      );
    }

    // Build the custom fields array for the new task
    const customFields: Array<{ id: string; value: unknown }> = [];

    if (snippet) {
      customFields.push({
        id: TEMPLATE_FIELDS.DELIVERY_SNIPPET,
        value: snippet,
      });
    }

    if (subjectLine) {
      customFields.push({
        id: TEMPLATE_FIELDS.DELIVERY_SUBJECT_LINE,
        value: subjectLine,
      });
    }

    // Deliverable type and department are dropdown fields —
    // ClickUp expects the option index or UUID depending on field config.
    // For text/label fields, the API accepts the raw value as a string.
    // For dropdown fields, we pass the option name and let ClickUp resolve it.
    if (deliverableType) {
      customFields.push({
        id: TEMPLATE_FIELDS.DELIVERABLE_TYPE,
        value: deliverableType,
      });
    }

    if (department) {
      customFields.push({
        id: TEMPLATE_FIELDS.DEPARTMENT,
        value: department,
      });
    }

    const newTask = await createTask(LISTS.DELIVERY_SNIPPETS, {
      name: name.trim(),
      custom_fields: customFields,
    });

    return NextResponse.json({
      success: true,
      taskId: newTask.id,
      name: newTask.name,
    });
  } catch (error) {
    console.error("Failed to create template:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create template",
      },
      { status: 500 }
    );
  }
}
