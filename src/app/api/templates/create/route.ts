import { NextResponse } from "next/server";
import {
  createTask,
  getListFields,
  updateTaskCustomField,
} from "@/lib/clickup";
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

    // Create the task first with just text fields (no dropdowns)
    const customFields: Array<{ id: string; value: unknown }> = [];
    if (snippet) {
      customFields.push({ id: TEMPLATE_FIELDS.DELIVERY_SNIPPET, value: snippet });
    }
    if (subjectLine) {
      customFields.push({ id: TEMPLATE_FIELDS.DELIVERY_SUBJECT_LINE, value: subjectLine });
    }

    const newTask = await createTask(LISTS.DELIVERY_SNIPPETS, {
      name: name.trim(),
      custom_fields: customFields,
    });

    // Now set dropdown fields by resolving option IDs from the list's field definitions
    if (deliverableType || department) {
      const fieldsRes = await getListFields(LISTS.DELIVERY_SNIPPETS);
      const fields = fieldsRes.fields ?? [];

      const resolveOptionId = (fieldId: string, optionName: string): string | null => {
        const field = fields.find((f: { id: string }) => f.id === fieldId);
        if (!field?.type_config?.options) return null;
        const option = field.type_config.options.find(
          (o: { name?: string; label?: string }) => o.name === optionName || o.label === optionName
        );
        return option ? String(option.orderindex) : null;
      };

      if (deliverableType) {
        const optionId = resolveOptionId(TEMPLATE_FIELDS.DELIVERABLE_TYPE, deliverableType);
        if (optionId) {
          await updateTaskCustomField(newTask.id, TEMPLATE_FIELDS.DELIVERABLE_TYPE, optionId);
        }
      }
      if (department) {
        const optionId = resolveOptionId(TEMPLATE_FIELDS.DEPARTMENT, department);
        if (optionId) {
          await updateTaskCustomField(newTask.id, TEMPLATE_FIELDS.DEPARTMENT, optionId);
        }
      }
    }

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
