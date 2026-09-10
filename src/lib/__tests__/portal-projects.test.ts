import { describe, it, expect } from "vitest";
import { selectProjectLists, type DiscoveredProject } from "@/lib/portal-projects";
import { buildPortalPage, type PortalPageRow, type BuildPortalPageInput } from "@/lib/portal-page";
import { LIVE_PAYLOAD_VERSION, type LivePayload, type LiveMilestone } from "@/lib/portal-live";

/** Thu Sep 3 2026, 11:00 ET. */
const NOW = Date.parse("2026-09-03T15:00:00Z");
/** ClickUp date-only sentinel: 08:00 UTC on that calendar date. */
const day = (iso: string) => Date.parse(`${iso}T08:00:00Z`);

function live(over: Partial<LivePayload> = {}): LivePayload {
  return {
    version: LIVE_PAYLOAD_VERSION,
    feedback: {},
    feedbackByParent: {},
    milestones: [],
    wrapsUpMs: null,
    archived: false,
    contactDomains: [],
    ...over,
  };
}

function ms(over: Partial<LiveMilestone> & { taskId: string; name: string }): LiveMilestone {
  return {
    parentTaskId: null,
    parentTaskName: null,
    deliverableType: "Edit V1",
    dueMs: null,
    closedMs: null,
    isClosed: false,
    ...over,
  };
}

function row(over: Partial<PortalPageRow> & { id: string }): PortalPageRow {
  return {
    taskId: `task-${over.id}`,
    projectListId: "ACTIVE_WITH_SENDS",
    projectName: "Stored Project Name",
    deliverableType: "Edit V1",
    department: "Post-Production",
    sentAt: new Date("2026-08-20T14:00:00Z"),
    emailContent: "Here it is",
    slackContent: null,
    replacesDeliveryId: null,
    links: [{ url: "https://app.frame.io/r/1", label: "frameReviewLink", variableName: "frameReviewLink" }],
    feedbackWindows: "2 Business Days",
    parentTaskId: "P1",
    parentTaskName: "Ep #21",
    shareTaskName: "Share Video Edit01 with Client",
    ...over,
  };
}

// A client folder as ClickUp lists it (active lists only), covering each rule.
const FOLDER = [
  { id: "ROADMAP_ONLY", name: "Stack Overflow BVAS Talking Head Product Videos" },
  { id: "ACTIVE_WITH_SENDS", name: "Stack Overflow 2026 Internal Explainer" },
  { id: "EMPTY_LIST", name: "Stack Internal Explainer Kickoff" },
];

const LIVE: Record<string, LivePayload> = {
  ROADMAP_ONLY: live({
    wrapsUpMs: day("2026-11-20"),
    milestones: [
      ms({ taskId: "R1", name: "Share Edit V1 with Client", dueMs: day("2026-09-18") }),
      ms({ taskId: "R2", name: "Share Final Deliverables with Client", deliverableType: "Final Delivery", dueMs: day("2026-10-02") }),
    ],
  }),
  ACTIVE_WITH_SENDS: live({
    wrapsUpMs: day("2026-09-30"),
    milestones: [
      ms({ taskId: "S1", name: "Share Video Edit01 with Client", parentTaskId: "P1", parentTaskName: "Ep #21", dueMs: day("2026-08-20"), isClosed: true }),
      ms({ taskId: "S2", name: "Share Final Deliverables with Client", deliverableType: "Final Delivery", dueMs: day("2026-09-25") }),
    ],
  }),
  EMPTY_LIST: live({}),
  ARCHIVED_WITH_SENDS: live({ archived: true, milestones: [ms({ taskId: "A1", name: "Share Final Deliverables with Client", isClosed: true })] }),
  ARCHIVED_EMPTY: live({ archived: true }),
};

const SENT = row({ id: "d1", taskId: "S1" });
const ARCHIVED_SEND = row({
  id: "d2",
  taskId: "A1",
  projectListId: "ARCHIVED_WITH_SENDS",
  projectName: "Salesloft Logo Reveal",
  deliverableType: "Final Delivery",
  shareTaskName: "Share Final Deliverables with Client",
  sentAt: new Date("2026-05-10T14:00:00Z"),
});

