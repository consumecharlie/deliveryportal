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
import {
  deliverableTitle,
  variantLabel,
  milestoneLabel,
  linkLabel,
  deliverableKey,
  informativeParentName,
  stripVersionTokens,
  countsLine,
  extractLinkTexts,
  normalizeUrl,
  linkKind,
  linkHint,
  cleanLinkText,
  reviewMode,
  reviewLabel,
  type ReviewMode,
} from "@/lib/portal-labels";
import { decideFeedbackStatus, type ConfirmationRow, type FeedbackStatus } from "@/lib/portal-status";
import { pickReviewLink } from "@/lib/portal-view-model";
import { pairFeedbackTask, type LivePayload, type LiveMilestone } from "@/lib/portal-live";
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
  clientLogoUrl?: string | null;
  clientDomain?: string | null;
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

const OUR_DOMAINS: ReadonlySet<string> = new Set(["consume-media.com"]);

/**
 * The client's email domain: from the most recent delivery whose primary
 * recipient is not one of ours. Lowercase; null when no delivery qualifies.
 */
export function deriveClientDomain(
  rows: Array<{ primaryEmail?: string | null; sentAt: Date }>
): string | null {
  const sorted = [...rows].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  for (const r of sorted) {
    const email = (r.primaryEmail ?? "").trim().toLowerCase();
    const at = email.lastIndexOf("@");
    if (at < 0 || at === email.length - 1) continue;
    const domain = email.slice(at + 1);
    if (!domain.includes(".") || OUR_DOMAINS.has(domain)) continue;
    return domain;
  }
  return null;
}

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/**
 * A delivery link as a button: labelled by the anchor text it had in the
 * message we sent (project name prefix removed), else by the host hint, else
 * by the template variable; typed by host/path.
 */
export function toLink(l: TimelineLink, anchorTexts: Map<string, string>, projectName: string): PortalLink {
  const kind = linkKind(l.url);
  const hint = linkHint(kind);
  const fromMessage = cleanLinkText(anchorTexts.get(normalizeUrl(l.url)), projectName, hint);
  const fallback = kind !== "web" ? hint : linkLabel(l.variableName, l.label) || hint;
  return { url: l.url, label: fromMessage ?? fallback, hint, kind };
}

function toVersion(row: PortalPageRow, versionNumber: number, names: MentionNames): PortalVersion {
  const anchorTexts = extractLinkTexts(row.emailContent || row.slackContent || "");
  return {
    deliveryId: row.id,
    label: row.deliverableType,
    versionNumber,
    sentAtMs: row.sentAt.getTime(),
    links: row.links.map((l) => toLink(l, anchorTexts, row.projectName)),
    body: clientBody(row, names),
  };
}

function noReview(mode: ReviewMode): PortalDeliverable["review"] {
  return {
    state: "none",
    mode,
    label: reviewLabel({ state: "none", mode }),
    dueMs: null,
    dueIsEstimate: false,
    confirmedAtMs: null,
    canUndo: false,
  };
}

/**
 * Map a feedback status onto the portal's review block. An estimated date
 * (our default window, not a deadline anyone set) is a suggestion, so it
 * stays "awaiting" and never escalates to due-today / overdue.
 */
