import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/projects/[listId]/links
 *
 * Returns all delivery links associated with a project (ClickUp list),
 * grouped by delivery. Includes the delivery metadata for context.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ listId: string }> }
) {
  const { listId } = await params;

  try {
    // Fetch all deliveries for this project, including their links
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deliveries: any[] = await prisma.delivery.findMany({
      where: { projectListId: listId },
      orderBy: { sentAt: "desc" },
      include: {
        links: true,
      },
    });

    // Also collect a flat list of all unique links across deliveries
    const allLinks: Array<{
      url: string;
      label: string;
      linkType: string;
      variableName: string | null;
      deliverableType: string;
      sentAt: Date;
      deliveryId: string;
    }> = [];

    for (const delivery of deliveries) {
      for (const link of delivery.links) {
        allLinks.push({
          url: link.url,
          label: link.label,
          linkType: link.linkType,
          variableName: link.variableName,
          deliverableType: delivery.deliverableType,
          sentAt: delivery.sentAt,
          deliveryId: delivery.id,
        });
      }
    }

    return NextResponse.json({
      deliveries: deliveries.map((d) => ({
        id: d.id,
        deliverableType: d.deliverableType,
        department: d.department,
        sentAt: d.sentAt,
        sentBy: d.sentBy,
        senderEmail: d.senderEmail,
        primaryEmail: d.primaryEmail,
        emailSubject: d.emailSubject,
        links: d.links,
      })),
      allLinks,
      total: deliveries.length,
    });
  } catch (error) {
    console.error("Failed to fetch project links:", error);
    return NextResponse.json({ deliveries: [], allLinks: [], total: 0 });
  }
}
