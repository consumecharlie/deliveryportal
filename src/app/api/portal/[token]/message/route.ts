/**
 * Reach-out form: a client note from the portal. The row is written first so
 * nothing is lost when Slack is down; the Slack post (project channel, else a
 * DM to whoever sent the client's latest delivery) is best effort.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAccess, loadPortal, type PortalAccessInfo } from "@/lib/portal-data";
import { buildPortalUrl } from "@/lib/portal-access";
import { resolveProjectChannel } from "@/lib/project-channel";
import { postChannelMessage, sendSlackDM } from "@/lib/slack-dm";
import {
  validateReachOut,
  buildReachOutText,
  REACH_OUT_RATE_LIMIT,
  REACH_OUT_RATE_WINDOW_MS,
  REACH_OUT_RATE_MESSAGE,
} from "@/lib/portal-reach-out";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** Post to the project's internal channel when the note came from a project the client can see. */
async function postToProjectChannel(access: PortalAccessInfo, listId: string, text: string): Promise<boolean> {
  const data = await loadPortal(access, listId);
  const project = data.timeline.projects.find((p) => p.listId === listId);
  if (!project) return false;
  const ch = await resolveProjectChannel(listId, project.name, access.clientName);
  if (!ch.channelId) return false;
  return Boolean(await postChannelMessage(ch.channelId, text));
}

async function dmLatestSender(clientFolderId: string, text: string): Promise<boolean> {
  const latest = await prisma.delivery.findFirst({
    where: { clientFolderId },
    orderBy: { sentAt: "desc" },
    select: { senderEmail: true },
  });
  if (!latest?.senderEmail) return false;
  return sendSlackDM(latest.senderEmail, text);
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await resolveAccess(token);
  if (!access) return json({ error: "Not found" }, 404);

  const body = await req.json().catch(() => null);
  const parsed = validateReachOut(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { name, message, listId } = parsed.value;

  try {
    const since = new Date(Date.now() - REACH_OUT_RATE_WINDOW_MS);
    const recent = await prisma.portalMessage.count({ where: { accessId: access.id, createdAt: { gte: since } } });
    if (recent >= REACH_OUT_RATE_LIMIT) return json({ error: REACH_OUT_RATE_MESSAGE }, 429);

    // 1. Persist first: the row is the record, Slack is the notification.
    const row = await prisma.portalMessage.create({
      data: { accessId: access.id, projectListId: listId, name, message },
      select: { id: true },
    });

    // 2. Slack, best effort.
    const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const text = buildReachOutText({
      clientName: access.clientName,
      name,
      message,
      portalUrl: buildPortalUrl(base, token, listId),
    });
    let slackOk = false;
    if (listId) {
      try {
        slackOk = await postToProjectChannel(access, listId, text);
      } catch (err) {
        console.error("[portal-message] channel post failed", listId, err);
      }
    }
    if (!slackOk) {
      try {
        slackOk = await dmLatestSender(access.clientFolderId, text);
      } catch (err) {
        console.error("[portal-message] DM fallback failed", access.id, err);
      }
    }
    if (slackOk) await prisma.portalMessage.update({ where: { id: row.id }, data: { slackOk: true } });

    console.info("[portal-message]", JSON.stringify({ accessId: access.id, listId, slackOk, messageId: row.id }));
    return json({ ok: true });
  } catch (err) {
    console.error("[portal-message] failed", access.id, err);
    return json({ error: "Could not send, please try again" }, 500);
  }
}
