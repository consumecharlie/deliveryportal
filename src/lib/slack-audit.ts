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
