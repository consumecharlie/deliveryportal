import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserEmail } from "@/lib/get-session-user";
import { resolveProjectChannel, rankProjectChannels } from "@/lib/project-channel";
import { getChannelMembership, joinChannel } from "@/lib/slack-audit";

/**
 * Internal Slack channel mapping per project (where portal confirmations post).
 *
 * GET  /api/settings/project-channel                       all mappings
 * GET  /api/settings/project-channel?listId=&projectName=&clientName=
 *                                                          resolution + suggestions (no writes)
 * PUT  /api/settings/project-channel { listId, channelId, channelName }
 * DELETE /api/settings/project-channel?listId=
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const listId = url.searchParams.get("listId")?.trim();
  try {
    if (!listId) {
      const channels = await prisma.projectChannel.findMany({ orderBy: { confirmedAt: "desc" } });
      return NextResponse.json({ channels });
    }
    const projectName = url.searchParams.get("projectName")?.trim() ?? "";
    const clientName = url.searchParams.get("clientName")?.trim() ?? "";
    // Read-only: never persists an auto-match, and always offers ranked
    // alternatives even when a mapping exists (resolve skips the crawl then).
    const resolution = await resolveProjectChannel(listId, projectName, clientName);
    const suggestions =
      resolution.suggestions.length > 0
        ? resolution.suggestions
        : await rankProjectChannels(projectName, clientName);
    return NextResponse.json({ ...resolution, suggestions });
  } catch (error) {
    console.error("Failed to load project channel:", error);
    return NextResponse.json({ error: "Failed to load project channel" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      listId?: string;
      channelId?: string;
      channelName?: string;
    };
    const listId = String(body.listId ?? "").trim();
    const channelId = String(body.channelId ?? "").trim();
    const channelName = String(body.channelName ?? "").trim();
    if (!listId || !channelId || !channelName) {
      return NextResponse.json(
        { error: "listId, channelId and channelName are required" },
        { status: 400 }
      );
    }
    const info = await getChannelMembership(channelId);
    if (info.notVisible) {
      return NextResponse.json(
        { error: "The bot cannot see that channel; invite it first" },
        { status: 400 }
      );
    }
    // Internal notes must never land in the client's Slack Connect channel.
    if (info.isShared) {
      return NextResponse.json(
        { error: "That channel is shared with the client. Pick an internal channel." },
        { status: 400 }
      );
    }
    const confirmedBy = await getSessionUserEmail();
    const data = { channelId, channelName, autoMatched: false, confirmedBy, confirmedAt: new Date() };
    const saved = await prisma.projectChannel.upsert({
      where: { projectListId: listId },
      create: { projectListId: listId, ...data },
      update: data,
    });
    // Best effort: public channels can be self-joined; private ones need an invite.
    const join = await joinChannel(channelId);
    if (!join.ok) console.warn("project-channel join failed", channelId, join.error);
    return NextResponse.json({ channel: saved, joined: join.ok, joinError: join.error ?? null });
  } catch (error) {
    console.error("Failed to save project channel:", error);
    return NextResponse.json({ error: "Failed to save project channel" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const listId = new URL(req.url).searchParams.get("listId")?.trim();
  if (!listId) return NextResponse.json({ error: "listId is required" }, { status: 400 });
  try {
    await prisma.projectChannel.deleteMany({ where: { projectListId: listId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to clear project channel:", error);
    return NextResponse.json({ error: "Failed to clear project channel" }, { status: 500 });
  }
}
