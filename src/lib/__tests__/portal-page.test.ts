import { describe, it, expect } from "vitest";
import { buildPortalPage, toReview, type PortalPageRow, type BuildPortalPageInput } from "@/lib/portal-page";
import { decideFeedbackStatus, type ConfirmationRow } from "@/lib/portal-status";
import type { LivePayload, LiveMilestone, LiveFeedbackTask } from "@/lib/portal-live";
import { LIVE_PAYLOAD_VERSION } from "@/lib/portal-live";

/** Thu Sep 3 2026, 11:00 ET. */
const NOW = Date.parse("2026-09-03T15:00:00Z");
/** ClickUp date-only sentinel: 08:00 UTC on that calendar date. */
const day = (iso: string) => Date.parse(`${iso}T08:00:00Z`);

const FRAME = { url: "https://app.frame.io/r/1", label: "frameReviewLink", variableName: "frameReviewLink" };
const DRIVE = { url: "https://drive.google.com/d/1", label: "googleDeliverableLink", variableName: "googleDeliverableLink" };
const LOOM = { url: "https://loom.com/s/1", label: "loomReviewLink", variableName: "loomReviewLink" };

function row(over: Partial<PortalPageRow> & { id: string }): PortalPageRow {
  return {
    taskId: `task-${over.id}`,
    projectListId: "L1",
    projectName: "Leaders of Code Podcast",
    deliverableType: "Edit V1",
    department: "Post-Production",
    sentAt: new Date("2026-06-01T14:00:00Z"),
    emailContent: "Hi <@U1>, here it is",
    slackContent: null,
    replacesDeliveryId: null,
    links: [FRAME],
    feedbackWindows: "2 Business Days",
    parentTaskId: null,
    parentTaskName: null,
    shareTaskName: null,
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

function live(over: Partial<LivePayload>): LivePayload {
  return { version: LIVE_PAYLOAD_VERSION, feedback: {}, feedbackByParent: {}, milestones: [], wrapsUpMs: null, archived: false, ...over };
}

function fd(over: Partial<LiveFeedbackTask> & { taskId: string }): LiveFeedbackTask {
  return { name: over.taskId, dueMs: null, isOpen: true, parentTaskId: null, deliverableType: "Edit V1", ...over };
}

const P19 = { parentTaskId: "P19", parentTaskName: "LOC19: Intuit" };
const P21 = { parentTaskId: "P21", parentTaskName: "Post-Production - Leaders of Code - Ep #21" };

const ROWS: PortalPageRow[] = [
  // LOC19 video: original, its resend, then a V2 (one deliverable, two versions shown).
  row({ id: "v1a", taskId: "S19v", ...P19, shareTaskName: "Share Video Edit01 with Client", sentAt: new Date("2026-05-20T14:00:00Z"), links: [FRAME, DRIVE] }),
  row({ id: "v1b", taskId: "S19v", ...P19, shareTaskName: "Share Video Edit01 with Client", sentAt: new Date("2026-05-20T16:00:00Z"), links: [FRAME, DRIVE], replacesDeliveryId: "v1a" }),
  row({ id: "v2", taskId: "S19v2", ...P19, shareTaskName: "Share Video Edit02 with Client", deliverableType: "Edit V2", sentAt: new Date("2026-05-27T14:00:00Z") }),
  // LOC19 snippets: same parent, a different deliverable.
  row({ id: "s1", taskId: "S19s", ...P19, shareTaskName: "Share Snippets Edit01 with Client", sentAt: new Date("2026-06-04T14:00:00Z"), links: [DRIVE] }),
  // Ep #21 video, awaiting feedback.
  row({ id: "e21", taskId: "S21v", ...P21, shareTaskName: "Share Video Edit01 with Client", sentAt: new Date("2026-07-30T14:00:00Z"), links: [LOOM, FRAME] }),
  // A second project with no feedback task: estimated deadline.
  row({ id: "c1", taskId: "SC1", projectListId: "L2", projectName: "CallRail Wiggam Law Virtual Testimonial", parentTaskId: "PC", parentTaskName: "Post-Production", shareTaskName: "Share Post Script AV  V1 with Client", deliverableType: "Post AV V1", sentAt: new Date("2026-09-01T14:00:00Z"), feedbackWindows: "" }),
  // A finished project.
  row({ id: "f1", taskId: "SL2", projectListId: "L3", projectName: "Salesloft Logo Reveal", parentTaskId: "PL", parentTaskName: "Post-Production", shareTaskName: "Share Final Deliverables with Client", deliverableType: "Final Delivery", sentAt: new Date("2026-08-10T14:00:00Z") }),
  // An ad-hoc send with no list, older than 30 days.
  row({ id: "a1", taskId: "SA", projectListId: null, projectName: "One-off", shareTaskName: "Share Potential Master with Client", deliverableType: "Potential Master", sentAt: new Date("2026-06-01T14:00:00Z") }),
];

const LIVE: Record<string, LivePayload> = {
  L1: live({
    feedback: {
      "Edit V1": fd({ taskId: "F1", name: "Confirm Edit V1 Feedback Received", dueMs: day("2026-09-08"), parentTaskId: "P21" }),
      "Edit V2": fd({ taskId: "F2", name: "Confirm Edit V2 Feedback Received", dueMs: day("2026-05-29"), isOpen: false, parentTaskId: "P19", deliverableType: "Edit V2" }),
    },
    feedbackByParent: {
      P19: [
        fd({ taskId: "F19v", dueMs: day("2026-05-22"), isOpen: false, parentTaskId: "P19" }),
        fd({ taskId: "F2", dueMs: day("2026-05-29"), isOpen: false, parentTaskId: "P19", deliverableType: "Edit V2" }),
      ],
      P21: [fd({ taskId: "F1", dueMs: day("2026-09-08"), parentTaskId: "P21" })],
    },
    milestones: [
      ms({ taskId: "S19v", name: "Share Video Edit01 with Client", ...P19, dueMs: day("2026-05-20"), isClosed: true, closedMs: Date.parse("2026-05-20T16:05:00Z") }),
      ms({ taskId: "S19v2", name: "Share Video Edit02 with Client", ...P19, deliverableType: "Edit V2", dueMs: day("2026-05-27"), isClosed: true }),
      ms({ taskId: "S19s", name: "Share Snippets Edit01 with Client", ...P19, dueMs: day("2026-06-04"), isClosed: true }),
      ms({ taskId: "S21v", name: "Share Video Edit01 with Client", ...P21, dueMs: day("2026-07-30"), isClosed: true }),
      ms({ taskId: "S22v", name: "Share Video Edit01 with Client", parentTaskId: "P22", parentTaskName: "Post-Production - Leaders of Code - Ep #22", dueMs: day("2026-09-15") }),
      ms({ taskId: "SFin", name: "Share Final Deliverables with Client", parentTaskId: "PPod", parentTaskName: "Post-Production - Leaders of Code Podcast", deliverableType: "Final Delivery", dueMs: day("2026-09-28") }),
      ms({ taskId: "SUnd", name: "Share Edit V1 with Client" }),
    ],
    wrapsUpMs: day("2026-09-28"),
  }),
  L2: live({
    milestones: [
      ms({ taskId: "SC1", name: "Share Post Script AV  V1 with Client", parentTaskId: "PC", parentTaskName: "Post-Production", deliverableType: "Post AV V1", dueMs: day("2026-09-01"), isClosed: true }),
      ms({ taskId: "SC2", name: "Share Post Script AV V2 with Client", parentTaskId: "PC", parentTaskName: "Post-Production", deliverableType: "Post AV V2", dueMs: day("2026-09-10") }),
    ],
  }),
  L3: live({
    archived: true,
    feedback: { "Final Delivery": fd({ taskId: "F3", dueMs: day("2026-08-12"), isOpen: false, deliverableType: "Final Delivery" }) },
    milestones: [
      ms({ taskId: "SL1", name: "Share Potential Master with Client", parentTaskId: "PL", parentTaskName: "Post-Production", deliverableType: "Potential Master", dueMs: day("2026-08-01"), isClosed: true }),
      ms({ taskId: "SL2", name: "Share Final Deliverables with Client", parentTaskId: "PL", parentTaskName: "Post-Production", deliverableType: "Final Delivery", dueMs: day("2026-08-10"), isClosed: true }),
    ],
  }),
};

const CONFIRMATIONS = new Map<string, ConfirmationRow>([
  ["s1", { confirmedAt: new Date("2026-06-06T18:00:00Z"), undoneAt: null, confirmedByName: "Dana" }],
]);

function build(over: Partial<BuildPortalPageInput> = {}) {
  return buildPortalPage({
    token: "tok",
    clientName: "Stack Overflow",
    focusListId: null,
    nowMs: NOW,
    rows: ROWS,
    live: LIVE,
    confirmations: CONFIRMATIONS,
    names: { U1: "Whitney" },
    ...over,
  });
}

describe("buildPortalPage: projects and deliverables", () => {
  const page = build();
  const loc = page.projects.find((p) => p.listId === "L1")!;

  it("carries the token and client name and sorts in-progress (by activity) before completed", () => {
    expect(page.token).toBe("tok");
    expect(page.clientName).toBe("Stack Overflow");
    expect(page.projects.map((p) => p.name)).toEqual([
      "CallRail Wiggam Law Virtual Testimonial",
      "Leaders of Code Podcast",
      "One-off",
      "Salesloft Logo Reveal",
    ]);
    expect(page.counts).toEqual({ inProgress: 3, completed: 1 });
    expect(page.focusListId).toBeNull();
  });

  it("keys deliverables by parent task plus variant, newest first, with resends replacing originals", () => {
    expect(loc.deliverables.map((d) => d.key)).toEqual(["P21:video", "P19:snippets", "P19:video"]);
    const video = loc.deliverables[2];
    expect(video.title).toBe("LOC19: Intuit");
    expect(video.variant).toBe("Video Edit02");
    expect(video.latest.deliveryId).toBe("v2");
    expect(video.latest.label).toBe("Edit V2");
    expect(video.history.map((v) => v.deliveryId)).toEqual(["v1b"]);
    expect(video.history[0].label).toBe("Edit V1");
  });

  it("strips the department prefix from the parent name and keeps the variant", () => {
    const ep21 = loc.deliverables[0];
    expect(ep21.title).toBe("Leaders of Code - Ep #21");
    expect(ep21.variant).toBe("Video Edit01");
    expect(loc.deliverables[1]).toMatchObject({ title: "LOC19: Intuit", variant: "Snippets Edit01" });
  });

  it("renders client-safe bodies and labelled links", () => {
    const ep21 = loc.deliverables[0];
    expect(ep21.latest.body).toBe("Hi Whitney, here it is");
    expect(ep21.latest.links).toEqual([
      { url: LOOM.url, label: "Loom walkthrough" },
      { url: FRAME.url, label: "Frame.io review" },
    ]);
    expect(ep21.latest.sentAtMs).toBe(Date.parse("2026-07-30T14:00:00Z"));
  });

  it("without an informative parent the share task label is the title and there is no variant", () => {
    const adhoc = page.projects.find((p) => p.name === "One-off")!;
    expect(adhoc.listId).toBe("");
    expect(adhoc.deliverables[0]).toMatchObject({ key: "family:Edit", title: "Potential Master", variant: null });
    expect(adhoc.deliverables[0].latest.label).toBe("Potential Master");
    const callrail = page.projects.find((p) => p.listId === "L2")!;
    expect(callrail.deliverables[0]).toMatchObject({ key: "family:Post AV:script", title: "Post Script AV V1", variant: null });
  });

  it("versions under a phase-only parent stack as one deliverable titled by the latest share task", () => {
    const PP = { projectListId: "L7", projectName: "Wiggam", parentTaskId: "PP", parentTaskName: "Post-Production" };
    const p = build({
      rows: [
        row({ id: "p1", ...PP, shareTaskName: "Share Post Script V1 with Client", deliverableType: "Post Script V1", sentAt: new Date("2026-08-20T14:00:00Z") }),
        row({ id: "p2", ...PP, shareTaskName: "Share Post Script V2 with Client", deliverableType: "Post Script V2", sentAt: new Date("2026-08-25T14:00:00Z") }),
        row({ id: "p3", ...PP, shareTaskName: "Share Final Post Script with Client", deliverableType: "Post Script Final", sentAt: new Date("2026-08-28T14:00:00Z") }),
        row({ id: "av", ...PP, shareTaskName: "Share Post Script AV V1 with Client", deliverableType: "Post AV V1", sentAt: new Date("2026-08-29T14:00:00Z") }),
      ],
      live: {},
      confirmations: new Map(),
    });
    const w = p.projects.find((x) => x.listId === "L7")!;
    expect(w.deliverables.map((d) => [d.title, d.variant, d.history.length])).toEqual([
      ["Post Script AV V1", null, 0],
      ["Final Post Script", null, 2],
    ]);
    expect(w.deliverables[1].history.map((v) => v.label)).toEqual(["Post Script V2", "Post Script V1"]);
  });
});

describe("buildPortalPage: review state", () => {
  const page = build();
  const loc = page.projects.find((p) => p.listId === "L1")!;

  it("awaiting with a live deadline", () => {
    expect(loc.deliverables[0].review).toEqual({
      state: "awaiting",
      label: "Due Tue, Sep 8",
      dueMs: day("2026-09-08"),
      dueIsEstimate: false,
      confirmedAtMs: null,
      canUndo: false,
    });
  });

  it("confirmed by the client (undo allowed) with the confirmation date", () => {
    expect(loc.deliverables[1].review).toEqual({
      state: "confirmed",
      label: "Confirmed Jun 6",
      dueMs: null,
      dueIsEstimate: false,
      confirmedAtMs: Date.parse("2026-06-06T18:00:00Z"),
      canUndo: true,
    });
  });

  it("confirmed through ClickUp only (no row): no date, no undo", () => {
    expect(loc.deliverables[2].review).toMatchObject({ state: "confirmed", label: "Confirmed", confirmedAtMs: null, canUndo: false });
    const p = build({ live: { ...LIVE, L3: { ...LIVE.L3, archived: false } } });
    expect(p.projects.find((x) => x.listId === "L3")!.deliverables[0].review.state).toBe("confirmed");
  });

  it("an estimated deadline is a suggestion and never escalates", () => {
    const callrail = page.projects.find((p) => p.listId === "L2")!;
    expect(callrail.deliverables[0].review).toMatchObject({
      state: "awaiting",
      label: "Suggested by Thu, Sep 3",
      dueIsEstimate: true,
      dueMs: day("2026-09-03"),
    });
  });

  it("an old delivery with no feedback task has nothing to do", () => {
    const adhoc = page.projects.find((p) => p.name === "One-off")!;
    expect(adhoc.deliverables[0].review).toMatchObject({ state: "none", label: "", canUndo: false });
  });

  it("pairs feedback by parent first, so sibling episodes with the same type do not share one task", () => {
    // Episode 21's "Edit V1" task is open list-wide; episode 22's own task is closed.
    const rows = [
      ...ROWS,
      row({ id: "e22", taskId: "S22v", parentTaskId: "P22", parentTaskName: "Post-Production - Leaders of Code - Ep #22", shareTaskName: "Share Video Edit01 with Client", sentAt: new Date("2026-08-20T14:00:00Z") }),
      // Episode 23 sent as Edit V2 but its parent only has an Edit V1 feedback task (open): version-stripped match.
      row({ id: "e23", taskId: "S23v", parentTaskId: "P23", parentTaskName: "Post-Production - Leaders of Code - Ep #23", shareTaskName: "Share Video Edit02 with Client", deliverableType: "Edit V2", sentAt: new Date("2026-08-25T14:00:00Z") }),
      // Episode 24 has no feedback task of its own: falls back to the list-wide type lookup.
      row({ id: "e24", taskId: "S24v", parentTaskId: "P24", parentTaskName: "Post-Production - Leaders of Code - Ep #24", shareTaskName: "Share Video Edit01 with Client", sentAt: new Date("2026-08-27T14:00:00Z") }),
    ];
    const l1 = live({
      ...LIVE.L1,
      feedbackByParent: {
        ...LIVE.L1.feedbackByParent,
        P22: [fd({ taskId: "F22", dueMs: day("2026-08-24"), isOpen: false, parentTaskId: "P22" })],
        P23: [fd({ taskId: "F23", dueMs: day("2026-09-16"), parentTaskId: "P23", deliverableType: "Edit V1" })],
      },
    });
    const p = build({ rows, live: { ...LIVE, L1: l1 } });
    const byId = Object.fromEntries(p.projects.find((x) => x.listId === "L1")!.deliverables.map((d) => [d.latest.deliveryId, d.review]));
    expect(byId.e21).toMatchObject({ state: "awaiting", dueMs: day("2026-09-08") });
    expect(byId.e22).toMatchObject({ state: "confirmed" });
    expect(byId.e23).toMatchObject({ state: "awaiting", label: "Due Wed, Sep 16" });
    expect(byId.e24).toMatchObject({ state: "awaiting", dueMs: day("2026-09-08") });
    // The LOC19 video (Edit V2) pairs with its parent's closed Edit V2 task.
    expect(byId.v2).toMatchObject({ state: "confirmed" });
  });

  it("an archived project never needs review and never reaches the attention list", () => {
    const p = build({ live: { ...LIVE, L2: { ...LIVE.L2, archived: true } } });
    const callrail = p.projects.find((x) => x.listId === "L2")!;
    expect(callrail.phase).toBe("completed");
    expect(callrail.deliverables[0].review).toEqual({ state: "none", label: "", dueMs: null, dueIsEstimate: false, confirmedAtMs: null, canUndo: false });
    expect(p.attention.map((a) => a.deliveryId)).toEqual(["e21"]);
    expect(callrail.milestones.map((m) => m.state)).toEqual(["delivered", "up-next"]);
  });

  it("an undone confirmation goes back to awaiting", () => {
    const p = build({
      confirmations: new Map([["e21", { confirmedAt: new Date("2026-08-06T18:00:00Z"), undoneAt: new Date("2026-08-07T18:00:00Z"), confirmedByName: "Dana" }]]),
    });
    const ep21 = p.projects.find((x) => x.listId === "L1")!.deliverables[0];
    expect(ep21.review.state).toBe("awaiting");
    expect(ep21.review.canUndo).toBe(false);
  });
});

describe("toReview labels", () => {
  const base = { confirmation: null, sentAt: new Date("2026-08-20T14:00:00Z"), feedbackWindows: "2 Business Days" };
  const task = (dueMs: number) => fd({ taskId: "F", dueMs });

  it("overdue: 'Past due, was ...'", () => {
    const r = toReview(decideFeedbackStatus({ ...base, task: task(day("2026-09-01")), nowMs: NOW }));
    expect(r).toMatchObject({ state: "overdue", label: "Past due, was Tue, Sep 1", dueMs: day("2026-09-01") });
  });

  it("due today, with and without a time", () => {
    expect(toReview(decideFeedbackStatus({ ...base, task: task(day("2026-09-03")), nowMs: NOW }))).toMatchObject({ state: "due-today", label: "Due today" });
    expect(toReview(decideFeedbackStatus({ ...base, task: task(Date.parse("2026-09-03T16:00:00Z")), nowMs: NOW }))).toMatchObject({ state: "due-today", label: "Due today, 12:00 PM ET" });
  });

  it("a timed future deadline keeps the time", () => {
    expect(toReview(decideFeedbackStatus({ ...base, task: task(Date.parse("2026-09-08T21:00:00Z")), nowMs: NOW })).label).toBe("Due Tue, Sep 8, 5:00 PM ET");
  });
});

describe("buildPortalPage: milestones, phase and summary", () => {
  const page = build();
  const loc = page.projects.find((p) => p.listId === "L1")!;

  it("assigns states in date order: delivered, in-review, one up-next, then planned", () => {
    expect(loc.milestones.map((m) => [m.id, m.state])).toEqual([
      ["S19v", "delivered"],
      ["S19v2", "delivered"],
      ["S19s", "delivered"],
      ["S21v", "in-review"],
      ["S22v", "up-next"],
      ["SFin", "planned"],
      ["SUnd", "planned"],
    ]);
  });

  it("links delivered milestones to their newest delivery row and uses the send date", () => {
    expect(loc.milestones[0]).toMatchObject({ deliveryId: "v1b", dateMs: Date.parse("2026-05-20T16:00:00Z") });
    expect(loc.milestones[3].deliveryId).toBe("e21");
    expect(loc.milestones[4]).toMatchObject({ deliveryId: null, dateMs: day("2026-09-15") });
    expect(loc.milestones[6].dateMs).toBeNull();
  });

  it("labels from the share task name, sublabel from the parent when it adds information", () => {
    expect(loc.milestones[0]).toMatchObject({ label: "Video Edit01", sublabel: "LOC19: Intuit" });
    expect(loc.milestones[3]).toMatchObject({ label: "Video Edit01", sublabel: "Leaders of Code - Ep #21" });
    // Parent equal to the project name adds nothing; a milestone with no parent has no sublabel.
    expect(loc.milestones[5]).toMatchObject({ label: "Final Deliverables", sublabel: null });
    expect(loc.milestones[6]).toMatchObject({ label: "Edit V1", sublabel: null });
  });

  it("phase-only parents and parents the label already says give no sublabel", () => {
    const callrail = page.projects.find((p) => p.listId === "L2")!;
    expect(callrail.milestones.map((m) => m.sublabel)).toEqual([null, null]);
    const p = build({
      live: {
        L2: live({
          milestones: [
            ms({ taskId: "a", name: "Share Post Script AV V1 with Client", parentTaskId: "X", parentTaskName: "Post Script AV", deliverableType: "Post AV V1", dueMs: day("2026-09-10") }),
            ms({ taskId: "b", name: "Share Edit V1 with Client", parentTaskId: "Y", parentTaskName: "Post-Production - Edit", dueMs: day("2026-09-11") }),
            ms({ taskId: "c", name: "Share Edit V1 with Client", parentTaskId: "Z", parentTaskName: "Post-Production - Ep #22", dueMs: day("2026-09-12") }),
          ],
        }),
      },
    });
    const m = p.projects.find((x) => x.listId === "L2")!.milestones;
    expect(m.map((x) => [x.label, x.sublabel])).toEqual([
      ["Post Script AV V1", null],
      ["Edit V1", null],
      ["Edit V1", "Ep #22"],
    ]);
  });

  it("a closed share task without a delivery row is delivered, or in-review while its feedback task is open", () => {
    const done = page.projects.find((p) => p.listId === "L3")!;
    expect(done.milestones.map((m) => m.state)).toEqual(["delivered", "delivered"]);
    const p = build({ live: { ...LIVE, L3: live({ ...LIVE.L3, archived: false, feedback: { "Potential Master": fd({ taskId: "Fx", deliverableType: "Potential Master" }) } }) } });
    expect(p.projects.find((x) => x.listId === "L3")!.milestones[0].state).toBe("in-review");
  });

  it("summaries: wrap date and up-next for in-progress, completion date for completed", () => {
    expect(loc.phase).toBe("in-progress");
    expect(loc.summary).toBe("In progress, wraps up Sep 28, up next: Video Edit01 on Sep 15");
    expect(loc.wrapsUpMs).toBe(day("2026-09-28"));
    const callrail = page.projects.find((p) => p.listId === "L2")!;
    expect(callrail.summary).toBe("In progress, up next: Post Script AV V2 on Sep 10");
    const done = page.projects.find((p) => p.listId === "L3")!;
    expect(done.phase).toBe("completed");
    expect(done.summary).toBe("Completed Aug 10, 2026");
    expect(done.lastActivityMs).toBe(Date.parse("2026-08-10T14:00:00Z"));
    expect(page.projects.find((p) => p.name === "One-off")!.summary).toBe("In progress, next deliverable not scheduled yet");
  });

  it("only an archived list is completed; every milestone closed still means in progress", () => {
    // Leaders of Code keeps getting episodes: 17 closed share tasks, not archived.
    const allClosed = live({
      ...LIVE.L1,
      milestones: LIVE.L1.milestones.slice(0, 4),
      feedback: {},
      feedbackByParent: {},
    });
    const p = build({ live: { ...LIVE, L1: allClosed } });
    const l1 = p.projects.find((x) => x.listId === "L1")!;
    expect(l1.phase).toBe("in-progress");
    expect(l1.summary).toBe("In progress, next deliverable not scheduled yet, wraps up Sep 28");
    expect(l1.milestones.every((m) => m.state === "delivered")).toBe(true);

    const noWrap = build({ live: { ...LIVE, L1: { ...allClosed, wrapsUpMs: null } } });
    expect(noWrap.projects.find((x) => x.listId === "L1")!.summary).toBe("In progress, next deliverable not scheduled yet");
    const pastWrap = build({ live: { ...LIVE, L1: { ...allClosed, wrapsUpMs: day("2026-08-01") } } });
    expect(pastWrap.projects.find((x) => x.listId === "L1")!.summary).toBe("In progress, next deliverable not scheduled yet");
  });

  it("an archived list is completed even with open milestones", () => {
    const p = build({ live: { ...LIVE, L1: { ...LIVE.L1, archived: true } } });
    const l1 = p.projects.find((x) => x.listId === "L1")!;
    expect(l1.phase).toBe("completed");
    expect(l1.summary).toBe("Completed Jul 30, 2026");
    expect(p.counts).toEqual({ inProgress: 2, completed: 2 });
    expect(p.countsLabel).toBe("2 projects in progress, 2 completed");
    // Completed projects also sort by latest activity.
    expect(p.projects.map((x) => x.listId)).toEqual(["L2", "", "L3", "L1"]);
  });

  it("a project with no live payload has no milestones and stays in progress", () => {
    const p = build({ live: {} });
    const l1 = p.projects.find((x) => x.listId === "L1")!;
    expect(l1.milestones).toEqual([]);
    expect(l1.phase).toBe("in-progress");
    expect(l1.summary).toBe("In progress, next deliverable not scheduled yet");
  });
});

describe("buildPortalPage: attention and focus", () => {
  it("lists everything awaiting the client, real deadlines first, then estimates, with the review link", () => {
    const page = build();
    // c1's Sep 3 date is an estimate, so e21's real Sep 8 deadline comes first.
    expect(page.attention.map((a) => a.deliveryId)).toEqual(["e21", "c1"]);
    expect(page.attention[1].review).toMatchObject({ dueIsEstimate: true, label: "Suggested by Thu, Sep 3" });
    expect(page.attention[0]).toEqual({
      deliveryId: "e21",
      deliverableTitle: "Leaders of Code - Ep #21",
      variant: "Video Edit01",
      projectName: "Leaders of Code Podcast",
      projectListId: "L1",
      review: expect.objectContaining({ state: "awaiting" }),
      primaryLink: { url: FRAME.url, label: "Frame.io review" },
    });
    expect(page.attention[1].primaryLink).toEqual({ url: FRAME.url, label: "Frame.io review" });
  });

  it("orders real deadlines by date, then estimates oldest first", () => {
    const P = { projectListId: "L8", projectName: "P8" };
    const rows = [
      row({ id: "est-old", ...P, deliverableType: "AV Script V1", feedbackWindows: "", sentAt: new Date("2026-08-31T14:00:00Z") }),
      row({ id: "est-new", ...P, deliverableType: "Storyboards V1", feedbackWindows: "", sentAt: new Date("2026-09-02T14:00:00Z") }),
      row({ id: "real-late", ...P, deliverableType: "Edit V1", sentAt: new Date("2026-09-01T14:00:00Z") }),
      row({ id: "real-soon", ...P, deliverableType: "Post AV V1", feedbackWindows: "1 Business Day", sentAt: new Date("2026-09-02T14:00:00Z") }),
    ];
    const page = build({
      rows,
      confirmations: new Map(),
      live: { L8: live({ feedback: { "Edit V1": fd({ taskId: "F", dueMs: day("2026-09-10") }) } }) },
    });
    expect(page.attention.map((a) => a.deliveryId)).toEqual(["real-soon", "real-late", "est-old", "est-new"]);
    expect(page.attention.map((a) => a.review.dueIsEstimate)).toEqual([false, false, true, true]);
  });

  it("prefers Frame.io, then Loom, then the first link", () => {
    const rows = [
      row({ id: "x", links: [DRIVE, LOOM], projectListId: "L9", projectName: "P9", deliverableType: "AV Script V1", sentAt: new Date("2026-08-28T14:00:00Z") }),
      row({ id: "y", links: [DRIVE], projectListId: "L9", projectName: "P9", deliverableType: "Edit V2", sentAt: new Date("2026-08-30T14:00:00Z") }),
      row({ id: "z", links: [], projectListId: "L9", projectName: "P9", deliverableType: "Storyboards V1", sentAt: new Date("2026-08-31T14:00:00Z") }),
    ];
    const page = build({ rows, live: {}, confirmations: new Map() });
    const byId = Object.fromEntries(page.attention.map((a) => [a.deliveryId, a.primaryLink]));
    expect(byId.x).toEqual({ url: LOOM.url, label: "Loom walkthrough" });
    expect(byId.y).toEqual({ url: DRIVE.url, label: "Google Drive" });
    expect(byId.z).toBeNull();
  });

  it("a focused list returns only that project and its attention, with client-wide counts", () => {
    const page = build({ focusListId: "L1" });
    expect(page.focusListId).toBe("L1");
    expect(page.projects.map((p) => p.listId)).toEqual(["L1"]);
    expect(page.attention.map((a) => a.deliveryId)).toEqual(["e21"]);
    expect(page.counts).toEqual({ inProgress: 3, completed: 1 });
    expect(page.countsLabel).toBe("3 projects in progress, 1 completed");
  });

  it("countsLabel is empty when there is nothing to count", () => {
    expect(build({ rows: [], live: {}, confirmations: new Map() }).countsLabel).toBe("");
  });

  it("a focus on an unknown list yields no projects", () => {
    expect(build({ focusListId: "nope" }).projects).toEqual([]);
  });
});
