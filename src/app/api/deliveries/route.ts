import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/deliveries
 *
 * List sent deliveries with optional search/filter/pagination.
 * Query params: search, department, limit, offset
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

    const [deliveries, total] = await Promise.all([
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

    return NextResponse.json({ deliveries, total });
  } catch (error) {
    console.error("Failed to fetch deliveries:", error);
    return NextResponse.json({ deliveries: [], total: 0 });
  }
}
