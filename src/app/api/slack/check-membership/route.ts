import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/slack/check-membership?channelId=xxx&email=xxx
 *
 * Checks whether a user (by email) is a member of the given Slack channel.
 * Returns { isMember: boolean, slackUserId?: string, error?: string }
 */
export async function GET(req: NextRequest) {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "SLACK_BOT_TOKEN is not configured" },
      { status: 500 }
    );
  }

  const channelId = req.nextUrl.searchParams.get("channelId");
  const email = req.nextUrl.searchParams.get("email");

  if (!channelId || !email) {
    return NextResponse.json(
      { error: "channelId and email are required" },
      { status: 400 }
    );
  }

  try {
    // 1. Look up Slack user by email
    const userRes = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const userData = await userRes.json();

    if (!userData.ok) {
      // User not found in Slack workspace at all
      if (userData.error === "users_not_found") {
        return NextResponse.json({
          isMember: false,
          reason: "not_in_workspace",
        });
      }
      throw new Error(`Slack users.lookupByEmail error: ${userData.error}`);
    }

    const slackUserId = userData.user.id;

    // 2. Get channel members (paginate through all)
    const memberIds = new Set<string>();
    let cursor: string | undefined;

    do {
      const params = new URLSearchParams({
        channel: channelId,
        limit: "500",
      });
      if (cursor) params.set("cursor", cursor);

      const membersRes = await fetch(
        `https://slack.com/api/conversations.members?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const membersData = await membersRes.json();

      if (!membersData.ok) {
        throw new Error(
          `Slack conversations.members error: ${membersData.error}`
        );
      }

      for (const id of membersData.members ?? []) {
        memberIds.add(id);
      }

      cursor = membersData.response_metadata?.next_cursor || undefined;
    } while (cursor);

    return NextResponse.json({
      isMember: memberIds.has(slackUserId),
      slackUserId,
    });
  } catch (error) {
    console.error("Failed to check channel membership:", error);
    return NextResponse.json(
      { error: "Failed to check channel membership" },
      { status: 500 }
    );
  }
}
