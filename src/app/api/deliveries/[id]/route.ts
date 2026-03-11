import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/deliveries/[id]
 *
 * Get full delivery detail including message content, links, and status.
 */
export async function GET(
  _req: Request,
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

    return NextResponse.json({ delivery });
  } catch (error) {
    console.error("Failed to fetch delivery:", error);
    return NextResponse.json(
      { error: "Failed to fetch delivery" },
      { status: 500 }
    );
  }
}
