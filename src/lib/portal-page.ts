/**
 * Builds the client portal page model (`portal-page-model.ts`) from
 * Delivery rows, the cached live ClickUp payload per list, and the newest
 * confirmation per delivery. Pure, no I/O: `portal-data.ts` loads, this shapes.
 */
import {
  dropReplaced,
  clientBody,
  bySentAtDesc,
  type TimelineDelivery,
  type TimelineLink,
  type MentionNames,
} from "@/lib/portal-timeline";
import { extractFamilyName } from "@/lib/template-families";
import { deliverableTitle, variantLabel, milestoneLabel, linkLabel, deliverableKey } from "@/lib/portal-labels";
import { decideFeedbackStatus, type ConfirmationRow, type FeedbackStatus } from "@/lib/portal-status";
import { pickReviewLink } from "@/lib/portal-view-model";
import type { LivePayload, LiveMilestone } from "@/lib/portal-live";
import type {
  PortalPageModel,
  PortalProject,
  PortalDeliverable,
  PortalVersion,
  PortalLink,
  PortalMilestone,
  PortalAttentionItem,
  ReviewState,
} from "@/lib/portal-page-model";

/** A Delivery row as the page builder needs it (timeline fields plus identity). */
export interface PortalPageRow extends TimelineDelivery {
  /** ClickUp share task id. */
  taskId: string;
  parentTaskId: string | null;
  parentTaskName: string | null;
  shareTaskName: string | null;
}

export interface BuildPortalPageInput {
  token: string;
  clientName: string;
  /** When set, only that project's section is returned (counts stay client-wide). */
  focusListId: string | null;
  nowMs: number;
  rows: PortalPageRow[];
  /** listId -> live payload. Missing lists (ad-hoc, "" ids) simply have no roadmap. */
  live: Record<string, LivePayload>;
  /** deliveryId -> newest confirmation row (undone rows included, so undo wins). */
  confirmations: Map<string, ConfirmationRow>;
  /** Slack user id -> display name, for mention stripping. */
  names?: MentionNames;
}

const TZ = "America/New_York";

/** "Sep 8" */
export function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" });
}

