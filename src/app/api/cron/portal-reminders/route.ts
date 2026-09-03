/**
 * Weekday morning cron: remind clients whose feedback is due tomorrow or
 * today (email via n8n), and nudge the internal project channel when a
 * deadline has passed without a confirmation.
 *
 * Idempotent per (delivery, kind, Eastern date) through PortalReminder rows.
 * `?dryRun=1` classifies and reports without sending or writing.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { loadPortal, type PortalAccessInfo } from "@/lib/portal-data";
import { buildPortalUrl } from "@/lib/portal-access";
import { easternDateString } from "@/lib/portal-deadline";
import { holidaySet } from "@/lib/us-holidays";
import {
  classifyReminders,
  dueWordFor,
  buildReminderEmail,
  buildOverdueNudgeText,
  type ReminderKind,
} from "@/lib/portal-reminders";
import { resolveProjectChannel } from "@/lib/project-channel";
import { postChannelMessage, sendSlackDM } from "@/lib/slack-dm";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const auth = req.headers.get("authorization");
  return Boolean(process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`);
}

function deriveBaseUrl(req: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL ?? "";
  if (envUrl) return envUrl.startsWith("http") ? envUrl : `https://${envUrl}`;
  const proto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("host");
  if (proto && host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

interface Summary {
  ok: boolean;
  dryRun: boolean;
  accesses: number;
  emailed: number;
  nudged: number;
  skipped: number;
  /** What was (or in a dry run, would be) sent. */
  items: Array<{
    kind: ReminderKind;
    client: string;
    project: string;
    deliverableType: string;
    due: string;
    channel: "email" | "slack" | "none";
    result: "sent" | "would-send" | "skipped";
    reason?: string;
  }>;
}

/**
 * Claim today's slot for this delivery + kind. False when a row already
 * exists (an earlier run sent it), so a re-run never double-sends.
 */
async function claim(deliveryId: string, kind: ReminderKind, sentOn: string): Promise<boolean> {
  try {
    await prisma.portalReminder.create({ data: { deliveryId, kind, sentOn } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
}

async function releaseClaim(deliveryId: string, kind: ReminderKind, sentOn: string): Promise<void> {
  await prisma.portalReminder.deleteMany({ where: { deliveryId, kind, sentOn } }).catch(() => {});
}

function firstName(email: string): string | null {
  // "dana.smith@acme.com" -> "Dana"; anything unreadable -> null (generic greeting).
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._-]/)[0] ?? "";
  if (!/^[a-z]{2,}$/i.test(first)) return null;
  return first[0].toUpperCase() + first.slice(1).toLowerCase();
}

async function postReminderEmail(webhook: string, payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`reminder webhook returned ${res.status}`);
}

