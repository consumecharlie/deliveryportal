import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deriveClientFeedback } from "@/lib/client-feedback-state";

/**
 * GET /api/deliveries
 *
 * List sent deliveries with optional search/filter/pagination.
 * Query params: search, department, limit, offset
 *
 * Each delivery also carries `clientFeedback` (newest FeedbackConfirmation,
 * or null when the client has never confirmed) and `portalViews` (count of
 * portal views of that delivery). Two extra queries per page, not per row.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? "";
    const department = searchParams.get("department") ?? "";
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
    const offset = Number(searchParams.get("offset")) || 0;

    const where: Record<string, unknown> = {};

    if (department) {
      where.department = department;
    }

    if (search) {
      where.OR = [
        { clientName: { contains: search, mode: "insensitive" } },
        { projectName: { contains: search, mode: "insensitive" } },
        { deliverableType: { contains: search, mode: "insensitive" } },
        { senderEmail: { contains: search, mode: "insensitive" } },
        { primaryEmail: { contains: search, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.delivery.findMany({
        where,
        orderBy: { sentAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          links: true,
        },
      }),
      prisma.delivery.count({ where }),
    ]);

    const ids = rows.map((d) => d.id);
    const [confirmations, views] = ids.length
      ? await Promise.all([
          prisma.feedbackConfirmation.findMany({
            where: { deliveryId: { in: ids } },
            orderBy: { confirmedAt: "desc" },
            select: {
              deliveryId: true,
              confirmedAt: true,
              confirmedByName: true,
              undoneAt: true,
            },
          }),
          prisma.portalView.groupBy({
            by: ["deliveryId"],
            where: { deliveryId: { in: ids } },
            _count: { _all: true },
          }),
        ])
      : [[], []];

    const feedbackById = deriveClientFeedback(confirmations);
    const viewsById = new Map<string, number>();
    for (const v of views) {
      if (v.deliveryId) viewsById.set(v.deliveryId, v._count._all);
    }

    const deliveries = rows.map((d) => ({
      ...d,
      clientFeedback: feedbackById.get(d.id) ?? null,
      portalViews: viewsById.get(d.id) ?? 0,
    }));

    return NextResponse.json({ deliveries, total });
  } catch (error) {
    console.error("Failed to fetch deliveries:", error);
    return NextResponse.json({ deliveries: [], total: 0 });
  }
}
