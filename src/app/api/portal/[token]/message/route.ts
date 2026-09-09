/**
 * Reach-out form: a client note from the portal. The row is written first so
 * nothing is lost when Slack is down; the Slack post (project channel, else a
 * DM to whoever sent the client's latest delivery) is best effort.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAccess, type PortalAccessInfo } from "@/lib/portal-data";
import { buildPortalUrl } from "@/lib/portal-access";
import { getAppBaseUrl } from "@/lib/app-base-url";
import { resolveProjectChannel } from "@/lib/project-channel";
import { postChannelMessage, sendSlackDM } from "@/lib/slack-dm";
import { isPortalSandbox, sandboxSlackDeliver } from "@/lib/portal-sandbox";
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

/**
 * The project this note came from, only when this client has deliveries in
 * it. Ownership is a DB check, not a live load; a foreign list id is treated
 * as no project context at all (not stored, not posted).
 */
async function ownedProject(access: PortalAccessInfo, listId: string | null | undefined) {
  if (!listId) return null;
  return prisma.delivery.findFirst({
    where: { clientFolderId: access.clientFolderId, projectListId: listId },
    select: { id: true, projectName: true },
  });
}

async function postToProjectChannel(
  access: PortalAccessInfo,
  listId: string,
  projectName: string,
  text: string
): Promise<boolean> {
  const ch = await resolveProjectChannel(listId, projectName, access.clientName);
  if (!ch.channelId) return false;
  if (isPortalSandbox()) {
    return sandboxSlackDeliver({ kind: "channel", channelId: ch.channelId, channelName: ch.channelName }, text);
  }
  return Boolean(await postChannelMessage(ch.channelId, text));
}

async function dmLatestSender(clientFolderId: string, text: string): Promise<boolean> {
  const latest = await prisma.delivery.findFirst({
    where: { clientFolderId },
    orderBy: { sentAt: "desc" },
    select: { senderEmail: true },
  });
  if (isPortalSandbox()) {
    return sandboxSlackDeliver(
      latest?.senderEmail ? { kind: "dm", email: latest.senderEmail } : { kind: "none" },
      text
    );
  }
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
  const { name, message } = parsed.value;

  try {
    const since = new Date(Date.now() - REACH_OUT_RATE_WINDOW_MS);
    const recent = await prisma.portalMessage.count({ where: { accessId: access.id, createdAt: { gte: since } } });
    if (recent >= REACH_OUT_RATE_LIMIT) return json({ error: REACH_OUT_RATE_MESSAGE }, 429);

    const project = await ownedProject(access, parsed.value.listId);
    const listId = project ? parsed.value.listId : null;

    // 1. Persist first: the row is the record, Slack is the notification.
    const row = await prisma.portalMessage.create({
      data: { accessId: access.id, projectListId: listId, name, message },
      select: { id: true },
    });

    // 2. Slack, best effort.
    const text = buildReachOutText({
      clientName: access.clientName,
      name,
      message,
      portalUrl: buildPortalUrl(getAppBaseUrl(req), token, listId),
    });
    let slackOk = false;
    if (project && listId) {
      try {
        slackOk = await postToProjectChannel(access, listId, project.projectName, text);
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
