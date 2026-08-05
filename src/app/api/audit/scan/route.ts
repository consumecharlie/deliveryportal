import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scanAllProjects, scanProject } from "@/lib/audit-scan";

// A full sweep touches ~30 projects (ClickUp + Slack); allow room past the
// default serverless timeout.
export const maxDuration = 60;

/**
 * POST /api/audit/scan            → full sweep of all projects
 * POST /api/audit/scan?listId=X   → re-scan just one project (used after a fix)
 */
export async function POST(req: Request) {
  try {
    const listId = new URL(req.url).searchParams.get("listId");
    if (listId) {
      const row = await prisma.auditResult.findUnique({ where: { listId } });
      if (!row) {
        return NextResponse.json(
          { error: "No prior scan for this project; run a full scan first." },
          { status: 404 }
        );
      }
      await scanProject({
        listId,
        clientName: row.clientName,
        projectName: row.projectName,
      });
      return NextResponse.json({ ok: true, scanned: 1 });
    }
    const scanned = await scanAllProjects();
    return NextResponse.json({ ok: true, scanned });
  } catch (e) {
    console.error("Audit scan failed:", e);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
