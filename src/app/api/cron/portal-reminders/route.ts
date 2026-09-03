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
  greetingNameFromBody,
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

async function postReminderEmail(webhook: string, payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`reminder webhook returned ${res.status}`);
}

interface RunContext {
  now: number;
  sentOn: string;
  closures: Set<string>;
  baseUrl: string;
  dryRun: boolean;
  webhook: string;
}

type ItemResult = Omit<Summary["items"][number], "kind" | "client" | "project" | "deliverableType" | "due">;

type AwaitingItem = Awaited<ReturnType<typeof loadPortal>>["actionItems"][number];

async function loadDeliveryRow(id: string) {
  return prisma.delivery.findUnique({
    where: { id },
    select: { id: true, primaryEmail: true, ccEmails: true, senderEmail: true, emailContent: true },
  });
}

async function emailItem(
  kind: "tomorrow" | "today",
  item: AwaitingItem,
  access: PortalAccessInfo,
  ctx: RunContext,
  warned: { webhook: boolean }
): Promise<ItemResult> {
  const row = await loadDeliveryRow(item.entry.id);
  if (!row) return { channel: "none", result: "skipped", reason: "delivery row missing" };
  const to = row.primaryEmail.trim();
  if (!to) return { channel: "none", result: "skipped", reason: "no primary email (Slack delivery)" };
  if (ctx.dryRun) return { channel: "email", result: "would-send" };
  if (!ctx.webhook) {
    if (!warned.webhook) {
      console.warn("N8N_PORTAL_REMINDER_WEBHOOK_URL not set; skipping");
      warned.webhook = true;
    }
    return { channel: "email", result: "skipped", reason: "webhook not configured" };
  }
  const id = item.entry.id;
  if (!(await claim(id, kind, ctx.sentOn))) return { channel: "email", result: "skipped", reason: "already sent today" };

  const portalUrl = buildPortalUrl(ctx.baseUrl, access.token, item.entry.projectListId);
  const email = buildReminderEmail({
    kind,
    projectName: item.projectName,
    deliverableType: item.entry.deliverableType,
    dueLabel: item.status.dueLabel,
    portalUrl,
    dueWord: dueWordFor(kind, item.status.dueMs, ctx.now),
    primaryFirstName: greetingNameFromBody(row.emailContent),
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
    return { channel: "email", result: "sent" };
  } catch (err) {
    console.error("[portal-reminders] email failed", id, kind, err);
    await releaseClaim(id, kind, ctx.sentOn);
    return { channel: "email", result: "skipped", reason: "webhook call failed" };
  }
}

async function nudgeItem(item: AwaitingItem, access: PortalAccessInfo, ctx: RunContext): Promise<ItemResult> {
  const row = await loadDeliveryRow(item.entry.id);
  if (!row) return { channel: "none", result: "skipped", reason: "delivery row missing" };
  if (ctx.dryRun) return { channel: "slack", result: "would-send" };
  const id = item.entry.id;
  if (!(await claim(id, "overdue", ctx.sentOn))) return { channel: "slack", result: "skipped", reason: "already sent today" };

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
  if (ok) return { channel: "slack", result: "sent" };
  await releaseClaim(id, "overdue", ctx.sentOn);
  return { channel: "slack", result: "skipped", reason: "Slack post and DM both failed" };
}

async function processAccess(
  access: PortalAccessInfo,
  ctx: RunContext,
  summary: Summary,
  warned: { webhook: boolean }
): Promise<void> {
  const data = await loadPortal(access);
  const awaiting = data.actionItems;
  const buckets = classifyReminders(
    awaiting.map((a) => ({ deliveryId: a.entry.id, dueMs: a.status.dueMs, state: a.status.state })),
    ctx.now,
    ctx.closures
  );
  const itemById = new Map(awaiting.map((a) => [a.entry.id, a]));

  const work: Array<[ReminderKind, string[]]> = [
    ["tomorrow", buckets.tomorrow],
    ["today", buckets.today],
    ["overdue", buckets.overdue],
  ];
  for (const [kind, ids] of work) {
    for (const id of ids) {
      const item = itemById.get(id);
      if (!item) continue;
      const base = {
        kind,
        client: access.clientName,
        project: item.projectName,
        deliverableType: item.entry.deliverableType,
        due: item.status.dueLabel,
      };
      // One bad item (DB hiccup, malformed row) must not stop the rest.
      let result: ItemResult;
      try {
        result = kind === "overdue" ? await nudgeItem(item, access, ctx) : await emailItem(kind, item, access, ctx, warned);
      } catch (err) {
        console.error("[portal-reminders] item failed", id, kind, err);
        result = { channel: "none", result: "skipped", reason: "unexpected error" };
      }
      if (result.result === "skipped") summary.skipped++;
      else if (result.channel === "email") summary.emailed++;
      else summary.nudged++;
      summary.items.push({ ...base, ...result });
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
    const ctx: RunContext = {
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
