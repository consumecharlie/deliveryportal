import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getListTasks } from "@/lib/clickup";
import { resolveProjectComms } from "@/lib/project-comms";
import { listVisibleChannels } from "@/lib/slack-audit";
import { rankChannels } from "@/lib/channel-suggest";

export const maxDuration = 60;

/**
 * GET /api/setup/channels/suggest?listId=
 *
 * Ranked Slack channel candidates for a project (name similarity to the client),
 * including channels the bot hasn't joined yet.
 */
export async function GET(req: Request) {
  try {
    const listId = new URL(req.url).searchParams.get("listId");
    if (!listId) {
      return NextResponse.json({ error: "listId is required" }, { status: 400 });
    }
    const row = await prisma.auditResult.findUnique({ where: { listId } });
    const clientName = row?.clientName ?? "";

    const { tasks } = await getListTasks(listId, true);
    const resolved = resolveProjectComms(tasks);
    const contactNames = resolved.contacts.map((c) => c.name);

    const channels = await listVisibleChannels();
    const privateById = new Map(channels.map((c) => [c.id, c.isPrivate]));
    const ranked = rankChannels(
      clientName,
      contactNames,
      channels.map((c) => ({
        id: c.id,
        name: c.name,
        isMember: c.isMember,
        memberNames: [],
      }))
    );
    const candidates = ranked.slice(0, 8).map((c) => ({
      ...c,
      isPrivate: privateById.get(c.id) ?? false,
    }));

    return NextResponse.json({
      candidates,
      currentChannelId: resolved.slackChannelId,
    });
  } catch (e) {
    console.error("channel suggest failed:", e);
    return NextResponse.json({ error: "Suggest failed" }, { status: 500 });
  }
}
