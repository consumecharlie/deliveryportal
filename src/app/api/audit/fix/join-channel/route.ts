import { NextResponse } from "next/server";
import { joinChannel } from "@/lib/slack-audit";

/**
 * POST /api/audit/fix/join-channel  { channelId }
 *
 * Has the n8n bot self-join a PUBLIC channel. Private/external channels can't
 * be self-joined (Slack returns an error) — the UI routes those to a guided
 * `/invite @n8n` instead.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { channelId?: string };
    const channelId = body.channelId;
    if (!channelId) {
      return NextResponse.json({ error: "channelId is required" }, { status: 400 });
    }
    const result = await joinChannel(channelId);
    if (!result.ok) {
      return NextResponse.json(
        { error: `Couldn't join: ${result.error ?? "unknown error"}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("join-channel fix failed:", e);
    return NextResponse.json({ error: "Join failed" }, { status: 500 });
  }
}
