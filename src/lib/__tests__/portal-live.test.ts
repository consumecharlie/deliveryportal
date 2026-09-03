import { describe, it, expect, vi, beforeEach } from "vitest";
import { selectFeedbackTasks, runPool, getLiveFeedback, getLiveFeedbackMany } from "@/lib/portal-live";
import { prisma } from "@/lib/db";
import { getListTasksByDropdownField } from "@/lib/clickup";
import { after } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    dashboardCache: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock("@/lib/clickup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/clickup")>()),
  getListTasksByDropdownField: vi.fn(),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));

const cache = vi.mocked(prisma.dashboardCache);
const fetchTasks = vi.mocked(getListTasksByDropdownField);
const afterMock = vi.mocked(after);
import { CUSTOM_FIELDS, PROJECT_TASK_TYPES } from "@/lib/custom-field-ids";
import type { ClickUpTask } from "@/lib/types";

const TYPE_OPTIONS = [
  { id: PROJECT_TASK_TYPES.FEEDBACK_DEADLINE, name: "Feedback Deadline", orderindex: 3 },
  { id: PROJECT_TASK_TYPES.DELIVERY_DEADLINE, name: "Delivery Deadline", orderindex: 4 },
];
const DT_OPTIONS = [
  { id: "opt-av1", name: "AV Script V1", orderindex: 0 },
  { id: "opt-av2", name: "AV Script V2", orderindex: 1 },
];

function t(over: {
  id: string;
  taskType?: string | number | null;
  deliverableType?: string | number | null;
  due?: string | null;
  status?: string;
  statusType?: string;
}): ClickUpTask {
  return {
    id: over.id,
    name: `Task ${over.id}`,
    status: { status: over.status ?? "waiting on client", color: "", type: over.statusType ?? "custom" },
    due_date: over.due === undefined ? null : over.due,
    custom_fields: [
      { id: CUSTOM_FIELDS.PROJECT_TASK_TYPE, name: "Project Task Type", type: "drop_down", type_config: { options: TYPE_OPTIONS }, value: over.taskType === undefined ? 3 : over.taskType },
      { id: CUSTOM_FIELDS.DELIVERABLE_TYPE, name: "Deliverable Type", type: "drop_down", type_config: { options: DT_OPTIONS }, value: over.deliverableType === undefined ? 0 : over.deliverableType },
    ],
  } as unknown as ClickUpTask;
}

describe("selectFeedbackTasks", () => {
  it("keeps only Feedback Deadline tasks, keyed by deliverable type label", () => {
    const map = selectFeedbackTasks([t({ id: "a", due: "1000" }), t({ id: "b", taskType: 4 }), t({ id: "c", deliverableType: 1, due: "2000" })]);
    expect(Object.keys(map).sort()).toEqual(["AV Script V1", "AV Script V2"]);
    expect(map["AV Script V1"]).toEqual({ taskId: "a", name: "Task a", dueMs: 1000, isOpen: true });
    expect(map["AV Script V2"].taskId).toBe("c");
  });

  it("recognizes the type by option id as well as by label", () => {
    const map = selectFeedbackTasks([t({ id: "a", taskType: PROJECT_TASK_TYPES.FEEDBACK_DEADLINE })]);
    expect(map["AV Script V1"]?.taskId).toBe("a");
  });

  it("an open task beats a closed one even when the closed one is due sooner", () => {
    const map = selectFeedbackTasks([
      t({ id: "closed", due: "1000", status: "complete", statusType: "closed" }),
      t({ id: "open", due: "5000" }),
    ]);
    expect(map["AV Script V1"].taskId).toBe("open");
    expect(map["AV Script V1"].isOpen).toBe(true);
  });

  it("two open tasks: the soonest due date wins, and a missing due date sorts last", () => {
    const map = selectFeedbackTasks([t({ id: "later", due: "9000" }), t({ id: "soon", due: "3000" }), t({ id: "undated", due: null })]);
    expect(map["AV Script V1"].taskId).toBe("soon");
  });

  it("marks closed status names or types as not open", () => {
    expect(selectFeedbackTasks([t({ id: "a", status: "Complete" })])["AV Script V1"].isOpen).toBe(false);
    expect(selectFeedbackTasks([t({ id: "b", status: "whatever", statusType: "done" })])["AV Script V1"].isOpen).toBe(false);
    expect(selectFeedbackTasks([t({ id: "c", status: "in review", statusType: "custom" })])["AV Script V1"].isOpen).toBe(true);
  });

  it("skips tasks with no deliverable type", () => {
    expect(selectFeedbackTasks([t({ id: "a", deliverableType: null })])).toEqual({});
  });
});

describe("runPool", () => {
  it("bounds concurrency, preserves order, and captures rejections", async () => {
    let active = 0;
    let peak = 0;
    const results = await runPool([1, 2, 3, 4, 5, 6], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      if (n === 4) throw new Error("boom");
      return n * 10;
    });
    expect(peak).toBe(2);
    expect(results.map((r) => (r.status === "fulfilled" ? r.value : "rejected"))).toEqual([10, 20, 30, "rejected", 50, 60]);
  });

  it("handles an empty list", async () => {
    expect(await runPool([], 4, async () => 1)).toEqual([]);
  });
});

