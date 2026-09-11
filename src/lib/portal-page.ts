/**
 * Builds the client portal page model (`portal-page-model.ts`) from the
 * projects discovered in the client's ClickUp folder, Delivery rows, the
 * cached live ClickUp payload per list, and the newest confirmation per
 * delivery. Pure, no I/O: `portal-data.ts` loads, this shapes.
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
  stripClientPrefix,
  feedbackTaskTitle,
  emailDomain,
  type ReviewMode,
} from "@/lib/portal-labels";
import { decideFeedbackStatus, type ConfirmationRow, type FeedbackStatus } from "@/lib/portal-status";
import { deadlineState } from "@/lib/portal-deadline";
import { formatFeedbackDeadline } from "@/lib/feedback-deadline";
import { pickReviewLink } from "@/lib/portal-view-model";
import {
  allFeedbackTasks,
  pairFeedbackTask,
  type LiveFeedbackTask,
  type LivePayload,
  type LiveMilestone,
} from "@/lib/portal-live";
import type { DiscoveredProject } from "@/lib/portal-projects";
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
  /**
   * Projects found in the client's ClickUp folder (`selectProjectLists`).
   * Each one becomes a project even with no deliveries yet, and its list name
   * wins over the name stored on the deliveries. Lists a delivery points at
   * but the folder listing does not carry are added from the rows.
   */
  discovered?: DiscoveredProject[];
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

/**
 * The client's email domain: scanning deliveries newest first, the first
 * address (primary recipient, then cc list) that is not ours or a personal
 * mailbox. Slack sends have no recipients, so older deliveries count too.
 * Lowercase; null when nothing qualifies.
 */
export function deriveClientDomain(
  rows: Array<{ primaryEmail?: string | null; ccEmails?: string | null; sentAt: Date }>
): string | null {
  const sorted = [...rows].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  for (const r of sorted) {
    const candidates = [r.primaryEmail ?? "", ...(r.ccEmails ?? "").split(/[,;]/)];
    for (const c of candidates) {
      const domain = emailDomain(c);
      if (domain) return domain;
    }
  }
  return null;
}

function majority(domains: string[]): string | null {
  const counts = new Map<string, number>();
  for (const d of domains) counts.set(d, (counts.get(d) ?? 0) + 1);
  let best: string | null = null;
  for (const [d, n] of counts) {
    if (best === null || n > counts.get(best)! || (n === counts.get(best) && d < best)) best = d;
  }
  return best;
}

/**
 * The client's email domain from the Project Contact tasks of its lists:
 * the most common domain across in-progress (not archived) lists, then
 * across completed ones. Null when no list has a usable contact.
 */
export function pickContactDomain(payloads: LivePayload[]): string | null {
  const active = payloads.filter((p) => !p.archived).flatMap((p) => p.contactDomains ?? []);
  return majority(active) ?? majority(payloads.filter((p) => p.archived).flatMap((p) => p.contactDomains ?? []));
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
    dueIsEndOfDay: false,
    windowStartMs: null,
    confirmedAtMs: null,
    canUndo: false,
  };
}

/**
 * The start of a review window, or null: a start on or after the deadline is
 * bad data and no window at all, so the UI can trust the pair.
 */
function windowStart(startMs: number | null | undefined, dueMs: number | null): number | null {
  if (startMs === null || startMs === undefined || dueMs === null) return null;
  return startMs < dueMs ? startMs : null;
}

/**
 * Map a feedback status onto the portal's review block. An estimated date
 * (our default window, not a deadline anyone set) is a suggestion, so it
 * stays "awaiting" and never escalates to due-today / overdue.
 *
 * `startMs` is when the client's clock started (the version's send date); it
 * reaches the model only while something is actually due.
 */
