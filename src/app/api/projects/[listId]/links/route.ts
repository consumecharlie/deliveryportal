import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getList } from "@/lib/clickup";

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
    // Fetch the project name from ClickUp alongside the deliveries.
    // If the ClickUp call fails, we still return the deliveries.
    const [listResult, deliveriesResult] = await Promise.allSettled([
      getList(listId),
      prisma.delivery.findMany({
        where: { projectListId: listId },
        orderBy: { sentAt: "desc" },
        include: { links: true },
      }),
    ]);

    const projectName =
      listResult.status === "fulfilled"
        ? (listResult.value as { name?: string })?.name ?? null
        : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deliveries: any[] =
      deliveriesResult.status === "fulfilled" ? deliveriesResult.value : [];

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
      projectName,
      deliveries: deliveries.map((d) => ({
        id: d.id,
        deliverableType: d.deliverableType,
        department: d.department,
        sentAt: d.sentAt,
        sentBy: d.sentBy,
        senderEmail: d.senderEmail,
        primaryEmail: d.primaryEmail,
        emailSubject: d.emailSubject,
        slackChannel: d.slackChannel,
        slackChannelName: d.slackChannelName,
        links: d.links,
      })),
      allLinks,
      total: deliveries.length,
    });
  } catch (error) {
    console.error("Failed to fetch project links:", error);
    return NextResponse.json({ projectName: null, deliveries: [], allLinks: [], total: 0 });
  }
}
