import { NextResponse } from "next/server";

/**
 * POST /api/slack/resolve-users
 *
 * Body: { ids: string[] }
 * Returns: { users: Array<{ id, name, avatar? }> }
 *
 * Calls Slack `users.info` for each ID in parallel batches. Use this for
 * Slack user IDs that aren't returned by `users.list` (the workspace
 * members endpoint) — primarily Slack Connect external users in shared
 * channels, who only show up via `users.info` direct lookup.
 *
 * Mirrors the same real_name resolution chain used by `/api/slack/members`:
 * profile.real_name_normalized → profile.real_name → real_name →
 * first_name + last_name → name.
 */
export async function POST(req: Request) {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({ users: [] }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids)
    ? body.ids.filter((id: unknown) => typeof id === "string")
    : [];

  if (ids.length === 0) return NextResponse.json({ users: [] });

  const BATCH = 20;
  const out: Array<{ id: string; name: string; avatar?: string }> = [];

  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (id) => {
        const res = await fetch(
          `https://slack.com/api/users.info?user=${encodeURIComponent(id)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.ok || !data.user) return null;
        const u = data.user;
        const first = u.profile?.first_name?.trim() ?? "";
        const last = u.profile?.last_name?.trim() ?? "";
        const composed = [first, last].filter(Boolean).join(" ");
        const name =
          (u.profile?.real_name_normalized?.trim() ||
            u.profile?.real_name?.trim() ||
            u.real_name?.trim() ||
            composed ||
            u.name ||
            id) ?? id;
        return {
          id: u.id,
          name,
          avatar: u.profile?.image_48 as string | undefined,
        };
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) out.push(r.value);
    }
  }

  return NextResponse.json({ users: out });
}