export function toReview(
  s: FeedbackStatus,
  mode: ReviewMode,
  startMs?: number | null
): PortalDeliverable["review"] {
  if (s.kind === "none") return noReview(mode);
  if (s.kind === "confirmed") {
    const confirmedAtMs = s.confirmedAt?.getTime() ?? null;
    return {
      state: "confirmed",
      mode,
      label: reviewLabel({ state: "confirmed", mode, confirmedLabel: confirmedAtMs ? shortDate(confirmedAtMs) : null }),
      dueMs: null,
      dueIsEstimate: false,
      dueIsEndOfDay: false,
      windowStartMs: null,
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
    label: reviewLabel({
      state,
      mode,
      dueLabel: s.dueLabel,
      dueIsEstimate: s.dueIsEstimate,
      dueIsEndOfDay: s.dueIsEndOfDay,
    }),
    dueMs: s.dueMs,
    dueIsEstimate: s.dueIsEstimate,
    dueIsEndOfDay: s.dueIsEndOfDay,
    windowStartMs: windowStart(startMs, s.dueMs),
    confirmedAtMs: null,
    canUndo: false,
  };
}

/**
 * A project plus the attention items that stand on its feedback tasks alone,
 * which only the project's own build knows enough to find.
 */
interface BuiltProject {
  project: PortalProject;
  taskAttention: PortalAttentionItem[];
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
  primaryLinks: Map<string, PortalLink | null>,
  /** Collects the Feedback Deadline tasks a deliverable already speaks for. */
  pairedTaskIds: Set<string>
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
  if (task) pairedTaskIds.add(task.taskId);
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
        mode,
        latest.sentAt.getTime()
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
  /** The project's name as the client reads it and as ClickUp spells it. */
  projectNames: string[]
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
      !projectNames.some((n) => sameText(parentTitle, n)) &&
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

/** The soonest dated milestone the client is still waiting on. */
function earliestUpcomingMs(milestones: PortalMilestone[]): number | null {
  const dates = milestones
    .filter((m) => m.state === "up-next" || m.state === "planned")
    .map((m) => m.dateMs)
    .filter((d): d is number => d !== null);
  return dates.length > 0 ? Math.min(...dates) : null;
}

/** "Tue, Sep 8", with the time when ClickUp carried one, and whether it had one. */
function dueLabelOf(dueMs: number): { label: string; isEndOfDay: boolean } {
  const fmt = formatFeedbackDeadline(dueMs);
  return {
    label: fmt.timeLabel ? `${fmt.formattedDate}, ${fmt.timeLabel}` : fmt.formattedDate,
    isEndOfDay: fmt.timeLabel === "",
  };
}

/**
 * When we handed this feedback task's work over: the newest completed share
 * task under the same parent for the same deliverable type. That is the start
 * of the client's review window when no delivery row exists. Null when the
 * roadmap has no such completion.
 */
function shareTaskClosedMs(task: LiveFeedbackTask, milestones: LiveMilestone[]): number | null {
  let best: number | null = null;
  for (const m of milestones) {
    if (!m.isClosed || m.closedMs === null) continue;
    if (m.parentTaskId !== task.parentTaskId) continue;
    if (!sameText(m.deliverableType, task.deliverableType)) continue;
    if (best === null || m.closedMs > best) best = m.closedMs;
  }
  return best;
}

/** The review block for an attention item that stands on a feedback task alone. */
function taskReview(task: LiveFeedbackTask, live: LivePayload, nowMs: number): PortalDeliverable["review"] {
  const due = deadlineState(task.dueMs!, nowMs);
  const state: ReviewState = due === "open" ? "awaiting" : due;
  const mode = reviewMode(task.name, task.deliverableType);
  const { label, isEndOfDay } = dueLabelOf(task.dueMs!);
  return {
    state,
    mode,
    label: reviewLabel({ state, mode, dueLabel: label, dueIsEstimate: false, dueIsEndOfDay: isEndOfDay }),
    dueMs: task.dueMs,
    dueIsEstimate: false,
    dueIsEndOfDay: isEndOfDay,
    windowStartMs: windowStart(shareTaskClosedMs(task, live.milestones), task.dueMs),
    confirmedAtMs: null,
    canUndo: false,
  };
}

/**
 * Attention items for the feedback tasks nothing else speaks for: the team
 * completed a share task in ClickUp without sending through the portal, so
 * there is no Delivery row, yet the paired Feedback Deadline task is waiting
 * on the client. The roadmap already shows these; without this they would
 * never reach the action list.
 *
 * Only "waiting on client" tasks count (an open "not ready" task is ours to
 * finish), only tasks no deliverable already paired to, only in-progress
 * projects, and only dated tasks: with no delivery there is no send date to
 * compute a deadline from, so an undated task has nothing to ask by.
 */
function buildTaskAttention(
  project: PortalProject,
  live: LivePayload | undefined,
  pairedTaskIds: Set<string>,
  nowMs: number
): PortalAttentionItem[] {
  if (!live || project.phase !== "in-progress") return [];
  const out: PortalAttentionItem[] = [];
  for (const task of allFeedbackTasks(live)) {
    if (!task.awaitingClient || task.dueMs === null) continue;
    if (pairedTaskIds.has(task.taskId)) continue;
    const parentName = task.parentTaskId
      ? live.milestones.find((m) => m.parentTaskId === task.parentTaskId)?.parentTaskName ?? null
      : null;
    const title = feedbackTaskTitle(task.name, parentName, task.deliverableType);
    const parentTitle = informativeParentName(parentName);
    const variant =
      parentTitle && !sameText(parentTitle, title) && !sameText(parentTitle, project.name)
        ? deliverableTitle(parentName, "") || parentTitle
        : null;
    out.push({
      deliveryId: null,
      feedbackTaskId: task.taskId,
      deliverableTitle: title,
      variant: variant && !sameText(variant, title) ? variant : null,
      projectName: project.name,
      projectListId: project.listId,
      review: taskReview(task, live, nowMs),
      primaryLink: null,
    });
  }
  return out;
}

/**
 * One project: a list discovered in the client's folder, the deliveries on
 * that list, or both. A discovered list with no delivery yet is a real
 * project with an empty `deliverables` array and a roadmap from ClickUp.
 */
function buildProject(
  discovered: DiscoveredProject | null,
  rows: PortalPageRow[],
  allRowsByTaskId: Map<string, PortalPageRow>,
  input: BuildPortalPageInput,
  names: MentionNames,
  primaryLinks: Map<string, PortalLink | null>
): BuiltProject {
  const newest = rows.length > 0 ? [...rows].sort(bySentAtDesc)[0] : null;
  const listId = discovered?.listId ?? newest?.projectListId ?? "";
  // The ClickUp list name is the source of truth (lists get renamed); the
  // name stored on the delivery covers lists we cannot see (archived, moved
  // out of the folder) and ad-hoc sends with no list at all. Lists are named
  // "<Client name> <Project name>" and the client knows who they are, so the
  // client name comes off for every label built from this one.
  const fullName = (discovered?.name ?? "").trim() || newest?.projectName || "Project";
  const name = stripClientPrefix(fullName, input.clientName);
  const live = listId ? input.live[listId] : undefined;

  const pairedTaskIds = new Set<string>();
  const deliverables = groupDeliverables(rows).map((d) =>
    buildDeliverable(d, live, input, names, primaryLinks, pairedTaskIds)
  );
  const reviewByDeliveryId = new Map(deliverables.map((d) => [d.latest.deliveryId, d.review.state]));
  const milestones = live
    ? buildMilestones(live.milestones, live, allRowsByTaskId, reviewByDeliveryId, [name, fullName])
    : [];

  // Only an archived list is finished: lists keep getting share tasks as
  // episodes are added, so "every milestone closed" is not the end.
  const archived = live ? live.archived : discovered?.archived ?? false;
  const phase: PortalProject["phase"] = archived ? "completed" : "in-progress";
  const upNext = milestones.find((m) => m.state === "up-next") ?? null;

  // Newest delivery, else what the project is working towards: the soonest
  // planned milestone, then the list's wrap date.
  const lastActivityMs =
    newest?.sentAt.getTime() ?? earliestUpcomingMs(milestones) ?? live?.wrapsUpMs ?? 0;

  const project: PortalProject = {
    listId,
    name,
    phase,
    summary: summarize(phase, live?.wrapsUpMs ?? null, upNext, lastActivityMs, input.nowMs),
    wrapsUpMs: live?.wrapsUpMs ?? null,
    lastActivityMs,
    milestones,
    deliverables,
  };
  return {
    project,
    taskAttention: buildTaskAttention(project, live, pairedTaskIds, input.nowMs),
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

  // Every project the folder gave us, keyed like the row groups so a list
  // with deliveries is one project, not two.
  const discovered = new Map<string, DiscoveredProject>();
  for (const d of input.discovered ?? []) {
    if (d.listId) discovered.set(d.listId, d);
  }

  // Frame.io, then Loom, then the first link: decided from the raw links
  // (by template variable) while the deliverables are built.
  const primaryLinks = new Map<string, PortalLink | null>();
  const keys = Array.from(new Set([...discovered.keys(), ...byProject.keys()]));
  const built = keys.map((key) =>
    buildProject(
      discovered.get(key) ?? null,
      byProject.get(key) ?? [],
      rowsByTaskId,
      input,
      names,
      primaryLinks
    )
  );
  const rank = (p: PortalProject) => (p.phase === "in-progress" ? 0 : 1);
  built.sort(
    ({ project: a }, { project: b }) =>
      rank(a) - rank(b) ||
      b.lastActivityMs - a.lastActivityMs ||
      a.listId.localeCompare(b.listId) ||
      a.name.localeCompare(b.name)
  );
  const projects = built.map((b) => b.project);

  const counts = {
    inProgress: projects.filter((p) => p.phase === "in-progress").length,
    completed: projects.filter((p) => p.phase === "completed").length,
  };

  const shownBuilt = input.focusListId
    ? built.filter((b) => b.project.listId === input.focusListId)
    : built;
  const shown = shownBuilt.map((b) => b.project);

  const attention: PortalAttentionItem[] = [];
  for (const { project: p } of shownBuilt) {
    for (const d of p.deliverables) {
      if (!ATTENTION_STATES.has(d.review.state)) continue;
      attention.push({
        deliveryId: d.latest.deliveryId,
        // The delivery is the confirm key here; the task id only matters for
        // an item that has no delivery behind it.
        feedbackTaskId: null,
        deliverableTitle: d.title,
        variant: d.variant,
        projectName: p.name,
        projectListId: p.listId,
        review: d.review,
        primaryLink: primaryLinks.get(d.latest.deliveryId) ?? null,
      });
    }
  }
  // Then the feedback tasks no delivery stands behind.
  for (const b of shownBuilt) attention.push(...b.taskAttention);
  // Real deadlines (ClickUp or the promised window) before estimates; within
  // each group the soonest (for estimates: oldest) first.
  const estimateRank = (a: PortalAttentionItem) => (a.review.dueIsEstimate ? 1 : 0);
  const itemKey = (a: PortalAttentionItem) => a.deliveryId ?? a.feedbackTaskId ?? "";
  attention.sort(
    (a, b) =>
      estimateRank(a) - estimateRank(b) ||
      (a.review.dueMs ?? Infinity) - (b.review.dueMs ?? Infinity) ||
      itemKey(a).localeCompare(itemKey(b))
  );

  return {
    token: input.token,
    clientName: input.clientName,
    clientLogoUrl: input.clientLogoUrl ?? null,
    // Delivery recipients first; Slack-only clients fall back to the lists' Project Contacts.
    clientDomain: input.clientDomain ?? pickContactDomain(Object.values(input.live)),
    counts,
    countsLabel: countsLine(counts),
    attention,
    projects: shown,
    focusListId: input.focusListId,
  };
}
