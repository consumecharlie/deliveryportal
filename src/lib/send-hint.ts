import { del, list, put } from "@vercel/blob";
import { prisma } from "@/lib/db";

/**
 * "When is the next scheduled send due?" kept OUTSIDE Neon, in Vercel Blob,
 * so the scheduled-sends cron can skip the database off-hours and let the
 * Neon compute scale to zero.
 *
 * The hint is a blob pathname: `<prefix><epoch ms>` for the earliest
 * scheduled/firing draft, or `<prefix>none` when nothing is scheduled.
 * Pathnames come from `list()`, which hits the Blob API (never a CDN cache),
 * so a fresh write is visible on the next tick.
 *
 * Every failure mode leans toward querying the DB: no hint blobs means
 * "unknown" (query), several blobs means take the earliest (query sooner).
 * During business hours the cron ignores the hint entirely, which also
 * catches any send a lost hint write would otherwise delay.
 */
export const SEND_HINT_PREFIX = "cron/next-scheduled-send/";

/** undefined = unknown, null = nothing scheduled, number = earliest due (ms). */
export type SendHint = number | null | undefined;

export function parseSendHint(pathnames: string[]): SendHint {
  let earliest: number | null = null;
  let sawNone = false;
  for (const p of pathnames) {
    if (!p.startsWith(SEND_HINT_PREFIX)) continue;
    const tail = p.slice(SEND_HINT_PREFIX.length);
    if (tail === "none") {
      sawNone = true;
      continue;
    }
    const ms = Number(tail);
    if (!Number.isFinite(ms)) continue;
    earliest = earliest === null ? ms : Math.min(earliest, ms);
  }
  if (earliest !== null) return earliest;
  return sawNone ? null : undefined;
}

export function shouldQueryDrafts(opts: {
  now: Date;
  hint: SendHint;
  businessHours: boolean;
}): boolean {
  if (opts.businessHours) return true;
  if (opts.hint === undefined) return true;
  if (opts.hint === null) return false;
  return opts.hint <= opts.now.getTime();
}

export async function readSendHint(): Promise<SendHint> {
  try {
    const { blobs } = await list({ prefix: SEND_HINT_PREFIX });
    return parseSendHint(blobs.map((b) => b.pathname));
  } catch (e) {
    console.error("send hint read failed:", e);
    return undefined;
  }
}

/**
 * Recompute the hint from the Draft table and store it. Call after anything
 * that schedules, reschedules, cancels, fires or bounces a send. Never throws.
 */
export async function refreshSendHint(): Promise<void> {
  let existing: string[] = [];
  try {
    const earliest = await prisma.draft.findFirst({
      where: {
        OR: [{ scheduleStatus: "scheduled" }, { scheduleStatus: "firing" }],
        scheduledFor: { not: null },
      },
      orderBy: { scheduledFor: "asc" },
      select: { scheduledFor: true },
    });
    const pathname =
      SEND_HINT_PREFIX +
      (earliest?.scheduledFor ? String(earliest.scheduledFor.getTime()) : "none");
    existing = (await list({ prefix: SEND_HINT_PREFIX })).blobs.map((b) => b.url);
    const written = await put(pathname, "1", {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "text/plain",
    });
    const stale = existing.filter((u) => u !== written.url);
    if (stale.length) await del(stale);
  } catch (e) {
    console.error("send hint refresh failed:", e);
    // Fall back to "unknown" so the cron queries the DB on its next tick.
    try {
      const all = existing.length
        ? existing
        : (await list({ prefix: SEND_HINT_PREFIX })).blobs.map((b) => b.url);
      if (all.length) await del(all);
    } catch {
      // Nothing more to do; business hours still sweep the table.
    }
  }
}