async function processAccess(
  access: PortalAccessInfo,
  ctx: { now: number; sentOn: string; closures: Set<string>; baseUrl: string; dryRun: boolean; webhook: string },
  summary: Summary,
  warned: { webhook: boolean }
): Promise<void> {
  const data = await loadPortal(access);
  const awaiting = data.actionItems;
  const buckets = classifyReminders(
    awaiting.map((a) => ({
      deliveryId: a.entry.id,
      dueMs: a.status.dueMs,
      state: a.status.state,
      sentAt: a.entry.sentAt,
    })),
    ctx.now,
    ctx.closures
  );
  const ids = [...buckets.tomorrow, ...buckets.today, ...buckets.overdue];
  if (ids.length === 0) return;

  const rows = await prisma.delivery.findMany({
    where: { id: { in: ids } },
    select: { id: true, primaryEmail: true, ccEmails: true, senderEmail: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const itemById = new Map(awaiting.map((a) => [a.entry.id, a]));

  const kinds: Array<["tomorrow" | "today", string[]]> = [
    ["tomorrow", buckets.tomorrow],
    ["today", buckets.today],
  ];
  for (const [kind, list] of kinds) {
    for (const id of list) {
      const item = itemById.get(id);
      const row = byId.get(id);
      if (!item || !row) continue;
      const base = {
        kind,
        client: access.clientName,
        project: item.projectName,
        deliverableType: item.entry.deliverableType,
        due: item.status.dueLabel,
      } as const;
      const to = row.primaryEmail.trim();
      if (!to) {
        summary.skipped++;
        summary.items.push({ ...base, channel: "none", result: "skipped", reason: "no primary email (Slack delivery)" });
        continue;
      }
      if (ctx.dryRun) {
        summary.emailed++;
        summary.items.push({ ...base, channel: "email", result: "would-send" });
        continue;
      }
      if (!ctx.webhook) {
        if (!warned.webhook) {
          console.warn("N8N_PORTAL_REMINDER_WEBHOOK_URL not set; skipping");
          warned.webhook = true;
        }
        summary.skipped++;
        summary.items.push({ ...base, channel: "email", result: "skipped", reason: "webhook not configured" });
        continue;
      }
      if (!(await claim(id, kind, ctx.sentOn))) {
        summary.skipped++;
        summary.items.push({ ...base, channel: "email", result: "skipped", reason: "already sent today" });
        continue;
      }
      const portalUrl = buildPortalUrl(ctx.baseUrl, access.token, item.entry.projectListId);
      const email = buildReminderEmail({
        kind,
        clientName: access.clientName,
        projectName: item.projectName,
        deliverableType: item.entry.deliverableType,
        dueLabel: item.status.dueLabel,
        portalUrl,
        dueWord: dueWordFor(kind, item.status.dueMs, ctx.now),
        primaryFirstName: firstName(to),
      });
      try {
        await postReminderEmail(ctx.webhook, {
          to,
          cc: row.ccEmails ?? "",
          from: row.senderEmail,
          subject: email.subject,
          html: email.html,
          text: email.text,
          portal_url: portalUrl,
          delivery_id: id,
          kind,
        });
        summary.emailed++;
        summary.items.push({ ...base, channel: "email", result: "sent" });
      } catch (err) {
        console.error("[portal-reminders] email failed", id, kind, err);
        await releaseClaim(id, kind, ctx.sentOn);
        summary.skipped++;
        summary.items.push({ ...base, channel: "email", result: "skipped", reason: "webhook call failed" });
      }
    }
  }

  for (const id of buckets.overdue) {
    const item = itemById.get(id);
    const row = byId.get(id);
    if (!item || !row) continue;
    const base = {
      kind: "overdue" as const,
      client: access.clientName,
      project: item.projectName,
      deliverableType: item.entry.deliverableType,
      due: item.status.dueLabel,
    };
    if (ctx.dryRun) {
      summary.nudged++;
      summary.items.push({ ...base, channel: "slack", result: "would-send" });
      continue;
    }
    if (!(await claim(id, "overdue", ctx.sentOn))) {
      summary.skipped++;
      summary.items.push({ ...base, channel: "slack", result: "skipped", reason: "already sent today" });
      continue;
    }
    const text = buildOverdueNudgeText({
      clientName: access.clientName,
      projectName: item.projectName,
      deliverableType: item.entry.deliverableType,
      dueLabel: item.status.dueLabel,
      portalUrl: buildPortalUrl(ctx.baseUrl, access.token, item.entry.projectListId),
    });
    let ok = false;
    if (item.entry.projectListId) {
      try {
        const ch = await resolveProjectChannel(item.entry.projectListId, item.projectName, access.clientName);
        if (ch.channelId) ok = Boolean(await postChannelMessage(ch.channelId, text));
      } catch (err) {
        console.error("[portal-reminders] channel resolve failed", item.entry.projectListId, err);
      }
    }
    if (!ok) ok = await sendSlackDM(row.senderEmail, text);
    if (ok) {
      summary.nudged++;
      summary.items.push({ ...base, channel: "slack", result: "sent" });
    } else {
      await releaseClaim(id, "overdue", ctx.sentOn);
      summary.skipped++;
      summary.items.push({ ...base, channel: "slack", result: "skipped", reason: "Slack post and DM both failed" });
    }
  }
}

async function runCron(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  const summary: Summary = { ok: true, dryRun, accesses: 0, emailed: 0, nudged: 0, skipped: 0, items: [] };
  try {
    const now = Date.now();
    const sentOn = easternDateString(now);
    const ctx = {
      now,
      sentOn,
      closures: holidaySet([Number(sentOn.slice(0, 4))]),
      baseUrl: deriveBaseUrl(req),
      dryRun,
      webhook: process.env.N8N_PORTAL_REMINDER_WEBHOOK_URL?.trim() ?? "",
    };
    const warned = { webhook: false };
    const accesses = await prisma.portalAccess.findMany({
      where: { revokedAt: null },
      select: { id: true, clientFolderId: true, clientName: true, token: true },
    });
    summary.accesses = accesses.length;
    for (const access of accesses) {
      try {
        await processAccess(access, ctx, summary, warned);
      } catch (err) {
        console.error("[portal-reminders] access failed", access.id, err);
        summary.skipped++;
      }
    }
    console.info(
      "[portal-reminders]",
      JSON.stringify({ dryRun, accesses: summary.accesses, emailed: summary.emailed, nudged: summary.nudged, skipped: summary.skipped })
    );
    return NextResponse.json(summary);
  } catch (e) {
    console.error("[portal-reminders] cron failed:", e);
    return NextResponse.json({ ...summary, ok: false, error: "Cron failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return runCron(req);
}

// Vercel cron uses GET; keep both.
export async function GET(req: Request) {
  return runCron(req);
}
