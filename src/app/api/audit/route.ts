import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/audit
 *
 * Returns the cached per-project audit results (from the last scan). The page
 * reads this instantly; scanning happens via POST /api/audit/scan.
 */
export async function GET() {
  try {
    const rows = await prisma.auditResult.findMany({
      orderBy: { clientName: "asc" },
    });
    const results = rows.map((r) => r.data);
    const lastScannedAt = rows.reduce<string | null>((max, r) => {
      const t = r.scannedAt.toISOString();
      return !max || t > max ? t : max;
    }, null);
    return NextResponse.json({ results, lastScannedAt });
  } catch (e) {
    console.error("Failed to read audit results:", e);
    return NextResponse.json({ results: [], lastScannedAt: null });
  }
}
