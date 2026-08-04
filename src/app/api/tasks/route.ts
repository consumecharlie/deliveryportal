import { NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import {
  getSpaceTasksByDropdownField,
  extractCustomFieldValue,
} from "@/lib/clickup";
import { SPACES, CUSTOM_FIELDS, PROJECT_TASK_TYPES } from "@/lib/custom-field-ids";
import { prisma } from "@/lib/db";
import type { DeliverableTask } from "@/lib/types";

const CACHE_KEY = "dashboard-tasks";
const REVALIDATE_MS = 2 * 60_000; // serve cached, refresh in background past this

/**
 * Fetch the non-complete Delivery Deadline tasks for the dashboard, mapped to
 * the shape the table needs. Hits ClickUp; no caching here.
 */
async function fetchDeliverables(): Promise<DeliverableTask[]> {
  // Ask ClickUp for only the Delivery Deadline tasks in the Projects space
  // (server-side custom-field filter), instead of pulling every task from
  // every list and discarding non-deliverables client-side. This collapses
  // ~23 pages across ~30 lists (~2,200 tasks) into ~3 pages of matches.
  const { tasks } = await getSpaceTasksByDropdownField(
    SPACES.PROJECTS,
    CUSTOM_FIELDS.PROJECT_TASK_TYPE,
    PROJECT_TASK_TYPES.DELIVERY_DEADLINE,
    true
  );

  const deliverables: DeliverableTask[] = [];

  for (const task of tasks) {
    // Exclude completed/closed tasks
    const status = task.status.status.toLowerCase();
    if (status === "complete" || status === "closed") continue;

    const deliverableType =
      extractCustomFieldValue(
        task.custom_fields,
        CUSTOM_FIELDS.DELIVERABLE_TYPE
      ) ?? "";

    const department =
      extractCustomFieldValue(
        task.custom_fields,
        CUSTOM_FIELDS.DEPARTMENT
      ) ?? "";

    deliverables.push({
      id: task.id,
      name: task.name,
      status: task.status.status,
      statusColor: task.status.color,
      assignee: task.assignees[0]
        ? {
            id: task.assignees[0].id,
            name: task.assignees[0].username,
            email: task.assignees[0].email,
            avatar: task.assignees[0].profilePicture,
          }
        : undefined,
      dueDate: task.due_date,
      // The Filtered Team Tasks endpoint returns each task's parent folder
      // (client) and list (project) inline.
      clientName: task.folder?.name ?? "",
      projectName: task.list?.name ?? "",
      deliverableType,
      department,
      listId: task.list?.id ?? "",
      folderId: task.folder?.id ?? "",
      clickUpUrl: task.url,
    });
  }

  // Sort by due date (soonest first), nulls last
  deliverables.sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return Number(a.dueDate) - Number(b.dueDate);
  });

  return deliverables;
}

// ── Neon-backed read-through cache (stale-while-revalidate) ──
// Persists the mapped list in Postgres, so it survives deploys (unlike the
// Vercel Data Cache) and cold starts. A load is served the cached copy
// instantly; if it's older than REVALIDATE_MS the refresh runs in the
// background (via after()) so the user never waits on the ~15s ClickUp fetch.
// Demand-driven — no cron, so negligible Neon burn (keep-warm already holds
// the DB awake during business hours).

async function readCache(): Promise<{
  data: DeliverableTask[];
  ageMs: number;
} | null> {
  try {
    const row = await prisma.dashboardCache.findUnique({
      where: { key: CACHE_KEY },
    });
    if (!row) return null;
    return {
      data: row.data as unknown as DeliverableTask[],
      ageMs: Date.now() - row.updatedAt.getTime(),
    };
  } catch {
    return null; // DB down → fall back to a live fetch
  }
}

async function refreshAndCache(): Promise<DeliverableTask[]> {
  const data = await fetchDeliverables();
  try {
    const value = data as unknown as Prisma.InputJsonValue;
    await prisma.dashboardCache.upsert({
      where: { key: CACHE_KEY },
      create: { key: CACHE_KEY, data: value },
      update: { data: value },
    });
  } catch (e) {
    console.error("Failed to write dashboard cache:", e);
  }
  return data;
}

/**
 * GET /api/tasks
 *
 * Returns the non-complete Delivery Deadline tasks from the Projects space,
 * served from a Neon read-through cache. Pass `?refresh=1` to force fresh.
 */
export async function GET(req: Request) {
  try {
    const forceRefresh = new URL(req.url).searchParams.get("refresh") === "1";
    if (forceRefresh) {
      const tasks = await refreshAndCache();
      return NextResponse.json({ tasks });
    }

    const cached = await readCache();
    if (cached) {
      // Serve immediately; refresh in the background if stale.
      if (cached.ageMs > REVALIDATE_MS) {
        after(async () => {
          await refreshAndCache();
        });
      }
      return NextResponse.json({ tasks: cached.data });
    }

    // Cold (no cache row yet): fetch fresh, store, return.
    const tasks = await refreshAndCache();
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}
