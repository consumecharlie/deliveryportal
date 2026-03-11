import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/analytics
 *
 * Returns aggregated delivery statistics for the analytics dashboard.
 * All data comes from the portal's PostgreSQL Delivery table.
 *
 * Query params:
 * - period: "30d" | "90d" | "12m" | "all" (default: "90d")
 */

interface WeeklyCount {
  week: string; // ISO week start date
  count: number;
}

interface DepartmentCount {
  department: string;
  count: number;
}

interface TypeCount {
  deliverableType: string;
  count: number;
}

interface SenderCount {
  senderEmail: string;
  count: number;
}

interface RecentDelivery {
  id: string;
  deliverableType: string;
  department: string;
  clientName: string;
  projectName: string;
  sentBy: string;
  sentAt: string;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") ?? "90d";

    // Calculate the start date based on the period
    let startDate: Date | undefined;
    const now = new Date();

    switch (period) {
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "12m":
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      case "all":
        startDate = undefined;
        break;
      default:
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    }

    const where = startDate ? { sentAt: { gte: startDate } } : {};

    // Fetch all deliveries in the period
    const deliveries: Array<{
      id: string;
      deliverableType: string;
      department: string;
      clientName: string;
      projectName: string;
      senderEmail: string;
      sentBy: string | null;
      sentAt: Date;
      wasEdited: boolean;
      primaryEmail: string;
      slackChannel: string | null;
    }> = await prisma.delivery.findMany({
      where,
      orderBy: { sentAt: "desc" },
      select: {
        id: true,
        deliverableType: true,
        department: true,
        clientName: true,
        projectName: true,
        senderEmail: true,
        sentBy: true,
        sentAt: true,
        wasEdited: true,
        primaryEmail: true,
        slackChannel: true,
      },
    });

    const totalDeliveries = deliveries.length;

    // ── Deliveries over time (weekly buckets) ──
    const weeklyMap = new Map<string, number>();
    for (const d of deliveries) {
      const date = new Date(d.sentAt);
      // Get the Monday of the week
      const day = date.getDay();
      const monday = new Date(date);
      monday.setDate(date.getDate() - ((day + 6) % 7));
      const weekKey = monday.toISOString().split("T")[0];
      weeklyMap.set(weekKey, (weeklyMap.get(weekKey) ?? 0) + 1);
    }

    const deliveriesOverTime: WeeklyCount[] = Array.from(weeklyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, count]) => ({ week, count }));

    // ── By department ──
    const deptMap = new Map<string, number>();
    for (const d of deliveries) {
      const dept = d.department || "Unknown";
      deptMap.set(dept, (deptMap.get(dept) ?? 0) + 1);
    }

    const byDepartment: DepartmentCount[] = Array.from(deptMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([department, count]) => ({ department, count }));

    // ── By deliverable type ──
    const typeMap = new Map<string, number>();
    for (const d of deliveries) {
      const type = d.deliverableType || "Unknown";
      typeMap.set(type, (typeMap.get(type) ?? 0) + 1);
    }

    const byType: TypeCount[] = Array.from(typeMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([deliverableType, count]) => ({ deliverableType, count }));

    // ── Team leaderboard (by sender) ──
    const senderMap = new Map<string, number>();
    for (const d of deliveries) {
      const sender = d.sentBy || d.senderEmail || "Unknown";
      senderMap.set(sender, (senderMap.get(sender) ?? 0) + 1);
    }

    const teamLeaderboard: SenderCount[] = Array.from(senderMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([senderEmail, count]) => ({ senderEmail, count }));

    // ── Additional stats ──
    const editedCount = deliveries.filter((d) => d.wasEdited).length;
    const slackCount = deliveries.filter((d) => !!d.slackChannel).length;
    const uniqueClients = new Set(deliveries.map((d) => d.clientName).filter(Boolean)).size;
    const uniqueProjects = new Set(deliveries.map((d) => d.projectName).filter(Boolean)).size;

    // ── Recent activity feed ──
    const recentActivity: RecentDelivery[] = deliveries.slice(0, 20).map((d) => ({
      id: d.id,
      deliverableType: d.deliverableType,
      department: d.department,
      clientName: d.clientName,
      projectName: d.projectName,
      sentBy: d.sentBy || d.senderEmail,
      sentAt: d.sentAt.toISOString(),
    }));

    return NextResponse.json({
      totalDeliveries,
      editedCount,
      slackCount,
      uniqueClients,
      uniqueProjects,
      deliveriesOverTime,
      byDepartment,
      byType: byType.slice(0, 15), // Top 15 types
      teamLeaderboard,
      recentActivity,
      period,
    });
  } catch (error) {
    console.error("Failed to fetch analytics:", error);
    return NextResponse.json({
      totalDeliveries: 0,
      editedCount: 0,
      slackCount: 0,
      uniqueClients: 0,
      uniqueProjects: 0,
      deliveriesOverTime: [],
      byDepartment: [],
      byType: [],
      teamLeaderboard: [],
      recentActivity: [],
      period: "90d",
    });
  }
}
