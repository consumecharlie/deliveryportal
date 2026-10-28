import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withinBusinessHours } from "@/lib/business-hours";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const auth = req.headers.get("authorization");
  return Boolean(
    process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
  );
}

async function runCron(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Off-hours: return immediately WITHOUT touching the DB so the Neon compute
  // is allowed to scale to zero overnight/weekends. The keep-warm ping only
  // fires during business hours, when slow cold starts actually hurt users.
  if (!withinBusinessHours(new Date())) {
    return NextResponse.json({ ok: true, warmed: false, reason: "off-hours" });
  }

  try {
    // Trivial query — its only job is to keep the Neon compute awake.
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, warmed: true });
  } catch (e) {
    console.error("keep-warm ping failed:", e);
    return NextResponse.json({ ok: false, warmed: false }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return runCron(req);
}

// Vercel cron uses GET; keep both.
export async function GET(req: Request) {
  return runCron(req);
}