function discover(over: Partial<Parameters<typeof selectProjectLists>[0]> = {}): DiscoveredProject[] {
  return selectProjectLists({
    folderLists: FOLDER,
    live: LIVE,
    deliveryListIds: ["ACTIVE_WITH_SENDS", "ARCHIVED_WITH_SENDS"],
    ...over,
  });
}

function build(over: Partial<BuildPortalPageInput> = {}) {
  return buildPortalPage({
    token: "tok",
    clientName: "Stack Overflow",
    focusListId: null,
    nowMs: NOW,
    rows: [SENT, ARCHIVED_SEND],
    live: LIVE,
    confirmations: new Map(),
    discovered: discover(),
    ...over,
  });
}

describe("selectProjectLists", () => {
  it("keeps an active list that has milestones but no deliveries", () => {
    expect(discover()).toEqual(
      expect.arrayContaining([
        { listId: "ROADMAP_ONLY", name: "Stack Overflow BVAS Talking Head Product Videos", archived: false },
      ])
    );
  });

  it("keeps an active list that has deliveries", () => {
    expect(discover().map((d) => d.listId)).toContain("ACTIVE_WITH_SENDS");
  });

  it("keeps an active list with deliveries even when ClickUp gave us no live payload", () => {
    expect(
      selectProjectLists({
        folderLists: [{ id: "L9", name: "Fresh List" }],
        live: {},
        deliveryListIds: ["L9"],
      })
    ).toEqual([{ listId: "L9", name: "Fresh List", archived: false }]);
  });

  it("drops an empty active list: no milestones and no deliveries", () => {
    expect(discover().map((d) => d.listId)).not.toContain("EMPTY_LIST");
    expect(
      selectProjectLists({ folderLists: [{ id: "EMPTY_LIST", name: "Kickoff" }], live: LIVE, deliveryListIds: [] })
    ).toEqual([]);
  });

  it("drops an archived list with no deliveries and keeps one with deliveries", () => {
    const folder = [
      { id: "ARCHIVED_EMPTY", name: "Old Idea" },
      { id: "ARCHIVED_WITH_SENDS", name: "Salesloft Logo Reveal (renamed)" },
    ];
    expect(
      selectProjectLists({ folderLists: folder, live: LIVE, deliveryListIds: ["ARCHIVED_WITH_SENDS"] })
    ).toEqual([{ listId: "ARCHIVED_WITH_SENDS", name: "Salesloft Logo Reveal (renamed)", archived: true }]);
  });

  it("ignores blank ids and duplicate lists", () => {
    expect(
      selectProjectLists({
        folderLists: [
          { id: "", name: "No id" },
          { id: "ROADMAP_ONLY", name: "First" },
          { id: "ROADMAP_ONLY", name: "Duplicate" },
        ],
        live: LIVE,
        deliveryListIds: [],
      })
    ).toEqual([{ listId: "ROADMAP_ONLY", name: "First", archived: false }]);
  });
});

