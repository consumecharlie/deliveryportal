import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deriveClientFeedback } from "@/lib/client-feedback-state";
import { buildPortalUrl } from "@/lib/portal-access";

/**
 * GET /api/deliveries/[id]
 *
 * Get full delivery detail including message content, links, and status,
 * plus the client feedback state, portal view count, and the client's
 * portal deep link for this delivery's project (null when the client has
 * no active portal link).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const delivery = await prisma.delivery.findUnique({
      where: { id },
      include: { links: true },
    });

    if (!delivery) {
      return NextResponse.json(
        { error: "Delivery not found" },
        { status: 404 }
      );
    }

    const [confirmation, portalViews, access] = await Promise.all([
      prisma.feedbackConfirmation.findFirst({
        where: { deliveryId: id },
        orderBy: { confirmedAt: "desc" },
        select: {
          deliveryId: true,
          confirmedAt: true,
          confirmedByName: true,
          undoneAt: true,
        },
      }),
      prisma.portalView.count({ where: { deliveryId: id } }),
      delivery.clientFolderId
        ? prisma.portalAccess.findFirst({
            where: { clientFolderId: delivery.clientFolderId, revokedAt: null },
            orderBy: { createdAt: "desc" },
            select: { token: true },
          })
        : Promise.resolve(null),
    ]);

    const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const portalUrl = access
      ? buildPortalUrl(base, access.token, delivery.projectListId)
      : null;

    return NextResponse.json({
      delivery: {
        ...delivery,
        clientFeedback: confirmation
          ? deriveClientFeedback([confirmation]).get(id) ?? null
          : null,
        portalViews,
        portalUrl,
      },
    });
  } catch (error) {
    console.error("Failed to fetch delivery:", error);
    return NextResponse.json(
      { error: "Failed to fetch delivery" },
      { status: 500 }
    );
  }
}
