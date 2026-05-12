import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  isFormComplete,
  missingFields,
  type ScheduledSendPayload,
} from "@/lib/schedule-send";

export async function GET() {
  try {
    const drafts = await prisma.draft.findMany({
      where: { scheduleStatus: "scheduled", scheduledFor: { not: null } },
      orderBy: { scheduledFor: "asc" },
    });

    const data = drafts.map((d) => {
      const payload = (d.scheduledPayload ?? null) as ScheduledSendPayload | null;
      const subjectLine =
        payload?.formState?.editedSubjectLine ??
        payload?.mergedContent?.subjectLine ??
        "";
      return {
        id: d.id,
        taskId: d.taskId,
        savedBy: d.savedBy,
        scheduledFor: d.scheduledFor?.toISOString() ?? null,
        isComplete: payload ? isFormComplete(payload) : false,
        missing: payload ? missingFields(payload) : ["Schedule payload"],
        primaryEmail: payload?.primaryEmail ?? "",
        senderEmail: payload?.senderEmail ?? "",
        deliverableType: payload?.formState?.deliverableType ?? "",
        postToSlack: payload?.postToSlack ?? false,
        slackChannelName: payload?.taskMeta?.slackChannelName ?? "",
        subjectLine,
        projectName: payload?.taskMeta?.projectName ?? "",
        clientName: payload?.taskMeta?.clientName ?? "",
      };
    });

    return NextResponse.json({ scheduled: data });
  } catch (e) {
    console.error("Failed to list scheduled drafts:", e);
    return NextResponse.json(
      { scheduled: [], error: "Failed to load scheduled" },
      { status: 500 }
    );
  }
}
