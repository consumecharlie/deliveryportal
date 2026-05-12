import { NextResponse } from "next/server";

/**
 * GET /api/slack/channel-members?channelId=C04M4KNMLKV
 *
 * Fetches all members of a specific Slack channel, then resolves their
 * profile info (display name, real name, etc.) for use in @mention lists.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get("channelId");

  if (!channelId) {
    return NextResponse.json(
      { error: "channelId query param is required" },
      { status: 400 }
    );
  }

  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "SLACK_BOT_TOKEN is not configured" },
      { status: 500 }
    );
  }

  try {
    // Step 1: Get member IDs from the channel
    const memberIds: string[] = [];
    let cursor: string | undefined;

    do {
      const params = new URLSearchParams({
        channel: channelId,
        limit: "200",
      });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(
        `https://slack.com/api/conversations.members?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();

      if (!data.ok) {
        throw new Error(`Slack API error: ${data.error}`);
      }

      memberIds.push(...(data.members ?? []));
      cursor = data.response_metadata?.next_cursor || undefined;
    } while (cursor);

    // Step 2: Resolve user profiles (batch via users.info)
    // For efficiency, fetch in parallel batches
    const BATCH = 20;
    const members: Array<{
      id: string;
      name: string;
      realName?: string;
      displayName: string;
      avatar?: string;
      isBot: boolean;
    }> = [];

    for (let i = 0; i < memberIds.length; i += BATCH) {
      const batch = memberIds.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (userId) => {
          const res = await fetch(
            `https://slack.com/api/users.info?user=${userId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const data = await res.json();
          if (!data.ok || !data.user) return null;
          const u = data.user;
          // Slack stores the user's name across five fields that don't always
          // agree. Per Slack's docs, if profile.first_name or last_name are
          // set, top-level real_name is ignored — so we have to compose the
          // first/last fallback ourselves. Treat empty strings as missing.
          const first = u.profile?.first_name?.trim() ?? "";
          const last = u.profile?.last_name?.trim() ?? "";
          const composed = [first, last].filter(Boolean).join(" ").trim();
          const realName =
            (u.profile?.real_name_normalized?.trim() ||
              u.profile?.real_name?.trim() ||
              u.real_name?.trim() ||
              composed ||
              "") || undefined;

          return {
            id: u.id,
            name: u.name,
            realName,
            // Slack-style: display_name is the primary label (matches what
            // teammates see in Slack itself), real_name is shown as a muted
            // secondary line by the picker UI.
            displayName:
              u.profile?.display_name?.trim() || realName || u.name,
            avatar: u.profile?.image_48,
            isBot: u.is_bot ?? false,
          };
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value && !r.value.isBot) {
          members.push(r.value);
        }
      }
    }

    // Sort by display name
    members.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return NextResponse.json({ members, channelId });
  } catch (error) {
    console.error("Failed to fetch channel members:", error);
    return NextResponse.json(
      { error: "Failed to fetch channel members" },
      { status: 500 }
    );
  }
}
