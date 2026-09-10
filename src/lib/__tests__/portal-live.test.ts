import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  selectFeedbackTasks,
  selectFeedbackByParent,
  selectContactDomains,
  pairFeedbackTask,
  selectMilestones,
  runPool,
  getLiveFeedback,
  getLiveFeedbackMany,
  getClientFolderLists,
  FOLDER_PAYLOAD_VERSION,
  LIVE_PAYLOAD_VERSION,
  EMPTY_LIVE_PAYLOAD,
  type LivePayload,
} from "@/lib/portal-live";
import { prisma } from "@/lib/db";
import { getListTasksByDropdownField, getFolderLists, getList, getTask } from "@/lib/clickup";
import { after } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    dashboardCache: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock("@/lib/clickup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/clickup")>()),
  getListTasksByDropdownField: vi.fn(),
  getFolderLists: vi.fn(),
  getList: vi.fn(),
  getTask: vi.fn(),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));

const cache = vi.mocked(prisma.dashboardCache);
const fetchTasks = vi.mocked(getListTasksByDropdownField);
const fetchFolder = vi.mocked(getFolderLists);
const fetchList = vi.mocked(getList);
const fetchTask = vi.mocked(getTask);
const afterMock = vi.mocked(after);
import { CUSTOM_FIELDS, PROJECT_TASK_TYPES } from "@/lib/custom-field-ids";
import type { ClickUpTask } from "@/lib/types";

const TYPE_OPTIONS = [
  { id: PROJECT_TASK_TYPES.PROJECT_CONTACT, name: "Project Contact", orderindex: 0 },
  { id: PROJECT_TASK_TYPES.FEEDBACK_DEADLINE, name: "Feedback Deadline", orderindex: 3 },
  { id: PROJECT_TASK_TYPES.DELIVERY_DEADLINE, name: "Delivery Deadline", orderindex: 4 },
];
const DT_OPTIONS = [
  { id: "opt-av1", name: "AV Script V1", orderindex: 0 },
  { id: "opt-av2", name: "AV Script V2", orderindex: 1 },
];

function t(over: {
  id: string;
  name?: string;
  taskType?: string | number | null;
  deliverableType?: string | number | null;
  due?: string | null;
  status?: string;
  statusType?: string;
  parent?: string | null;
  dateClosed?: string | null;
  email?: string | null;
}): ClickUpTask {
  return {
    id: over.id,
    name: over.name ?? `Task ${over.id}`,
    status: { status: over.status ?? "waiting on client", color: "", type: over.statusType ?? "custom" },
    due_date: over.due === undefined ? null : over.due,
    parent: over.parent ?? null,
    date_closed: over.dateClosed ?? null,
    custom_fields: [
      { id: CUSTOM_FIELDS.PROJECT_TASK_TYPE, name: "Project Task Type", type: "drop_down", type_config: { options: TYPE_OPTIONS }, value: over.taskType === undefined ? 3 : over.taskType },
      { id: CUSTOM_FIELDS.DELIVERABLE_TYPE, name: "Deliverable Type", type: "drop_down", type_config: { options: DT_OPTIONS }, value: over.deliverableType === undefined ? 0 : over.deliverableType },
      { id: CUSTOM_FIELDS.CONTACT_EMAIL, name: "Contact Email", type: "email", value: over.email ?? null },
    ],
  } as unknown as ClickUpTask;
}