describe("buildPortalPage with folder-discovered projects", () => {
  const page = build();
  const byList = new Map(page.projects.map((p) => [p.listId, p]));

  it("a discovered list with no deliveries is a project with an empty deliverables array", () => {
    const p = byList.get("ROADMAP_ONLY")!;
    expect(p).toBeDefined();
    expect(p.deliverables).toEqual([]);
    expect(p.name).toBe("Stack Overflow BVAS Talking Head Product Videos");
    expect(p.phase).toBe("in-progress");
    expect(p.milestones.map((m) => [m.label, m.state])).toEqual([
      ["Edit V1", "up-next"],
      ["Final Deliverables", "planned"],
    ]);
    expect(p.summary).toBe("In progress, wraps up Nov 20, up next: Edit V1 on Sep 18");
    // No delivery, so the project is dated by its soonest planned milestone.
    expect(p.lastActivityMs).toBe(day("2026-09-18"));
  });

  it("falls back to the wrap date, then to 0, when nothing is scheduled", () => {
    const wrapOnly = build({
      rows: [],
      discovered: [{ listId: "W1", name: "Wrap Only", archived: false }],
      live: { W1: live({ wrapsUpMs: day("2026-12-01") }) },
    }).projects[0];
    expect(wrapOnly.lastActivityMs).toBe(day("2026-12-01"));
    expect(wrapOnly.summary).toBe("In progress, next deliverable not scheduled yet, wraps up Dec 1");

    const bare = build({ rows: [], discovered: [{ listId: "B1", name: "Bare", archived: false }], live: {} }).projects[0];
    expect(bare.lastActivityMs).toBe(0);
    expect(bare.deliverables).toEqual([]);
    expect(bare.milestones).toEqual([]);
  });

  it("the ClickUp list name wins over the name stored on the delivery", () => {
    const p = byList.get("ACTIVE_WITH_SENDS")!;
    expect(p.name).toBe("Stack Overflow 2026 Internal Explainer");
    expect(p.deliverables).toHaveLength(1);
  });

  it("an archived list with deliveries is a completed project", () => {
    const p = byList.get("ARCHIVED_WITH_SENDS")!;
    expect(p.phase).toBe("completed");
    expect(p.deliverables).toHaveLength(1);
    expect(p.summary).toBe("Completed May 10, 2026");
  });

  it("a delivery whose list the folder never listed still yields a project, named from the delivery", () => {
    const stray = row({
      id: "d3",
      taskId: "X1",
      projectListId: "MOVED_AWAY",
      projectName: "Moved Out Of The Folder",
      sentAt: new Date("2026-07-01T14:00:00Z"),
    });
    const p = build({ rows: [stray] }).projects.find((x) => x.listId === "MOVED_AWAY")!;
    expect(p.name).toBe("Moved Out Of The Folder");
    expect(p.deliverables).toHaveLength(1);
  });

  it("an ad-hoc delivery with no list is still its own project", () => {
    const adhoc = row({ id: "d4", taskId: "Y1", projectListId: null, projectName: "One-off" });
    const p = build({ rows: [adhoc] }).projects.find((x) => x.name === "One-off")!;
    expect(p.listId).toBe("");
    expect(p.deliverables).toHaveLength(1);
  });

  it("a list with deliveries appears once, not twice", () => {
    expect(page.projects.filter((p) => p.listId === "ACTIVE_WITH_SENDS")).toHaveLength(1);
  });

  it("counts every discovered project and orders the delivery-less one by its milestone", () => {
    // ROADMAP_ONLY (Sep 18 milestone) is ahead of ACTIVE_WITH_SENDS (sent Aug 20);
    // the archived project sorts last whatever its date.
    expect(page.projects.map((p) => p.listId)).toEqual([
      "ROADMAP_ONLY",
      "ACTIVE_WITH_SENDS",
      "ARCHIVED_WITH_SENDS",
    ]);
    expect(page.counts).toEqual({ inProgress: 2, completed: 1 });
    expect(page.countsLabel).toBe("2 projects in progress, 1 completed");
  });

  it("a delivery-less project contributes no attention items but can be focused", () => {
    expect(page.attention.map((a) => a.projectListId)).not.toContain("ROADMAP_ONLY");
    const focused = build({ focusListId: "ROADMAP_ONLY" });
    expect(focused.projects.map((p) => p.listId)).toEqual(["ROADMAP_ONLY"]);
    expect(focused.counts).toEqual({ inProgress: 2, completed: 1 });
  });

  it("without a discovered list the page is delivery-driven exactly as before", () => {
    const page = build({ discovered: undefined });
    expect(page.projects.map((p) => p.listId)).toEqual(["ACTIVE_WITH_SENDS", "ARCHIVED_WITH_SENDS"]);
    // The stored project name is all we have then.
    expect(page.projects[0].name).toBe("Stored Project Name");
  });
});
