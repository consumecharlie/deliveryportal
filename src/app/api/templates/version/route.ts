// src/app/api/templates/version/route.ts
import { NextResponse } from "next/server";
import { createTask, getListFields, getListTasks, updateTaskCustomField } from "@/lib/clickup";
import { LISTS, TEMPLATE_FIELDS } from "@/lib/custom-field-ids";

export async function POST(req: Request) {
  try {
    const { snippet, subjectLine, department, deliverableType } = await req.json();
    const dt = typeof deliverableType === "string" ? deliverableType.trim() : "";
    if (!dt) {
      return NextResponse.json({ error: "deliverableType is required" }, { status: 400 });
    }

    // Collision: a template task for this type already exists.
    const { tasks } = await getListTasks(LISTS.DELIVERY_SNIPPETS, true);
    const clash = tasks.find((t) => t.name.trim().toLowerCase() === dt.toLowerCase());
    if (clash) {
      return NextResponse.json(
        { error: `A template named "${dt}" already exists.`, existingTaskId: clash.id },
        { status: 409 }
      );
    }

    // Resolve the deliverable-type option — we can only SET an existing one.
    const { fields } = await getListFields(LISTS.DELIVERY_SNIPPETS);
    const dtField = fields.find((f) => f.id === TEMPLATE_FIELDS.DELIVERABLE_TYPE);
    const existingOpt = dtField?.type_config?.options?.find(
      (o) => (o.name ?? o.label) === dt
    );
    const typeExists = !!existingOpt;

    // Create the task with the copied text fields.
    const customFields: Array<{ id: string; value: unknown }> = [];
    if (snippet) customFields.push({ id: TEMPLATE_FIELDS.DELIVERY_SNIPPET, value: snippet });
    if (subjectLine) customFields.push({ id: TEMPLATE_FIELDS.DELIVERY_SUBJECT_LINE, value: subjectLine });
    const newTask = await createTask(LISTS.DELIVERY_SNIPPETS, { name: dt, custom_fields: customFields });

    // Set deliverable type only if the option already exists.
    if (existingOpt) {
      await updateTaskCustomField(newTask.id, TEMPLATE_FIELDS.DELIVERABLE_TYPE, String(existingOpt.orderindex));
    }
    if (department) {
      const deptField = fields.find((f) => f.id === TEMPLATE_FIELDS.DEPARTMENT);
      const deptOpt = deptField?.type_config?.options?.find((o) => (o.name ?? o.label) === department);
      if (deptOpt) {
        await updateTaskCustomField(newTask.id, TEMPLATE_FIELDS.DEPARTMENT, String(deptOpt.orderindex));
      }
    }

    return NextResponse.json({ success: true, taskId: newTask.id, name: newTask.name, typeExists });
  } catch (error) {
    console.error("Failed to create template version:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create template version" },
      { status: 500 }
    );
  }
}
