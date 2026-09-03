/**
 * Best-effort view logging for the client portal. Never throws and never
 * blocks rendering; crawlers, link previews and empty user agents are skipped.
 */
import { prisma } from "@/lib/db";
import { headers } from "next/headers";

const SKIP_UA = /bot|crawl|preview|slackbot|facebookexternalhit/i;

export async function recordView(accessId: string, deliveryId: string | null): Promise<void> {
  try {
    const ua = (await headers()).get("user-agent")?.trim() ?? "";
    if (!ua || SKIP_UA.test(ua)) return;
    await prisma.portalView.create({
      data: { accessId, deliveryId, userAgent: ua.slice(0, 200) },
    });
  } catch {
    /* never block rendering */
  }
}
