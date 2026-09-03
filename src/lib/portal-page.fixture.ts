/**
 * Realistic PortalPageModel fixture for developing and screenshotting the
 * client portal without a database. Wired into the portal pages when
 * `PORTAL_FIXTURE=1`. Dates are relative to "now" so review states stay
 * meaningful whenever the fixture is used.
 */
import type {
  PortalDeliverable,
  PortalMilestone,
  PortalPageModel,
  PortalProject,
  PortalVersion,
} from "@/lib/portal-page-model";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

/** Noon Eastern (roughly) on a date `days` from today. */
function day(days: number): number {
  const d = new Date(NOW + days * DAY);
  d.setUTCHours(16, 0, 0, 0);
  return d.getTime();
}

function abs(iso: string): number {
  return new Date(iso).getTime();
}

const TZ = "America/New_York";
function short(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" });
}
function weekday(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const FRAME = (id: string) => ({ url: `https://app.frame.io/reviews/${id}`, label: "Frame.io" });
const DRIVE = (id: string) => ({ url: `https://drive.google.com/drive/folders/${id}`, label: "Google Drive" });

function version(
  deliveryId: string,
  label: string,
  sentAtMs: number,
  links: PortalVersion["links"],
  body: string
): PortalVersion {
  return { deliveryId, label, sentAtMs, links, body };
}

function confirmed(confirmedAtMs: number, canUndo = false): PortalDeliverable["review"] {
  return {
    state: "confirmed",
    label: `Confirmed ${short(confirmedAtMs)}`,
    dueMs: null,
    dueIsEstimate: false,
    confirmedAtMs,
    canUndo,
  };
}

function awaiting(dueMs: number, estimate = false): PortalDeliverable["review"] {
  return {
    state: "awaiting",
    label: `${estimate ? "Suggested by" : "Due"} ${weekday(dueMs)}`,
    dueMs,
    dueIsEstimate: estimate,
    confirmedAtMs: null,
    canUndo: false,
  };
}

function overdue(dueMs: number): PortalDeliverable["review"] {
  return {
    state: "overdue",
    label: `Was due ${weekday(dueMs)}`,
    dueMs,
    dueIsEstimate: false,
    confirmedAtMs: null,
    canUndo: false,
  };
}

const BODY_EDIT = `Hi Sarah,

Here is the first cut of the Intuit episode. A few notes before you dive in:

- The cold open runs about 40 seconds longer than we discussed, we think it earns it but happy to trim
- Lower thirds are placeholders until we get the final titles from your team
- Music is temp

Leave comments directly in Frame.io and we will pick them up from there.

Thanks,
Ben`;

const BODY_SNIPPETS = `Hi Sarah,

Six short snippets from the Intuit episode, cut for LinkedIn and X. Each is under 60 seconds with burned-in captions.

Let us know which ones you want to run first and we can prioritise the final polish in that order.

Ben`;

const BODY_EP21 = `Hi Sarah,

Episode 21 is ready for your first look. This one came together quickly, so please pay special attention to:

1. The name spelling on the guest lower third
2. The sponsor read at 12:40

Drive folder has the audio-only version for the podcast feed.

Ben`;

const BODY_SCRIPT = `Hi Dana,

Attached is the second draft of the post script for the Wiggam Law testimonial. We tightened the middle section and moved the results statistic up front, as discussed on the call.

Marcus`;

const BODY_AV = `Hi Dana,

Here is the AV script for the Wiggam Law testimonial: the left column is what we see, the right is what we hear. Once this is signed off we lock the shot list.

Marcus`;

const BODY_BVAS = `Hi Priya,

Final delivery for the BVAS launch video, all formats in the Drive folder:

- 16:9 master, ProRes and H.264
- 1:1 and 9:16 social cuts
- Captions as SRT

It was a pleasure working on this one.

Ben`;

/* ── Leaders of Code Podcast ─────────────────────────────────────────── */

const locIntuitV1 = version("del_loc_intuit_v1", "Video Edit01", abs("2026-05-20T14:00:00Z"), [FRAME("loc19-v1")], BODY_EDIT);
const locIntuitV2 = version(
  "del_loc_intuit_v2",
  "Video Edit02",
  abs("2026-06-02T15:30:00Z"),
  [FRAME("loc19-v2")],
  `Hi Sarah,\n\nSecond pass on the Intuit episode with your Frame.io notes folded in. The cold open is trimmed and the lower thirds are final.\n\nBen`
);
const locSnippets = version("del_loc_snippets", "Snippets Edit01", abs("2026-06-04T13:00:00Z"), [FRAME("loc19-snips")], BODY_SNIPPETS);
const locEp21 = version("del_loc_ep21_v1", "Video Edit01", day(-1), [FRAME("loc21-v1"), DRIVE("loc21")], BODY_EP21);

const locMilestones: PortalMilestone[] = [
  { id: "ms_loc_1", label: "Video Edit01", sublabel: "LOC19: Intuit", dateMs: locIntuitV1.sentAtMs, state: "delivered", deliveryId: locIntuitV2.deliveryId },
  { id: "ms_loc_2", label: "Snippets Edit01", sublabel: "LOC19: Intuit", dateMs: locSnippets.sentAtMs, state: "delivered", deliveryId: locSnippets.deliveryId },
  { id: "ms_loc_3", label: "Video Edit01", sublabel: "Ep #21", dateMs: locEp21.sentAtMs, state: "in-review", deliveryId: locEp21.deliveryId },
  { id: "ms_loc_4", label: "Video Edit02", sublabel: "Ep #21", dateMs: day(12), state: "up-next", deliveryId: null },
  { id: "ms_loc_5", label: "Snippets Edit01", sublabel: "Ep #21", dateMs: day(15), state: "planned", deliveryId: null },
  { id: "ms_loc_6", label: "Final Delivery", sublabel: "Ep #21", dateMs: day(25), state: "planned", deliveryId: null },
];

const leadersOfCode: PortalProject = {
  listId: "901300001",
  name: "Leaders of Code Podcast",
  phase: "in-progress",
  summary: `In post-production, wraps up ${short(day(25))}`,
  wrapsUpMs: day(25),
  lastActivityMs: locEp21.sentAtMs,
  milestones: locMilestones,
  deliverables: [
    {
      key: "task_loc19",
      title: "LOC19: Intuit",
      variant: "Video Edit01",
      latest: locIntuitV2,
      history: [locIntuitV1],
      review: confirmed(abs("2026-06-05T18:10:00Z"), true),
    },
    {
      key: "task_loc19_snips",
      title: "LOC19: Intuit",
      variant: "Snippets Edit01",
      latest: locSnippets,
      history: [],
      review: confirmed(abs("2026-06-08T20:00:00Z")),
    },
    {
      key: "task_loc21",
      title: "Leaders of Code, Ep #21",
      variant: "Video Edit01",
      latest: locEp21,
      history: [],
      review: awaiting(day(2)),
    },
  ],
};

/* ── CallRail Wiggam Law Virtual Testimonial ─────────────────────────── */

const crScriptV1 = version("del_cr_script_v1", "Post Script V1", abs("2026-08-12T14:00:00Z"), [DRIVE("cr-script")], BODY_SCRIPT);
const crScriptV2 = version("del_cr_script_v2", "Post Script V2", abs("2026-08-18T14:00:00Z"), [DRIVE("cr-script")], BODY_SCRIPT);
const crStoryboard = version("del_cr_storyboard", "Storyboard V1", abs("2026-08-24T14:00:00Z"), [FRAME("cr-sb"), DRIVE("cr-sb")], BODY_SCRIPT);
const crAv = version("del_cr_av_v1", "Post Script AV V1", day(-6), [DRIVE("cr-av")], BODY_AV);

const crMilestones: PortalMilestone[] = [
  { id: "ms_cr_1", label: "Post Script V1", sublabel: null, dateMs: crScriptV1.sentAtMs, state: "delivered", deliveryId: crScriptV2.deliveryId },
  { id: "ms_cr_2", label: "Post Script V2", sublabel: null, dateMs: crScriptV2.sentAtMs, state: "delivered", deliveryId: crScriptV2.deliveryId },
  { id: "ms_cr_3", label: "Storyboard V1", sublabel: null, dateMs: crStoryboard.sentAtMs, state: "delivered", deliveryId: crStoryboard.deliveryId },
  { id: "ms_cr_4", label: "Post Script AV V1", sublabel: null, dateMs: crAv.sentAtMs, state: "in-review", deliveryId: crAv.deliveryId },
  { id: "ms_cr_5", label: "Edit V1", sublabel: null, dateMs: day(12), state: "up-next", deliveryId: null },
  { id: "ms_cr_6", label: "Edit V2", sublabel: null, dateMs: day(19), state: "planned", deliveryId: null },
  { id: "ms_cr_7", label: "Edit V3", sublabel: null, dateMs: day(24), state: "planned", deliveryId: null },
  { id: "ms_cr_8", label: "Final Delivery", sublabel: null, dateMs: day(27), state: "planned", deliveryId: null },
];

const callRail: PortalProject = {
  listId: "901300002",
  name: "CallRail Wiggam Law Virtual Testimonial",
  phase: "in-progress",
  summary: `In pre-production, wraps up ${short(day(27))}`,
  wrapsUpMs: day(27),
  lastActivityMs: crAv.sentAtMs,
  milestones: crMilestones,
  deliverables: [
    {
      key: "task_cr_av",
      title: "Post Script AV",
      variant: "V1",
      latest: crAv,
      history: [],
      review: overdue(day(-2)),
    },
    {
      key: "task_cr_storyboard",
      title: "Storyboard",
      variant: "V1",
      latest: crStoryboard,
      history: [],
      review: confirmed(abs("2026-08-26T16:00:00Z"), true),
    },
    {
      key: "task_cr_script",
      title: "Post Script",
      variant: "V2",
      latest: crScriptV2,
      history: [crScriptV1],
      review: confirmed(abs("2026-08-20T16:00:00Z")),
    },
  ],
};

/* ── Stack BVAS (completed) ──────────────────────────────────────────── */

const bvScript = version("del_bv_script", "Script V1", abs("2025-12-12T15:00:00Z"), [DRIVE("bv-script")], BODY_SCRIPT);
const bvAnimatic = version("del_bv_animatic", "Animatic V1", abs("2026-01-20T15:00:00Z"), [FRAME("bv-animatic")], BODY_AV);
const bvEdit = version("del_bv_edit", "Edit V1", abs("2026-04-14T15:00:00Z"), [FRAME("bv-edit")], BODY_EDIT);
const bvFinal = version("del_bv_final", "Final Delivery", abs("2026-05-12T15:00:00Z"), [FRAME("bv-final"), DRIVE("bv-final")], BODY_BVAS);

const stackBvas: PortalProject = {
  listId: "901300003",
  name: "Stack BVAS",
  phase: "completed",
  summary: "Completed May 14",
  wrapsUpMs: abs("2026-05-14T16:00:00Z"),
  lastActivityMs: bvFinal.sentAtMs,
  milestones: [
    { id: "ms_bv_1", label: "Script V1", sublabel: null, dateMs: bvScript.sentAtMs, state: "delivered", deliveryId: bvScript.deliveryId },
    { id: "ms_bv_2", label: "Animatic V1", sublabel: null, dateMs: bvAnimatic.sentAtMs, state: "delivered", deliveryId: bvAnimatic.deliveryId },
    { id: "ms_bv_3", label: "Edit V1", sublabel: null, dateMs: bvEdit.sentAtMs, state: "delivered", deliveryId: bvEdit.deliveryId },
    { id: "ms_bv_4", label: "Final Delivery", sublabel: null, dateMs: bvFinal.sentAtMs, state: "delivered", deliveryId: bvFinal.deliveryId },
  ],
  deliverables: [
    { key: "task_bv_final", title: "BVAS Launch Video", variant: "Final Delivery", latest: bvFinal, history: [], review: confirmed(abs("2026-05-14T16:00:00Z")) },
    { key: "task_bv_edit", title: "BVAS Launch Video", variant: "Edit V1", latest: bvEdit, history: [], review: confirmed(abs("2026-04-17T16:00:00Z")) },
    { key: "task_bv_animatic", title: "BVAS Launch Video", variant: "Animatic V1", latest: bvAnimatic, history: [], review: confirmed(abs("2026-01-23T16:00:00Z")) },
    { key: "task_bv_script", title: "BVAS Launch Video", variant: "Script V1", latest: bvScript, history: [], review: confirmed(abs("2025-12-16T16:00:00Z")) },
  ],
};

const PROJECTS: PortalProject[] = [leadersOfCode, callRail, stackBvas];

export function fixturePortalPage(token: string, focusListId?: string): PortalPageModel {
  const projects = focusListId ? PROJECTS.filter((p) => p.listId === focusListId) : PROJECTS;
  const attention: PortalPageModel["attention"] = [];
  for (const p of PROJECTS) {
    for (const d of p.deliverables) {
      if (d.review.state === "awaiting" || d.review.state === "due-today" || d.review.state === "overdue") {
        attention.push({
          deliveryId: d.latest.deliveryId,
          deliverableTitle: d.title,
          variant: d.variant,
          projectName: p.name,
          projectListId: p.listId,
          review: d.review,
          primaryLink: d.latest.links[0] ?? null,
        });
      }
    }
  }
  attention.sort((a, b) => (a.review.dueMs ?? 0) - (b.review.dueMs ?? 0));
  const inProgress = PROJECTS.filter((p) => p.phase === "in-progress").length;
  const completed = PROJECTS.filter((p) => p.phase === "completed").length;
  return {
    token,
    clientName: "Stack Overflow",
    counts: { inProgress, completed },
    countsLabel: `${inProgress} projects in progress, ${completed} completed`,
    attention,
    projects,
    focusListId: focusListId ?? null,
  };
}
