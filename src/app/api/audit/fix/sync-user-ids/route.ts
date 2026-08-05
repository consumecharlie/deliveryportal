import { NextResponse } from "next/server";

/**
 * POST /api/audit/fix/sync-user-ids
 *
 * Triggers the existing "Find Slack ID" n8n workflow (a batch crawl that fills
 * missing Slack user IDs across all lists) via its webhook. Returns 501 when the
 * webhook URL isn't configured so the UI can disable the action gracefully.
 */
export async function POST() {
  const url = process.env.N8N_FIND_SLACK_ID_WEBHOOK_URL;
  if (!url) {
    return NextResponse.json(
      { error: "Slack user-ID sync isn't configured (missing webhook URL)." },
      { status: 501 }
    );
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Sync trigger returned ${res.status}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("sync-user-ids fix failed:", e);
    return NextResponse.json({ error: "Failed to trigger sync" }, { status: 500 });
  }
}
