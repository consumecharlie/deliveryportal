import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  findDueDrafts,
  findStaleDrafts,
  type SchedulableDraft,
  type ScheduledSendPayload,
} from "@/lib/schedule-send";
import { sendSlackDM } from "@/lib/slack-dm";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const auth = req.headers.get("authorization");
  return Boolean(
    process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
  );
}

function formatET(d: Date): string {
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function deriveBaseUrl(req: Request): string {
  // Prefer a stable alias domain (custom or project alias) over the per-
  // deployment URL Vercel cron's request lands on. Per-deployment URLs
  // (deliveryportal-<hash>-<team>.vercel.app) are gated by Vercel Deployment
  // Protection, which blocks the cron's internal fan-out call with an HTML
  // 401 before our middleware ever runs.
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    process.env.VERCEL_URL ??
    "";
  if (envUrl) {
    return envUrl.startsWith("http") ? envUrl : `https://${envUrl}`;
  }
  const proto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("host");
  if (proto && host) return `${proto}://${host}`;
  return "";
}

async function bounce(
  d: SchedulableDraft,
  reason: string
): Promise<void> {
  await prisma.draft.update({
    where: { id: d.id },
    data: {
      scheduledFor: null,
      scheduleStatus: null,
      scheduledPayload: Prisma.JsonNull,
    },
  });
  const fireTime = d.scheduledFor ? ` (was scheduled for ${formatET(d.scheduledFor)})` : "";
  const recipient = d.scheduledPayload?.primaryEmail
    ? `to ${d.scheduledPayload.primaryEmail}`
    : "(no client)";
  await sendSlackDM(
    d.savedBy ?? "",
    `:warning: Your scheduled send ${recipient}${fireTime} didn't fire (${reason}). It's back in Drafts.`
  );
}

async function runFirePass(
  candidates: SchedulableDraft[],
  baseUrl: string
): Promise<{ fired: number; bounced: number }> {
  const now = new Date();
  const due = findDueDrafts(candidates, now);
  let fired = 0;
  let bounced = 0;
  for (const d of due) {
    // Atomic claim: only proceed if status is still "scheduled".
    const claimed = await prisma.draft.updateMany({
      where: { id: d.id, scheduleStatus: "scheduled" },
      data: { scheduleStatus: "firing" },
    });
    if (claimed.count === 0) continue;

    const payload = d.scheduledPayload;
    if (!payload) {
      await bounce(d, "Missing scheduled payload");
      bounced++;
      continue;
    }

    try {
      const sendUrl = `${baseUrl}/api/tasks/${encodeURIComponent(d.taskId)}/send`;
      console.log(`[cron] firing draft ${d.id} via ${sendUrl} testMode=${payload.testMode === true}`);
      const res = await fetch(sendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify({ ...payload, sentBy: d.savedBy }),
      });
      const respText = await res.text().catch(() => "");
      console.log(`[cron] send route response: ${res.status} body=${respText.slice(0, 300)}`);
      if (!res.ok) {
        throw new Error(`send route returned ${res.status}: ${respText.slice(0, 200)}`);
      }
      fired++;
      // On a normal send the route deletes the draft entirely. On a test
      // send the draft is preserved (no ClickUp/DB writes) — manually clear
      // the schedule columns so it stops appearing in /scheduled. updateMany
      // is a no-op when the row was already deleted.
      await prisma.draft.updateMany({
        where: { id: d.id, scheduleStatus: "firing" },
        data: {
          scheduledFor: null,
          scheduleStatus: null,
          scheduledPayload: Prisma.JsonNull,
        },
      });
    } catch (err) {
      console.error("scheduled send failed for draft", d.id, err);
      await bounce(
        d,
        "Send failed: " + (err instanceof Error ? err.message : String(err))
      );
      bounced++;
    }
  }
  return { fired, bounced };
}

async function runStalePass(
  candidates: SchedulableDraft[]
): Promise<number> {
  const now = new Date();
  const stale = findStaleDrafts(candidates, now);
  for (const d of stale) {
    await bounce(d, "Scheduled time passed without firing");
  }
  return stale.length;
}

async function runCron(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const baseUrl = deriveBaseUrl(req);
    if (!baseUrl) {
      throw new Error("cannot derive baseUrl for internal call");
    }

    const candidates = await prisma.draft.findMany({
      where: {
        OR: [{ scheduleStatus: "scheduled" }, { scheduleStatus: "firing" }],
      },
    });

    const drafts: SchedulableDraft[] = candidates.map((c) => ({
      id: c.id,
      taskId: c.taskId,
      savedBy: c.savedBy,
      scheduledFor: c.scheduledFor,
      scheduleStatus: c.scheduleStatus,
      scheduledPayload: (c.scheduledPayload ?? null) as ScheduledSendPayload | null,
    }));

    const fireResult = await runFirePass(drafts, baseUrl);
    const staleCount = await runStalePass(drafts);

    return NextResponse.json({
      ok: true,
      processed: drafts.length,
      fired: fireResult.fired,
      bounced: fireResult.bounced + staleCount,
    });
  } catch (e) {
    console.error("Cron failed:", e);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return runCron(req);
}

// Vercel cron uses GET; keep both.
export async function GET(req: Request) {
  return runCron(req);
}
