import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/drafts
 *
 * List all saved drafts, ordered by most recently updated.
 */
export async function GET() {
  try {
    const drafts = await prisma.draft.findMany({
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ drafts });
  } catch (error) {
    console.error("Failed to fetch drafts:", error);
    return NextResponse.json({ drafts: [] });
  }
}