/** "Sep 8, 2026" */
export function shortDateWithYear(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const ATTENTION_STATES: ReadonlySet<ReviewState> = new Set(["awaiting", "due-today", "overdue"]);

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

function toLink(l: TimelineLink): PortalLink {
  return { url: l.url, label: linkLabel(l.variableName, l.label) };
}

function toVersion(row: PortalPageRow, names: MentionNames): PortalVersion {
  return {
    deliveryId: row.id,
    label: row.deliverableType,
    sentAtMs: row.sentAt.getTime(),
    links: row.links.map(toLink),
    body: clientBody(row, names),
  };
}

/**
 * Map a feedback status onto the portal's review block. An estimated date
 * (our default window, not a deadline anyone set) is a suggestion, so it
 * stays "awaiting" and never escalates to due-today / overdue.
 */
export function toReview(s: FeedbackStatus): PortalDeliverable["review"] {
  const canUndo = s.confirmedAt !== null;
  if (s.kind === "confirmed") {
    return {
      state: "confirmed",
      label: s.confirmedAt ? `Confirmed ${shortDate(s.confirmedAt.getTime())}` : "Confirmed",
      dueMs: null,
      dueIsEstimate: false,
      confirmedAtMs: s.confirmedAt?.getTime() ?? null,
      canUndo,
    };
  }
  if (s.kind === "none") {
    return { state: "none", label: "", dueMs: null, dueIsEstimate: false, confirmedAtMs: null, canUndo: false };
  }
  let state: ReviewState = "awaiting";
  let label = `Due ${s.dueLabel}`;
  if (s.dueIsEstimate) {
    label = `Suggested by ${s.dueLabel}`;
  } else if (s.state === "overdue") {
    state = "overdue";
    label = `Past due, was ${s.dueLabel}`;
  } else if (s.state === "due-today") {
    state = "due-today";
    // Keep the time when one was set: "Tue, Sep 8, 12:00 PM ET" -> "Due today, 12:00 PM ET".
    const time = s.dueLabel.split(", ").slice(2).join(", ");
    label = time ? `Due today, ${time}` : "Due today";
  }
  return { state, label, dueMs: s.dueMs, dueIsEstimate: s.dueIsEstimate, confirmedAtMs: null, canUndo: false };
}

interface DeliverableDraft {
  key: string;
  versions: PortalPageRow[]; // newest first
}

function groupDeliverables(rows: PortalPageRow[]): DeliverableDraft[] {
  const byKey = new Map<string, PortalPageRow[]>();
  for (const r of rows) {
    const key = deliverableKey(r);
    const arr = byKey.get(key) ?? [];
    arr.push(r);
    byKey.set(key, arr);
  }
  const out: DeliverableDraft[] = [];
  for (const [key, versions] of byKey) {
    versions.sort(bySentAtDesc);
    out.push({ key, versions });
  }
  out.sort((a, b) => bySentAtDesc(a.versions[0], b.versions[0]));
  return out;
}

function buildDeliverable(
  draft: DeliverableDraft,
  live: LivePayload | undefined,
  input: BuildPortalPageInput,
  names: MentionNames,
  primaryLinks: Map<string, PortalLink | null>
): PortalDeliverable {
  const latest = draft.versions[0];
  const primary = pickReviewLink(latest.links);
  primaryLinks.set(latest.id, primary ? toLink(primary) : null);
  const family = extractFamilyName(latest.deliverableType);
  const title = deliverableTitle(latest.parentTaskName, family);

  let variant = variantLabel(latest.shareTaskName, latest.deliverableType);
  // With several versions the type of the latest one is worth a second line
  // ("Edit V2") even when the share task name adds nothing.
  if (!variant && draft.versions.length > 1) variant = latest.deliverableType;
  if (variant && sameText(variant, title)) variant = null;

  const status = decideFeedbackStatus({
    task: live?.feedback[latest.deliverableType] ?? null,
    confirmation: input.confirmations.get(latest.id) ?? null,
    sentAt: latest.sentAt,
    feedbackWindows: latest.feedbackWindows,
    nowMs: input.nowMs,
  });

  return {
    key: draft.key,
    title,
    variant,
    latest: toVersion(latest, names),
    history: draft.versions.slice(1).map((v) => toVersion(v, names)),
    review: toReview(status),
  };
}

/**
 * Milestone states. A delivered milestone is "in-review" while the client
 * still owes feedback on it: when we have its delivery row, that is the
 * row's own review state (so an older version never reads as in review);
 * without a row, the paired Feedback Deadline task for its type being open.
 */
function buildMilestones(
  milestones: LiveMilestone[],
  live: LivePayload,
  rowsByTaskId: Map<string, PortalPageRow>,
  reviewByDeliveryId: Map<string, ReviewState>,
  projectName: string
): PortalMilestone[] {
  let upNextTaken = false;
  return milestones.map((m) => {
    const row = rowsByTaskId.get(m.taskId) ?? null;
    const delivered = m.isClosed || row !== null;
    let state: PortalMilestone["state"];
    if (delivered) {
      const inReview = row
        ? ATTENTION_STATES.has(reviewByDeliveryId.get(row.id) ?? "none")
        : Boolean(m.deliverableType && live.feedback[m.deliverableType]?.isOpen);
      state = inReview ? "in-review" : "delivered";
    } else if (!upNextTaken) {
      upNextTaken = true;
      state = "up-next";
    } else {
      state = "planned";
    }
    const label = m.deliverableType
      ? milestoneLabel(m.name, m.deliverableType)
      : variantLabel(m.name, "") ?? m.name;
    const parentTitle = deliverableTitle(m.parentTaskName, "");
    const sublabel =
      parentTitle && !sameText(parentTitle, projectName) && !sameText(parentTitle, label) ? parentTitle : null;
    const dateMs = delivered ? row?.sentAt.getTime() ?? m.closedMs ?? m.dueMs : m.dueMs;
    return { id: m.taskId, label, sublabel, dateMs, state, deliveryId: row?.id ?? null };
  });
}

function summarize(
  phase: PortalProject["phase"],
  wrapsUpMs: number | null,
  upNext: PortalMilestone | null,
  lastActivityMs: number
): string {
  if (phase === "completed") return `Completed ${shortDateWithYear(lastActivityMs)}`;
  let s = wrapsUpMs ? `In progress, wraps up ${shortDate(wrapsUpMs)}` : "In progress";
  if (upNext) s += `, up next: ${upNext.label}${upNext.dateMs ? ` on ${shortDate(upNext.dateMs)}` : ""}`;
  return s;
}

function buildProject(
  rows: PortalPageRow[],
  allRowsByTaskId: Map<string, PortalPageRow>,
  input: BuildPortalPageInput,
  names: MentionNames,
  primaryLinks: Map<string, PortalLink | null>
): PortalProject {
  const newest = [...rows].sort(bySentAtDesc)[0];
  const listId = newest.projectListId ?? "";
  const name = newest.projectName;
  const live = listId ? input.live[listId] : undefined;
  const lastActivityMs = newest.sentAt.getTime();

  const deliverables = groupDeliverables(rows).map((d) =>
    buildDeliverable(d, live, input, names, primaryLinks)
  );
  const reviewByDeliveryId = new Map(deliverables.map((d) => [d.latest.deliveryId, d.review.state]));
  const milestones = live
    ? buildMilestones(live.milestones, live, allRowsByTaskId, reviewByDeliveryId, name)
    : [];

  const allClosed = live !== undefined && live.milestones.length > 0 && live.milestones.every((m) => m.isClosed);
  const phase: PortalProject["phase"] = live?.archived || allClosed ? "completed" : "in-progress";
  const upNext = milestones.find((m) => m.state === "up-next") ?? null;

  return {
    listId,
    name,
    phase,
    summary: summarize(phase, live?.wrapsUpMs ?? null, upNext, lastActivityMs),
    wrapsUpMs: live?.wrapsUpMs ?? null,
    lastActivityMs,
    milestones,
    deliverables,
  };
}

export function buildPortalPage(input: BuildPortalPageInput): PortalPageModel {
  const names = input.names ?? {};
  const liveRows = dropReplaced(input.rows);

  // Newest live row per share task, for matching milestones to deliveries.
  const rowsByTaskId = new Map<string, PortalPageRow>();
  for (const r of [...liveRows].sort(bySentAtDesc)) {
    if (!rowsByTaskId.has(r.taskId)) rowsByTaskId.set(r.taskId, r);
  }

  // Group by project; deliveries without a list id group by project name so
  // ad-hoc sends do not all pile into one.
  const byProject = new Map<string, PortalPageRow[]>();
  for (const r of liveRows) {
    const key = r.projectListId || "name:" + r.projectName;
    const arr = byProject.get(key) ?? [];
    arr.push(r);
    byProject.set(key, arr);
  }

  // Frame.io, then Loom, then the first link: decided from the raw links
  // (by template variable) while the deliverables are built.
  const primaryLinks = new Map<string, PortalLink | null>();
  const projects = Array.from(byProject.values()).map((rows) =>
    buildProject(rows, rowsByTaskId, input, names, primaryLinks)
  );
  const rank = (p: PortalProject) => (p.phase === "in-progress" ? 0 : 1);
  projects.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      b.lastActivityMs - a.lastActivityMs ||
      a.listId.localeCompare(b.listId) ||
      a.name.localeCompare(b.name)
  );

  const counts = {
    inProgress: projects.filter((p) => p.phase === "in-progress").length,
    completed: projects.filter((p) => p.phase === "completed").length,
  };

  const shown = input.focusListId ? projects.filter((p) => p.listId === input.focusListId) : projects;

  const attention: PortalAttentionItem[] = [];
  for (const p of shown) {
    for (const d of p.deliverables) {
      if (!ATTENTION_STATES.has(d.review.state)) continue;
      attention.push({
        deliveryId: d.latest.deliveryId,
        deliverableTitle: d.title,
        variant: d.variant,
        projectName: p.name,
        projectListId: p.listId,
        review: d.review,
        primaryLink: primaryLinks.get(d.latest.deliveryId) ?? null,
      });
    }
  }
  attention.sort(
    (a, b) => (a.review.dueMs ?? Infinity) - (b.review.dueMs ?? Infinity) || a.deliveryId.localeCompare(b.deliveryId)
  );

  return {
    token: input.token,
    clientName: input.clientName,
    counts,
    attention,
    projects: shown,
    focusListId: input.focusListId,
  };
}
