import { NextResponse } from "next/server";
import { getListTasks } from "@/lib/clickup";
import { resolveProjectComms } from "@/lib/project-comms";
import { getOurTeamId, listChannelPeople } from "@/lib/slack-audit";
import { isExternalMember, matchMembersToContacts } from "@/lib/channel-people";

export const maxDuration = 60;

/**
 * GET /api/setup/channel-people?channelId=&listId=
 *
 * The channel's external (client-side) members, matched against the project's
 * existing contacts into a create/update plan.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const channelId = url.searchParams.get("channelId");
    const listId = url.searchParams.get("listId");
    if (!channelId || !listId) {
      return NextResponse.json(
        { error: "channelId and listId are required" },
        { status: 400 }
      );
    }

    const ourTeamId = (await getOurTeamId()) ?? "";
    const rawPeople = await listChannelPeople(channelId);
    const people = rawPeople
      .filter((p) => !p.isBot && isExternalMember(p.teamId, ourTeamId))
      .map((p) => ({
        userId: p.userId,
        name: p.name,
        email: p.email,
        isExternal: true,
      }));

    const { tasks } = await getListTasks(listId, true);
    const resolved = resolveProjectComms(tasks);
    const existing = resolved.contacts.map((c) => ({
      taskId: c.taskId,
      name: c.name,
      email: c.email || undefined,
      userId: c.slackUserId || undefined,
    }));

    const plan = matchMembersToContacts(people, existing);
    return NextResponse.json({ people, plan });
  } catch (e) {
    console.error("channel-people failed:", e);
    return NextResponse.json({ error: "Failed to load channel people" }, { status: 500 });
  }
}
