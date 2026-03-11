import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/templates/history/[taskId]
 *
 * Returns the version history for a template, ordered by most recent first.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  try {
    const versions = await prisma.templateVersion.findMany({
      where: { templateTaskId: taskId },
      orderBy: { editedAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ versions });
  } catch (error) {
    console.error("Failed to fetch template history:", error);
    return NextResponse.json({ versions: [] });
  }
}