const STALE_DATA = { "AV Script V1": { taskId: "old", name: "n", dueMs: 1, isOpen: true } };
const FRESH_TASKS = [t({ id: "new", due: "2000" })];

function row(key: string, ageMs: number) {
  return { key, data: STALE_DATA, updatedAt: new Date(Date.now() - ageMs) };
}

describe("getLiveFeedback (cache + outage behaviour)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    cache.upsert.mockResolvedValue({} as never);
  });

  it("returns a fresh row without touching ClickUp", async () => {
    cache.findUnique.mockResolvedValue(row("portal:fd:L1", 60_000) as never);
    expect(await getLiveFeedback("L1")).toEqual(STALE_DATA);
    expect(fetchTasks).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("returns a stale row immediately and refreshes in the background", async () => {
    cache.findUnique.mockResolvedValue(row("portal:fd:L1", 10 * 60_000) as never);
    fetchTasks.mockResolvedValue({ tasks: FRESH_TASKS });
    expect(await getLiveFeedback("L1")).toEqual(STALE_DATA);
    expect(fetchTasks).not.toHaveBeenCalled();
    expect(afterMock).toHaveBeenCalledTimes(1);
    // Run the scheduled refresh: it fetches and stores the new map.
    await (afterMock.mock.calls[0][0] as () => Promise<void>)();
    expect(fetchTasks).toHaveBeenCalledWith("L1", expect.any(String), expect.any(String), true);
    expect(cache.upsert).toHaveBeenCalledTimes(1);
    expect((cache.upsert.mock.calls[0][0] as unknown as { update: { data: Record<string, { taskId: string }> } }).update.data["AV Script V1"].taskId).toBe("new");
  });

  it("a forced refresh that throws falls back to the stale row with a warning", async () => {
    cache.findUnique.mockResolvedValue(row("portal:fd:L1", 10 * 60_000) as never);
    fetchTasks.mockRejectedValue(new Error("ClickUp down"));
    expect(await getLiveFeedback("L1", true)).toEqual(STALE_DATA);
    expect(console.warn).toHaveBeenCalled();
  });

  it("a total miss with a failing fetch returns an empty map", async () => {
    cache.findUnique.mockResolvedValue(null);
    fetchTasks.mockRejectedValue(new Error("ClickUp down"));
    expect(await getLiveFeedback("L1")).toEqual({});
  });

  it("a miss fetches, stores, and returns the selected tasks", async () => {
    cache.findUnique.mockResolvedValue(null);
    fetchTasks.mockResolvedValue({ tasks: FRESH_TASKS });
    const map = await getLiveFeedback("L1");
    expect(map["AV Script V1"].taskId).toBe("new");
    expect(cache.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("getLiveFeedbackMany", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    cache.upsert.mockResolvedValue({} as never);
  });

  it("reads all rows in one query, serves fresh and stale rows, fetches only misses, skips blanks", async () => {
    cache.findMany.mockResolvedValue([row("portal:fd:fresh", 1000), row("portal:fd:stale", 10 * 60_000)] as never);
    fetchTasks.mockResolvedValue({ tasks: FRESH_TASKS });
    const out = await getLiveFeedbackMany(["fresh", "stale", "miss", "", "miss"]);
    expect(cache.findMany).toHaveBeenCalledTimes(1);
    expect(Object.keys(out).sort()).toEqual(["fresh", "miss", "stale"]);
    expect(out.fresh).toEqual(STALE_DATA);
    expect(out.stale).toEqual(STALE_DATA);
    expect(out.miss["AV Script V1"].taskId).toBe("new");
    expect(fetchTasks).toHaveBeenCalledTimes(1);
    expect(afterMock).toHaveBeenCalledTimes(1);
  });

  it("stale lists refresh through one scheduled pool, not one background call each", async () => {
    const ids = ["s1", "s2", "s3", "s4", "s5", "s6"];
    cache.findMany.mockResolvedValue(ids.map((id) => row(`portal:fd:${id}`, 10 * 60_000)) as never);
    let active = 0;
    let peak = 0;
    fetchTasks.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return { tasks: FRESH_TASKS };
    });
    const out = await getLiveFeedbackMany(ids);
    expect(Object.keys(out)).toHaveLength(6);
    expect(fetchTasks).not.toHaveBeenCalled();
    expect(afterMock).toHaveBeenCalledTimes(1);
    await (afterMock.mock.calls[0][0] as () => Promise<void>)();
    expect(fetchTasks).toHaveBeenCalledTimes(6);
    expect(peak).toBe(4);
    expect(cache.upsert).toHaveBeenCalledTimes(6);
  });

  it("a failing fetch for a miss yields an empty map for that list only", async () => {
    cache.findMany.mockResolvedValue([row("portal:fd:ok", 1000)] as never);
    fetchTasks.mockRejectedValue(new Error("down"));
    const out = await getLiveFeedbackMany(["ok", "bad"]);
    expect(out.ok).toEqual(STALE_DATA);
    expect(out.bad).toEqual({});
  });
});
