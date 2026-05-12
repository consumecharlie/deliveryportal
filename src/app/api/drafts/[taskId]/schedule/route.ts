import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { ScheduledSendPayload } from "@/lib/schedule-send";

interface ScheduleBody {
  scheduledFor?: string;
  payload?: ScheduledSendPayload;
}

interface ParsedSchedule {
  scheduledFor: Date | null;
  payload: ScheduledSendPayload | null;
  error?: string;
}

async function parseBody(
  req: Request,
  requirePayload: boolean
): Promise<ParsedSchedule> {
  const body = (await req.json().catch(() => ({}))) as ScheduleBody;
  const raw = body?.scheduledFor;
  if (!raw || typeof raw !== "string") {
    return { scheduledFor: null, payload: null, error: "scheduledFor is required (ISO string)" };
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return { scheduledFor: null, payload: null, error: "scheduledFor is not a valid date" };
  }
  if (d.getTime() <= Date.now()) {
    return { scheduledFor: null, payload: null, error: "scheduledFor must be in the future" };
  }
  if (requirePayload && (!body.payload || typeof body.payload !== "object")) {
    return { scheduledFor: null, payload: null, error: "payload is required" };
  }
  return { scheduledFor: d, payload: body.payload ?? null };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const parsed = await parseBody(req, true);
    if (parsed.error || !parsed.scheduledFor || !parsed.payload) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const updated = await prisma.draft.update({
      where: { taskId },
      data: {
        scheduledFor: parsed.scheduledFor,
        scheduleStatus: "scheduled",
        scheduledPayload: parsed.payload as unknown as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json({ ok: true, draft: updated });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }
    console.error("Failed to schedule draft:", e);
    return NextResponse.json({ error: "Failed to schedule" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    // Payload is optional on PATCH — reschedule without changing the snapshot.
    const parsed = await parseBody(req, false);
    if (parsed.error || !parsed.scheduledFor) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const data: Prisma.DraftUpdateInput = {
      scheduledFor: parsed.scheduledFor,
      scheduleStatus: "scheduled",
    };
    if (parsed.payload) {
      data.scheduledPayload = parsed.payload as unknown as Prisma.InputJsonValue;
    }
    const updated = await prisma.draft.update({ where: { taskId }, data });
    return NextResponse.json({ ok: true, draft: updated });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }
    console.error("Failed to reschedule draft:", e);
    return NextResponse.json({ error: "Failed to reschedule" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    await prisma.draft.update({
      where: { taskId },
      data: {
        scheduledFor: null,
        scheduleStatus: null,
        scheduledPayload: Prisma.JsonNull,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }
    console.error("Failed to cancel schedule:", e);
    return NextResponse.json({ error: "Failed to cancel schedule" }, { status: 500 });
  }
}
