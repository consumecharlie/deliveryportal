import { NextResponse } from "next/server";
import type { SlackChannel } from "@/lib/types";

/**
 * GET /api/slack/channels
 *
 * Lists all Slack channels available to the bot.
 * Cached for 5 minutes via next revalidate.
 */
export const revalidate = 300;

export async function GET() {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) {
    console.warn("SLACK_BOT_TOKEN is empty or not set in environment");
    return NextResponse.json(
      { error: "SLACK_BOT_TOKEN is not configured. Add a valid xoxb-... token to .env.local." },
      { status: 500 }
    );
  }

  try {
    const channels: SlackChannel[] = [];
    let cursor: string | undefined;

    // Paginate through all channels
    do {
      const params = new URLSearchParams({
        types: "public_channel,private_channel",
        exclude_archived: "true",
        limit: "200",
      });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(
        `https://slack.com/api/conversations.list?${params}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();

      if (!data.ok) {
        throw new Error(`Slack API error: ${data.error}`);
      }

      for (const ch of data.channels ?? []) {
        channels.push({
          id: ch.id,
          name: ch.name,
          isMember: ch.is_member ?? false,
          numMembers: ch.num_members ?? 0,
          isExtShared: ch.is_ext_shared ?? false,
        });
      }

      cursor = data.response_metadata?.next_cursor || undefined;
    } while (cursor);

    // Sort: external (client) channels first, then internal, alphabetical within each
    channels.sort((a, b) => {
      if (a.isExtShared !== b.isExtShared) return a.isExtShared ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ channels });
  } catch (error) {
    console.error("Failed to fetch Slack channels:", error);
    return NextResponse.json(
      { error: "Failed to fetch Slack channels" },
      { status: 500 }
    );
  }
}
