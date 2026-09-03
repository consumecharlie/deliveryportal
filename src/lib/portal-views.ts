/**
 * Best-effort view logging for the client portal. Never throws and never
 * blocks rendering; crawlers, link previews and empty user agents are skipped.
 *
 * The caller reads the user agent up front and schedules this with after(),
 * since request headers are not readable once the response has been sent.
 */
import { prisma } from "@/lib/db";

const SKIP_UA = /bot|crawl|preview|slackbot|facebookexternalhit/i;

export async function recordView(
  accessId: string,
  deliveryId: string | null,
  userAgent: string | null | undefined
): Promise<void> {
  try {
    const ua = userAgent?.trim() ?? "";
    if (!ua || SKIP_UA.test(ua)) return;
    await prisma.portalView.create({
      data: { accessId, deliveryId, userAgent: ua.slice(0, 200) },
    });
  } catch {
    /* never block rendering */
  }
}
