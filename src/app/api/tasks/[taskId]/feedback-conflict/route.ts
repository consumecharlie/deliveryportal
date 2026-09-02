// src/app/api/tasks/[taskId]/feedback-conflict/route.ts
//
// Applies one of the two resolutions to a feedback window / deadline conflict.
// This is the ONLY path that writes these values back to ClickUp: the normal
// send route is deliberately left untouched.
// See docs/plans/2026-09-02-feedback-conflict-design.md.

import { NextResponse } from "next/server";
import { getTask, resolveDropdownOptionId, updateTaskCustomField, updateTaskDueDate } from "@/lib/clickup";
import { CUSTOM_FIELDS } from "@/lib/custom-field-ids";
import { etInputsToMs } from "@/lib/feedback-deadline";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  try {
    const body = await req.json();
    const resolution = body?.resolution;

    // ── "Deadline is right": set the window to match the dates ──
    if (resolution === "window") {
      const windowLabel = typeof body.windowLabel === "string" ? body.windowLabel.trim() : "";
      if (!windowLabel) {
        return NextResponse.json({ error: "windowLabel is required" }, { status: 400 });
      }

      const task = await getTask(taskId);
      const optionId = resolveDropdownOptionId(
        task.custom_fields,
        CUSTOM_FIELDS.FEEDBACK_WINDOWS,
        windowLabel
      );
      // ClickUp denies creating dropdown options via the API, so an unknown
      // label is a dead end rather than something we can add on the fly.
      if (!optionId) {
        return NextResponse.json(
          { error: `"${windowLabel}" is not an option on the Feedback Windows field in ClickUp.` },
          { status: 400 }
        );
      }

      await updateTaskCustomField(taskId, CUSTOM_FIELDS.FEEDBACK_WINDOWS, optionId);
      return NextResponse.json({ ok: true, resolution, windowLabel });
    }

    // ── "Window is right": move the feedback deadline task ──
    if (resolution === "deadline") {
      const deadlineTaskId = typeof body.deadlineTaskId === "string" ? body.deadlineTaskId : "";
      const deadlineDate = typeof body.deadlineDate === "string" ? body.deadlineDate : "";
      const deadlineTime = typeof body.deadlineTime === "string" ? body.deadlineTime : "";

      if (!deadlineTaskId) {
        return NextResponse.json(
          { error: "No ClickUp feedback deadline task to move." },
          { status: 400 }
        );
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(deadlineDate)) {
        return NextResponse.json({ error: "deadlineDate must be YYYY-MM-DD" }, { status: 400 });
      }

      // A deadline with a real time keeps that time and moves only its date;
      // a date-only deadline stays date-only so the message still says "EOD".
      const hasTime = /^\d{2}:\d{2}$/.test(deadlineTime);
      const dueDateMs = etInputsToMs(deadlineDate, hasTime ? deadlineTime : "");
      if (Number.isNaN(dueDateMs)) {
        return NextResponse.json({ error: "Could not build a due date" }, { status: 400 });
      }

      await updateTaskDueDate(deadlineTaskId, dueDateMs, hasTime);
      return NextResponse.json({ ok: true, resolution, deadlineTaskId, deadlineDate, deadlineTime });
    }

    return NextResponse.json(
      { error: 'resolution must be "window" or "deadline"' },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed to resolve feedback conflict:", error);
    return NextResponse.json({ error: "Failed to resolve feedback conflict" }, { status: 500 });
  }
}