export function toReview(s: FeedbackStatus, mode: ReviewMode): PortalDeliverable["review"] {
  if (s.kind === "none") return noReview(mode);
  if (s.kind === "confirmed") {
    const confirmedAtMs = s.confirmedAt?.getTime() ?? null;
    return {
      state: "confirmed",
      mode,
      label: reviewLabel({ state: "confirmed", mode, confirmedLabel: confirmedAtMs ? shortDate(confirmedAtMs) : null }),
      dueMs: null,
      dueIsEstimate: false,
      confirmedAtMs,
      canUndo: s.confirmedAt !== null,
    };
  }
  let state: ReviewState = "awaiting";
  if (!s.dueIsEstimate && s.state === "overdue") state = "overdue";
  else if (!s.dueIsEstimate && s.state === "due-today") state = "due-today";
  return {
    state,
    mode,
    label: reviewLabel({ state, mode, dueLabel: s.dueLabel, dueIsEstimate: s.dueIsEstimate }),
    dueMs: s.dueMs,
    dueIsEstimate: s.dueIsEstimate,
    confirmedAtMs: null,
    canUndo: false,
  };
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
  const total = draft.versions.length;
  const versions = draft.versions.map((v, i) => toVersion(v, total - i, names));
  const primary = pickReviewLink(latest.links);
  primaryLinks.set(
    latest.id,
    primary ? versions[0].links.find((l) => l.url === primary.url) ?? null : null
  );

  // A parent that names the deliverable ("LOC19: Intuit") is the title and
  // the share task's variant is the second line. A missing or phase-only
  // parent ("Post-Production") says nothing, so the share task label itself
  // is the title and the version info alone fills the second line.
  const parentTitle = informativeParentName(latest.parentTaskName);
  let title: string;
  let variant: string | null;
  if (parentTitle) {
    title = deliverableTitle(latest.parentTaskName, extractFamilyName(latest.deliverableType));
    variant = variantLabel(latest.shareTaskName, latest.deliverableType);
    // With several versions the type of the latest one is worth a second line
    // ("Edit V2") even when the share task name adds nothing.
    if (!variant && draft.versions.length > 1) variant = latest.deliverableType;
    if (variant && sameText(variant, title)) variant = null;
  } else {
    title = milestoneLabel(latest.shareTaskName, latest.deliverableType);
    variant = null;
  }

  // An archived project never needs review.
  const task = pairFeedbackTask(live, {
    parentTaskId: latest.parentTaskId,
    deliverableType: latest.deliverableType,
    shareTaskName: latest.shareTaskName,
    sentAtMs: latest.sentAt.getTime(),
  });
  const mode = reviewMode(task?.name, latest.deliverableType);
  const review = live?.archived
    ? noReview(mode)
    : toReview(
        decideFeedbackStatus({
          task,
          confirmation: input.confirmations.get(latest.id) ?? null,
          sentAt: latest.sentAt,
          feedbackWindows: latest.feedbackWindows,
          nowMs: input.nowMs,
        }),
        mode
      );

  return {
    key: draft.key,
    title,
    variant,
    latest: versions[0],
    history: versions.slice(1),
    review,
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
    // The parent adds information only when it names a deliverable that the
    // label does not already say ("Post Script AV" under "Post Script AV V1" does not).
    const parentTitle = informativeParentName(m.parentTaskName);
    const sublabel =
      parentTitle &&
      !sameText(parentTitle, projectName) &&
      !sameText(parentTitle, label) &&
      !sameText(parentTitle, stripVersionTokens(label))
        ? parentTitle
        : null;
    const dateMs = delivered ? row?.sentAt.getTime() ?? m.closedMs ?? m.dueMs : m.dueMs;
    return { id: m.taskId, label, sublabel, dateMs, state, deliveryId: row?.id ?? null };
  });
}

function summarize(
  phase: PortalProject["phase"],
  wrapsUpMs: number | null,
  upNext: PortalMilestone | null,
  lastActivityMs: number,
  nowMs: number
): string {
  if (phase === "completed") return `Completed ${shortDateWithYear(lastActivityMs)}`;
  // A wrap date in the past is not something to promise.
  const wrapsUp = wrapsUpMs && wrapsUpMs > nowMs ? `wraps up ${shortDate(wrapsUpMs)}` : null;
  if (upNext) {
    const when = upNext.dateMs ? ` on ${shortDate(upNext.dateMs)}` : "";
    return ["In progress", wrapsUp, `up next: ${upNext.label}${when}`].filter(Boolean).join(", ");
  }
  return ["In progress, next deliverable not scheduled yet", wrapsUp].filter(Boolean).join(", ");
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

  // Only an archived list is finished: lists keep getting share tasks as
  // episodes are added, so "every milestone closed" is not the end.
  const phase: PortalProject["phase"] = live?.archived ? "completed" : "in-progress";
  const upNext = milestones.find((m) => m.state === "up-next") ?? null;

  return {
    listId,
    name,
    phase,
    summary: summarize(phase, live?.wrapsUpMs ?? null, upNext, lastActivityMs, input.nowMs),
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
  // Real deadlines (ClickUp or the promised window) before estimates; within
  // each group the soonest (for estimates: oldest) first.
  const estimateRank = (a: PortalAttentionItem) => (a.review.dueIsEstimate ? 1 : 0);
  attention.sort(
    (a, b) =>
      estimateRank(a) - estimateRank(b) ||
      (a.review.dueMs ?? Infinity) - (b.review.dueMs ?? Infinity) ||
      a.deliveryId.localeCompare(b.deliveryId)
  );

  return {
    token: input.token,
    clientName: input.clientName,
    clientLogoUrl: input.clientLogoUrl ?? null,
    clientDomain: input.clientDomain ?? null,
    counts,
    countsLabel: countsLine(counts),
    attention,
    projects: shown,
    focusListId: input.focusListId,
  };
}
