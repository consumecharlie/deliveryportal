const SLACK = "https://slack.com/api";
function authHeader() {
  return { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN ?? ""}` };
}

export interface ChannelMembership {
  channelId: string;
  name: string | null;
  isMember: boolean;
  isPrivate: boolean;
  /** true when Slack couldn't return the channel (e.g. private + bot not in). */
  notVisible: boolean;
}

export async function getChannelMembership(channelId: string): Promise<ChannelMembership> {
  const res = await fetch(`${SLACK}/conversations.info?channel=${encodeURIComponent(channelId)}`, {
    headers: authHeader(),
  });
  const data = await res.json();
  if (!data.ok) {
    // channel_not_found on a private channel the bot isn't in → not visible.
    return { channelId, name: null, isMember: false, isPrivate: false, notVisible: true };
  }
  return {
    channelId,
    name: data.channel?.name ?? null,
    isMember: data.channel?.is_member ?? false,
    isPrivate: data.channel?.is_private ?? false,
    notVisible: false,
  };
}

export async function getOurTeamId(): Promise<string | null> {
  const r = await fetch(`${SLACK}/auth.test`, { headers: authHeader() });
  const d = await r.json();
  return d.ok ? d.team_id : null;
}

export interface ChannelPerson {
  userId: string;
  name: string;
  email?: string;
  teamId?: string;
  isBot: boolean;
}

/** All members of a channel, resolved to name/email/team via users.info. */
export async function listChannelPeople(channelId: string): Promise<ChannelPerson[]> {
  const people: ChannelPerson[] = [];
  let cursor = "";
  for (let i = 0; i < 10; i++) {
    const params = new URLSearchParams({ channel: channelId, limit: "200" });
    if (cursor) params.set("cursor", cursor);
    const r = await fetch(`${SLACK}/conversations.members?${params}`, { headers: authHeader() });
    const d = await r.json();
    if (!d.ok) break;
    for (const uid of (d.members ?? []) as string[]) {
      const u = await (await fetch(`${SLACK}/users.info?user=${uid}`, { headers: authHeader() })).json();
      if (!u.ok) continue;
      people.push({
        userId: uid,
        name: u.user.profile?.real_name || u.user.name,
        email: u.user.profile?.email || undefined,
        teamId: u.user.team_id,
        isBot: !!u.user.is_bot,
      });
    }
    cursor = d.response_metadata?.next_cursor || "";
    if (!cursor) break;
  }
  return people;
}

export interface VisibleChannel {
  id: string;
  name: string;
  isMember: boolean;
  isPrivate: boolean;
}

/** Channels the bot can see (public + shared, joined or not) for suggestion. */
export async function listVisibleChannels(): Promise<VisibleChannel[]> {
  const out: VisibleChannel[] = [];
  let cursor = "";
  for (let i = 0; i < 20; i++) {
    const params = new URLSearchParams({
      types: "public_channel,private_channel",
      exclude_archived: "true",
      limit: "200",
    });
    if (cursor) params.set("cursor", cursor);
    const d = await (await fetch(`${SLACK}/conversations.list?${params}`, { headers: authHeader() })).json();
    if (!d.ok) break;
    for (const c of d.channels ?? []) {
      out.push({ id: c.id, name: c.name, isMember: !!c.is_member, isPrivate: !!c.is_private });
    }
    cursor = d.response_metadata?.next_cursor || "";
    if (!cursor) break;
  }
  return out;
}

export async function joinChannel(channelId: string): Promise<{ ok: boolean; error?: string }> {
  // conversations.join only works for public channels (bot self-join).
  const res = await fetch(`${SLACK}/conversations.join`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ channel: channelId }),
  });
  const data = await res.json();
  return { ok: !!data.ok, error: data.ok ? undefined : data.error };
}