describe("selectFeedbackTasks", () => {
  it("keeps only Feedback Deadline tasks, keyed by deliverable type label", () => {
    const map = selectFeedbackTasks([t({ id: "a", due: "1000" }), t({ id: "b", taskType: 4 }), t({ id: "c", deliverableType: 1, due: "2000" })]);
    expect(Object.keys(map).sort()).toEqual(["AV Script V1", "AV Script V2"]);
    expect(map["AV Script V1"]).toEqual({ taskId: "a", name: "Task a", dueMs: 1000, isOpen: true, status: "waiting on client", awaitingClient: true, parentTaskId: null, deliverableType: "AV Script V1" });
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

describe("selectFeedbackByParent", () => {
  it("groups every feedback task by its parent, keeping parentless ones out", () => {
    const by = selectFeedbackByParent([
      t({ id: "a", parent: "P1", due: "1000" }),
      t({ id: "b", parent: "P1", deliverableType: 1 }),
      t({ id: "c", parent: "P2" }),
      t({ id: "d" }),
      t({ id: "share", taskType: 4, parent: "P1" }),
    ]);
    expect(Object.keys(by).sort()).toEqual(["P1", "P2"]);
    expect(by.P1.map((x) => x.taskId)).toEqual(["a", "b"]);
    expect(by.P1[0]).toMatchObject({ parentTaskId: "P1", deliverableType: "AV Script V1", dueMs: 1000 });
    expect(by.P2.map((x) => x.taskId)).toEqual(["c"]);
  });
});

describe("pairFeedbackTask", () => {
  const fd = (
    over: Partial<import("@/lib/portal-live").LiveFeedbackTask> & { taskId: string }
  ): import("@/lib/portal-live").LiveFeedbackTask => {
    const isOpen = over.isOpen ?? true;
    return {
      name: over.taskId,
      dueMs: null,
      isOpen,
      status: isOpen ? "waiting on client" : "complete",
      awaitingClient: isOpen,
      parentTaskId: null,
      deliverableType: "Edit V1",
      ...over,
    };
  };
  // Two episodes, each with its own "Edit V1" feedback task.
  const live = {
    feedback: { "Edit V1": fd({ taskId: "F21", parentTaskId: "P21", dueMs: 5000 }) },
    feedbackByParent: {
      P21: [fd({ taskId: "F21", parentTaskId: "P21", dueMs: 5000 })],
      P22: [fd({ taskId: "F22", parentTaskId: "P22", dueMs: 9000, isOpen: false })],
      P23: [fd({ taskId: "F23v1", parentTaskId: "P23", deliverableType: "Edit V1", isOpen: false }), fd({ taskId: "F23v2", parentTaskId: "P23", deliverableType: "Edit V2" })],
    },
  };

  it("same parent and same type wins over the type-only map", () => {
    expect(pairFeedbackTask(live, { parentTaskId: "P22", deliverableType: "Edit V1" })?.taskId).toBe("F22");
    expect(pairFeedbackTask(live, { parentTaskId: "P21", deliverableType: "Edit V1" })?.taskId).toBe("F21");
    expect(pairFeedbackTask(live, { parentTaskId: "P23", deliverableType: "edit v2" })?.taskId).toBe("F23v2");
  });

  it("falls back to the same parent with the type minus version markers, preferring open tasks", () => {
    expect(pairFeedbackTask(live, { parentTaskId: "P22", deliverableType: "Edit V2" })?.taskId).toBe("F22");
    expect(pairFeedbackTask(live, { parentTaskId: "P23", deliverableType: "Edit V3" })?.taskId).toBe("F23v2");
  });

  // The real Leaders of Code shape: deliveries typed "Edit V1", feedback tasks
  // typed "LoC ..." and named by variant.
  const loc = (parent: string, closedVideo = false) => [
    fd({ taskId: `${parent}-v1`, name: "Confirm Video Edit01 Feedback Received", deliverableType: "LoC Edit V1", parentTaskId: parent, dueMs: 5000, isOpen: !closedVideo }),
    fd({ taskId: `${parent}-s1`, name: "Confirm Snippets Edit01 Feedback Received", deliverableType: "LoC Snippets Edit V1", parentTaskId: parent, dueMs: 6000 }),
    fd({ taskId: `${parent}-v2`, name: "Confirm Edit Feedback or Approval", deliverableType: "LoC Edit V2", parentTaskId: parent, dueMs: 9000 }),
    fd({ taskId: `${parent}-s2`, name: "Confirm Snippets Feedback or Approval", deliverableType: "LoC Snippets Edit V2", parentTaskId: parent, dueMs: 9500 }),
  ];
  const locLive = { feedback: {}, feedbackByParent: { P21: loc("P21"), P22: loc("P22", true), P5: [fd({ taskId: "only", parentTaskId: "P5", deliverableType: "LoC Edit V1", name: "Confirm Edit Feedback or Approval" })] } };

  it("tier 3: matches the share task's variant against the feedback task names under the parent", () => {
    expect(pairFeedbackTask(locLive, { parentTaskId: "P21", deliverableType: "Edit V1", shareTaskName: "Share Video Edit01 with Client" })?.taskId).toBe("P21-v1");
    expect(pairFeedbackTask(locLive, { parentTaskId: "P21", deliverableType: "Edit V1", shareTaskName: "Share Snippets Edit01 with Client" })?.taskId).toBe("P21-s1");
    expect(pairFeedbackTask(locLive, { parentTaskId: "P22", deliverableType: "Edit V1", shareTaskName: "Share Snippets Edit01 with Client" })?.taskId).toBe("P22-s1");
  });

  it("tier 3 tie-break: open first, then the soonest due date on or after the send date", () => {
    // Episode 22's video task is closed; snippets tasks are both open and both match "snippets".
    expect(pairFeedbackTask(locLive, { parentTaskId: "P22", deliverableType: "Edit V1", shareTaskName: "Share Video Edit01 with Client" })?.taskId).toBe("P22-v1");
    expect(pairFeedbackTask(locLive, { parentTaskId: "P22", deliverableType: "Edit V2", shareTaskName: "Share Snippets Edit02 with Client", sentAtMs: 7000 })?.taskId).toBe("P22-s2");
    expect(pairFeedbackTask(locLive, { parentTaskId: "P22", deliverableType: "Edit V2", shareTaskName: "Share Snippets Edit02 with Client", sentAtMs: 1000 })?.taskId).toBe("P22-s1");
  });

  it("tier 4: a parent with a single feedback task uses it whatever it is called", () => {
    expect(pairFeedbackTask(locLive, { parentTaskId: "P5", deliverableType: "Storyboards V1", shareTaskName: "Share Graphics V1 with Client" })?.taskId).toBe("only");
  });

  it("tier 5: with nothing to compare by name, shared version markers decide, else an open task", () => {
    const versions = {
      feedback: {},
      feedbackByParent: {
        P9: [
          fd({ taskId: "loc-v1", parentTaskId: "P9", deliverableType: "LoC Edit V1", name: "Confirm Edit Feedback or Approval" }),
          fd({ taskId: "loc-v2", parentTaskId: "P9", deliverableType: "LoC Edit V2", name: "Confirm Edit Feedback or Approval" }),
        ],
        P10: [
          fd({ taskId: "closed", parentTaskId: "P10", deliverableType: "LoC Edit V1", name: "Confirm Edit Feedback", isOpen: false }),
          fd({ taskId: "open", parentTaskId: "P10", deliverableType: "LoC Edit V3", name: "Confirm Edit Feedback" }),
        ],
      },
    };
    expect(pairFeedbackTask(versions, { parentTaskId: "P9", deliverableType: "Edit V2", shareTaskName: "Share Edit V2 with Client" })?.taskId).toBe("loc-v2");
    expect(pairFeedbackTask(versions, { parentTaskId: "P9", deliverableType: "Edit V1", shareTaskName: null })?.taskId).toBe("loc-v1");
    expect(pairFeedbackTask(versions, { parentTaskId: "P10", deliverableType: "Edit V2", shareTaskName: "Share Edit V2 with Client" })?.taskId).toBe("open");
  });

  it("falls back to the list-wide type lookup when the parent has nothing matching, or no parent", () => {
    expect(pairFeedbackTask(live, { parentTaskId: "P23", deliverableType: "Storyboards V1", shareTaskName: "Share Graphics V1 with Client" })).toBeNull();
    expect(pairFeedbackTask(live, { parentTaskId: "P99", deliverableType: "Edit V1" })?.taskId).toBe("F21");
    expect(pairFeedbackTask(live, { parentTaskId: null, deliverableType: "Edit V1" })?.taskId).toBe("F21");
    expect(pairFeedbackTask(undefined, { parentTaskId: "P21", deliverableType: "Edit V1" })).toBeNull();
  });
});

describe("selectContactDomains", () => {
  it("collects client domains from Project Contact tasks, deduped, without ours or personal ones", () => {
    expect(
      selectContactDomains([
        t({ id: "c1", taskType: 0, email: "Dana@StackOverflow.com" }),
        t({ id: "c2", taskType: PROJECT_TASK_TYPES.PROJECT_CONTACT, email: "pm@stackoverflow.com" }),
        t({ id: "c3", taskType: 0, email: "michael@consume-media.com" }),
        t({ id: "c4", taskType: 0, email: "freelancer@gmail.com" }),
        t({ id: "c5", taskType: 0, email: "" }),
        t({ id: "c6", taskType: 0, email: "agency@partner.co" }),
        t({ id: "fd", taskType: 3, email: "x@other.com" }),
      ])
    ).toEqual(["stackoverflow.com", "partner.co"]);
    expect(selectContactDomains([])).toEqual([]);
  });
});

describe("selectMilestones", () => {
  it("keeps only Delivery Deadline tasks, ordered by due date with undated last", () => {
    const ms = selectMilestones([
      t({ id: "fd", taskType: 3, due: "500" }),
      t({ id: "late", taskType: 4, due: "9000", name: "Share Edit V2 with Client", deliverableType: 1 }),
      t({ id: "undated", taskType: 4, due: null, name: "Share Final Deliverables with Client" }),
      t({ id: "soon", taskType: PROJECT_TASK_TYPES.DELIVERY_DEADLINE, due: "1000", name: "Share Edit V1 with Client", parent: "P1", status: "complete", statusType: "closed", dateClosed: "1200" }),
    ]);
    expect(ms.map((m) => m.taskId)).toEqual(["soon", "late", "undated"]);
    expect(ms[0]).toEqual({
      taskId: "soon",
      name: "Share Edit V1 with Client",
      parentTaskId: "P1",
      parentTaskName: null,
      deliverableType: "AV Script V1",
      dueMs: 1000,
      closedMs: 1200,
      isClosed: true,
    });
    expect(ms[1]).toMatchObject({ deliverableType: "AV Script V2", isClosed: false, closedMs: null, parentTaskId: null });
  });

  it("an open task never carries a closedMs, and a closed one without date_closed reports null", () => {
    const ms = selectMilestones([
      t({ id: "a", taskType: 4, dateClosed: "1" }),
      t({ id: "b", taskType: 4, status: "complete", dateClosed: null }),
    ]);
    expect(ms.find((m) => m.taskId === "a")?.closedMs).toBeNull();
    expect(ms.find((m) => m.taskId === "b")).toMatchObject({ isClosed: true, closedMs: null });
  });

  it("returns an empty list when there are no share tasks", () => {
    expect(selectMilestones([t({ id: "fd" })])).toEqual([]);
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

const STALE_DATA: LivePayload = {
  version: LIVE_PAYLOAD_VERSION,
  feedback: { "AV Script V1": { taskId: "old", name: "n", dueMs: 1, isOpen: true, status: "waiting on client", awaitingClient: true, parentTaskId: null, deliverableType: "AV Script V1" } },
  feedbackByParent: {},
  milestones: [],
  wrapsUpMs: null,
  archived: false,
  contactDomains: [],
};
/** A row written by the previous payload shape (a bare feedback map). */
const OLD_SHAPE_DATA = { "AV Script V1": { taskId: "old", name: "n", dueMs: 1, isOpen: true } };
const FRESH_FD = [t({ id: "new", due: "2000", parent: "P1" })];
const FRESH_DD = [
  t({ id: "share1", taskType: 4, due: "3000", name: "Share Video Edit01 with Client", parent: "P1", status: "complete" }),
  t({ id: "share2", taskType: 4, due: "4000", name: "Share Snippets Edit01 with Client", parent: "P1" }),
  t({ id: "share3", taskType: 4, due: "5000", name: "Share Edit V2 with Client", parent: "P2", deliverableType: 1 }),
];

function row(key: string, ageMs: number, data: unknown = STALE_DATA) {
  return { key, data, updatedAt: new Date(Date.now() - ageMs) };
}

const FRESH_CONTACTS = [t({ id: "c1", taskType: 0, email: "dana@stackoverflow.com" })];

function mockClickUpHealthy() {
  fetchTasks.mockImplementation(async (_list, _field, optionId) => ({
    tasks:
      optionId === PROJECT_TASK_TYPES.DELIVERY_DEADLINE
        ? FRESH_DD
        : optionId === PROJECT_TASK_TYPES.PROJECT_CONTACT
          ? FRESH_CONTACTS
          : FRESH_FD,
  }));
  fetchList.mockResolvedValue({ id: "L1", name: "List", folder: { id: "F", name: "Client" }, due_date: "7000", archived: false });
  fetchTask.mockImplementation(async (id) => ({ id, name: id === "P1" ? "Post-Production - Ep #21" : "LOC19: Intuit" }) as ClickUpTask);
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
    mockClickUpHealthy();
    expect(await getLiveFeedback("L1")).toEqual(STALE_DATA);
    expect(fetchTasks).not.toHaveBeenCalled();
    expect(afterMock).toHaveBeenCalledTimes(1);
    // Run the scheduled refresh: it fetches both task types plus the list and stores the payload.
    await (afterMock.mock.calls[0][0] as () => Promise<void>)();
    expect(fetchTasks).toHaveBeenCalledWith("L1", CUSTOM_FIELDS.PROJECT_TASK_TYPE, PROJECT_TASK_TYPES.FEEDBACK_DEADLINE, true);
    expect(fetchTasks).toHaveBeenCalledWith("L1", CUSTOM_FIELDS.PROJECT_TASK_TYPE, PROJECT_TASK_TYPES.DELIVERY_DEADLINE, true);
    expect(fetchList).toHaveBeenCalledWith("L1");
    expect(cache.upsert).toHaveBeenCalledTimes(1);
    const stored = (cache.upsert.mock.calls[0][0] as unknown as { update: { data: LivePayload } }).update.data;
    expect(stored.version).toBe(LIVE_PAYLOAD_VERSION);
    expect(stored.feedback["AV Script V1"].taskId).toBe("new");
    expect(stored.wrapsUpMs).toBe(7000);
  });

  it("a forced refresh that throws falls back to the stale row with a warning", async () => {
    cache.findUnique.mockResolvedValue(row("portal:fd:L1", 10 * 60_000) as never);
    fetchTasks.mockRejectedValue(new Error("ClickUp down"));
    fetchList.mockRejectedValue(new Error("ClickUp down"));
    expect(await getLiveFeedback("L1", true)).toEqual(STALE_DATA);
    expect(console.warn).toHaveBeenCalled();
  });

  it("a total miss with a failing fetch returns the empty payload", async () => {
    cache.findUnique.mockResolvedValue(null);
    fetchTasks.mockRejectedValue(new Error("ClickUp down"));
    fetchList.mockRejectedValue(new Error("ClickUp down"));
    expect(await getLiveFeedback("L1")).toEqual(EMPTY_LIVE_PAYLOAD);
  });

  it("a miss fetches, stores, and returns feedback, milestones with parent names, and list dates", async () => {
    cache.findUnique.mockResolvedValue(null);
    mockClickUpHealthy();
    const p = await getLiveFeedback("L1");
    expect(p.feedback["AV Script V1"].taskId).toBe("new");
    expect(p.feedbackByParent.P1.map((x) => x.taskId)).toEqual(["new"]);
    expect(p.milestones.map((m) => m.taskId)).toEqual(["share1", "share2", "share3"]);
    expect(p.milestones[0]).toMatchObject({ parentTaskId: "P1", parentTaskName: "Post-Production - Ep #21", isClosed: true });
    expect(p.milestones[2]).toMatchObject({ parentTaskName: "LOC19: Intuit", deliverableType: "AV Script V2", isClosed: false });
    // One getTask per distinct parent, not per milestone.
    expect(fetchTask).toHaveBeenCalledTimes(2);
    expect(p.wrapsUpMs).toBe(7000);
    expect(p.archived).toBe(false);
    expect(p.contactDomains).toEqual(["stackoverflow.com"]);
    expect(fetchTasks).toHaveBeenCalledWith("L1", CUSTOM_FIELDS.PROJECT_TASK_TYPE, PROJECT_TASK_TYPES.PROJECT_CONTACT, true);
    expect(cache.upsert).toHaveBeenCalledTimes(1);
  });

  it("a parent name lookup failure leaves that name null without failing the list", async () => {
    cache.findUnique.mockResolvedValue(null);
    mockClickUpHealthy();
    fetchTask.mockRejectedValue(new Error("404"));
    const p = await getLiveFeedback("L1");
    expect(p.milestones.map((m) => m.parentTaskName)).toEqual([null, null, null]);
    expect(p.milestones[0].name).toBe("Share Video Edit01 with Client");
  });

  it("a row from the previous payload shape is a miss and is refetched inline", async () => {
    cache.findUnique.mockResolvedValue(row("portal:fd:L1", 1000, OLD_SHAPE_DATA) as never);
    mockClickUpHealthy();
    const p = await getLiveFeedback("L1");
    expect(p.version).toBe(LIVE_PAYLOAD_VERSION);
    expect(p.feedback["AV Script V1"].taskId).toBe("new");
    expect(afterMock).not.toHaveBeenCalled();
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
    mockClickUpHealthy();
    const out = await getLiveFeedbackMany(["fresh", "stale", "miss", "", "miss"]);
    expect(cache.findMany).toHaveBeenCalledTimes(1);
    expect(Object.keys(out).sort()).toEqual(["fresh", "miss", "stale"]);
    expect(out.fresh).toEqual(STALE_DATA);
    expect(out.stale).toEqual(STALE_DATA);
    expect(out.miss.feedback["AV Script V1"].taskId).toBe("new");
    expect(out.miss.milestones).toHaveLength(3);
    expect(fetchList).toHaveBeenCalledTimes(1);
    expect(afterMock).toHaveBeenCalledTimes(1);
  });

  it("treats rows from an older payload version as misses", async () => {
    cache.findMany.mockResolvedValue([row("portal:fd:old", 1000, OLD_SHAPE_DATA)] as never);
    mockClickUpHealthy();
    const out = await getLiveFeedbackMany(["old"]);
    expect(out.old.version).toBe(LIVE_PAYLOAD_VERSION);
    expect(fetchList).toHaveBeenCalledTimes(1);
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("stale lists refresh through one scheduled pool, not one background call each", async () => {
    const ids = ["s1", "s2", "s3", "s4", "s5", "s6"];
    cache.findMany.mockResolvedValue(ids.map((id) => row(`portal:fd:${id}`, 10 * 60_000)) as never);
    mockClickUpHealthy();
    let active = 0;
    let peak = 0;
    fetchList.mockImplementation(async (id) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return { id, name: "List", folder: { id: "F", name: "Client" } };
    });
    const out = await getLiveFeedbackMany(ids);
    expect(Object.keys(out)).toHaveLength(6);
    expect(fetchTasks).not.toHaveBeenCalled();
    expect(afterMock).toHaveBeenCalledTimes(1);
    await (afterMock.mock.calls[0][0] as () => Promise<void>)();
    expect(fetchList).toHaveBeenCalledTimes(6);
    expect(peak).toBe(4);
    expect(cache.upsert).toHaveBeenCalledTimes(6);
  });

  it("a failing fetch for a miss yields the empty payload for that list only", async () => {
    cache.findMany.mockResolvedValue([row("portal:fd:ok", 1000)] as never);
    fetchTasks.mockRejectedValue(new Error("down"));
    fetchList.mockRejectedValue(new Error("down"));
    const out = await getLiveFeedbackMany(["ok", "bad"]);
    expect(out.ok).toEqual(STALE_DATA);
    expect(out.bad).toEqual(EMPTY_LIVE_PAYLOAD);
  });
});

describe("getClientFolderLists (folder index cache)", () => {
  const FOLDER_DATA = { version: FOLDER_PAYLOAD_VERSION, lists: [{ id: "L1", name: "Cached List" }] };
  const LIVE_LISTS = [
    { id: "L1", name: "Leaders of Code Podcast" },
    { id: "L2", name: "BVAS Talking Head Product Videos" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    cache.upsert.mockResolvedValue({} as never);
  });

  it("serves a fresh row without touching ClickUp", async () => {
    cache.findUnique.mockResolvedValue(row("portal:folder:F1", 60_000, FOLDER_DATA) as never);
    expect(await getClientFolderLists("F1")).toEqual(FOLDER_DATA.lists);
    expect(cache.findUnique).toHaveBeenCalledWith({ where: { key: "portal:folder:F1" } });
    expect(fetchFolder).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("serves a stale row immediately and refreshes after the response", async () => {
    cache.findUnique.mockResolvedValue(row("portal:folder:F1", 10 * 60_000, FOLDER_DATA) as never);
    fetchFolder.mockResolvedValue({ lists: LIVE_LISTS });
    expect(await getClientFolderLists("F1")).toEqual(FOLDER_DATA.lists);
    expect(fetchFolder).not.toHaveBeenCalled();
    expect(afterMock).toHaveBeenCalledTimes(1);
    await (afterMock.mock.calls[0][0] as () => Promise<void>)();
    // Only active lists: archived roadmaps are history and cost too many calls.
    expect(fetchFolder).toHaveBeenCalledWith("F1", false);
    const stored = (cache.upsert.mock.calls[0][0] as unknown as { update: { data: typeof FOLDER_DATA } }).update.data;
    expect(stored).toEqual({ version: FOLDER_PAYLOAD_VERSION, lists: LIVE_LISTS });
  });

  it("a miss fetches and stores; a failing fetch serves the stale row, else nothing", async () => {
    cache.findUnique.mockResolvedValue(null);
    fetchFolder.mockResolvedValue({ lists: LIVE_LISTS });
    expect(await getClientFolderLists("F1")).toEqual(LIVE_LISTS);
    expect(cache.upsert).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    cache.findUnique.mockResolvedValue(row("portal:folder:F1", 10 * 60_000, FOLDER_DATA) as never);
    fetchFolder.mockRejectedValue(new Error("ClickUp down"));
    expect(await getClientFolderLists("F1")).toEqual(FOLDER_DATA.lists);
    await (afterMock.mock.calls[0][0] as () => Promise<void>)();
    expect(console.warn).toHaveBeenCalled();

    vi.clearAllMocks();
    cache.findUnique.mockResolvedValue(null);
    fetchFolder.mockRejectedValue(new Error("ClickUp down"));
    expect(await getClientFolderLists("F1")).toEqual([]);
  });

  it("a row from an older shape is a miss, and a blank folder id never fetches", async () => {
    cache.findUnique.mockResolvedValue(row("portal:folder:F1", 1000, { lists: LIVE_LISTS }) as never);
    fetchFolder.mockResolvedValue({ lists: LIVE_LISTS });
    expect(await getClientFolderLists("F1")).toEqual(LIVE_LISTS);
    expect(fetchFolder).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    expect(await getClientFolderLists("")).toEqual([]);
    expect(cache.findUnique).not.toHaveBeenCalled();
    expect(fetchFolder).not.toHaveBeenCalled();
  });
});
