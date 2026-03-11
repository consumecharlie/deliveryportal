import { NextResponse } from "next/server";
import type { SlackMember } from "@/lib/types";

/**
 * GET /api/slack/members
 *
 * Lists all Slack workspace members for @mention autocomplete.
 * Only returns members with a valid Slack user ID.
 * Cached for 5 minutes.
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
    const members: SlackMember[] = [];
    let cursor: string | undefined;

    do {
      const params = new URLSearchParams({ limit: "200" });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(
        `https://slack.com/api/users.list?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();

      if (!data.ok) throw new Error(`Slack API error: ${data.error}`);

      for (const user of data.members ?? []) {
        // Skip bots, deleted users, and restricted users
        if (user.deleted || user.is_bot || user.is_restricted) continue;

        members.push({
          id: user.id,
          name: user.name,
          realName: user.real_name ?? user.name,
          displayName: user.profile?.display_name || user.real_name || user.name,
          avatar: user.profile?.image_48,
        });
      }

      cursor = data.response_metadata?.next_cursor || undefined;
    } while (cursor);

    members.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return NextResponse.json({ members });
  } catch (error) {
    console.error("Failed to fetch Slack members:", error);
    return NextResponse.json(
      { error: "Failed to fetch Slack members" },
      { status: 500 }
    );
  }
}
