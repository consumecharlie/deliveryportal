/**
 * Portal read path: turn a portal token into everything the client pages
 * need. Every query here is scoped by the token's clientFolderId, so a token
 * can never see another client's deliveries.
 */
import { prisma } from "@/lib/db";
import { isValidPortalToken } from "@/lib/portal-token";
import {
  buildTimeline,
  dropReplaced,
  type Timeline,
  type TimelineEntry,
  type MentionNames,
} from "@/lib/portal-timeline";
import {
  allFeedbackTasks,
  getClientFolderLists,
  getLiveFeedbackMany,
  pairFeedbackTask,
  type LiveFeedbackTask,
} from "@/lib/portal-live";
import { feedbackTaskTitle } from "@/lib/portal-labels";
import { formatFeedbackDeadline } from "@/lib/feedback-deadline";
import { selectProjectLists } from "@/lib/portal-projects";
import {
  buildPortalPage,
  deriveClientDomain,
  type BuildPortalPageInput,
  type PortalPageRow,
} from "@/lib/portal-page";
import type { PortalPageModel } from "@/lib/portal-page-model";
import {
  decideFeedbackStatus,
  newestConfirmation,
  type FeedbackStatus,
  type ConfirmationRow,
} from "@/lib/portal-status";

export interface PortalAccessInfo {
  id: string;
  clientFolderId: string;
  clientName: string;
  token: string;
}

export async function resolveAccess(token: string): Promise<PortalAccessInfo | null> {
  if (!isValidPortalToken(token)) return null;
  const row = await prisma.portalAccess.findUnique({ where: { token } });
  if (!row || row.revokedAt) return null;
  return {
    id: row.id,
    clientFolderId: row.clientFolderId,
    clientName: row.clientName,
    token: row.token,
  };
}

/** One confirmable item that has no delivery behind it, resolved for a route. */
export interface PortalFeedbackTaskTarget {
  feedbackTaskId: string;
  projectListId: string;
  projectName: string;
  /** What the client sees it called, for the Slack and ClickUp text. */
  title: string;
  /** "Tue, Sep 8" (+ the time when ClickUp carried one). */
  deadlineLabel: string;
  /** True when the portal is asking the client to act on it right now. */
  awaiting: boolean;
}

export interface PortalActionItem {
  entry: TimelineEntry;
  projectName: string;
  status: FeedbackStatus;
}

export interface PortalData {
  access: PortalAccessInfo;
  timeline: Timeline;
  /** deliveryId -> status, for the latest version of each deliverable */
  status: Record<string, FeedbackStatus>;
  actionItems: PortalActionItem[];
}

/** Newest confirmation per delivery (undone ones included, so undo wins). */
async function latestConfirmations(deliveryIds: string[]) {
  const out = new Map<string, ConfirmationRow>();
  if (deliveryIds.length === 0) return out;
  const rows = await prisma.feedbackConfirmation.findMany({
    where: { deliveryId: { in: deliveryIds } },
    select: { deliveryId: true, confirmedAt: true, undoneAt: true, confirmedByName: true },
  });
  const byDelivery = new Map<string, ConfirmationRow[]>();
  for (const r of rows) {
    if (!r.deliveryId) continue; // task-only rows have no delivery to group under
    const arr = byDelivery.get(r.deliveryId) ?? [];
    arr.push(r);
    byDelivery.set(r.deliveryId, arr);
  }
  for (const [id, list] of byDelivery) {
    const newest = newestConfirmation(list);
    if (newest) out.set(id, newest);
  }
  return out;
}

/**
 * The token's deliveries (always scoped by clientFolderId), newest first,
 * shaped for the pure builders. `onlyListId` is a filter inside the folder.
 */
async function selectDeliveries(
  access: PortalAccessInfo,
  onlyListId?: string
): Promise<Array<PortalPageRow & { primaryEmail: string; ccEmails: string | null }>> {
  const rows = await prisma.delivery.findMany({
    where: {
      clientFolderId: access.clientFolderId,
      ...(onlyListId ? { projectListId: onlyListId } : {}),
    },
    orderBy: { sentAt: "desc" },
    include: { links: true },
  });
  return rows.map((r) => ({
    id: r.id,
    taskId: r.taskId,
    primaryEmail: r.primaryEmail,
    ccEmails: r.ccEmails,
    projectListId: r.projectListId,
    projectName: r.projectName,
    deliverableType: r.deliverableType,
    department: r.department,
    sentAt: r.sentAt,
    emailContent: r.emailContent,
    slackContent: r.slackContent,
    replacesDeliveryId: r.replacesDeliveryId,
    links: r.links.map((l) => ({ url: l.url, label: l.label, variableName: l.variableName })),
    feedbackWindows: r.feedbackWindows ?? "",
    parentTaskId: r.parentTaskId,
    parentTaskName: r.parentTaskName,
    shareTaskName: r.shareTaskName,
  }));
}

// Names for mention stripping: we do not store Slack ids and names on the
// delivery, so v1 maps nothing and every mention renders as "you".
const MENTION_NAMES: MentionNames = {};

/**
 * The redesigned portal page: every project for the client (so the header
 * counts are client-wide), narrowed to one project's section when
 * `focusListId` is given.
 *
 * Projects come from the client's ClickUp folder, not from past deliveries,
 * so an active project shows from kickoff with its roadmap and no
 * deliverables yet. Archived lists are not listed (their roadmaps are history
 * and a client can have a dozen), so completed projects stay delivery-driven.
 * Both the folder listing and the live per-list state come from the 5 minute
 * DashboardCache.
 */
export async function loadPortalPage(
  access: PortalAccessInfo,
  focusListId?: string
): Promise<PortalPageModel> {
  return buildPortalPage({ ...(await loadPortalContext(access)), focusListId: focusListId ?? null });
}

/**
 * Everything `buildPortalPage` needs for this client, loaded once. Kept apart
 * from the build so a second read (the confirm and undo routes resolving a
 * feedback task) can reuse it without a second trip to ClickUp.
 */
async function loadPortalContext(
  access: PortalAccessInfo
): Promise<Omit<BuildPortalPageInput, "focusListId">> {
  const rows = await selectDeliveries(access);
  const current = dropReplaced(rows);
  const deliveryListIds = Array.from(
    new Set(current.map((r) => r.projectListId ?? "").filter(Boolean))
  );
  const [confirmations, folderLists, preference] = await Promise.all([
    latestConfirmations(current.map((r) => r.id)),
    getClientFolderLists(access.clientFolderId),
    prisma.clientPreference
      .findUnique({ where: { clientFolderId: access.clientFolderId }, select: { logoUrl: true } })
      .catch(() => null),
  ]);
  // One pass over every list we might show: the folder's active lists plus any
  // list a delivery points at (archived projects, lists moved out of the folder).
  const live = await getLiveFeedbackMany([...folderLists.map((l) => l.id), ...deliveryListIds]);
  const discovered = selectProjectLists({ folderLists, live, deliveryListIds });
  return {
    token: access.token,
    clientName: access.clientName,
    clientLogoUrl: preference?.logoUrl ?? null,
    clientDomain: deriveClientDomain(rows),
    nowMs: Date.now(),
    rows,
    live,
    confirmations,
    discovered,
    names: MENTION_NAMES,
  };
}

/**
 * An attention item that stands on a Feedback Deadline task alone, resolved
 * from the token's own projects. This is the scope check for the task-only
 * confirm and undo path: a task id that is not in one of this client's lists
 * resolves to null, exactly as a foreign delivery id does.
 *
 * `awaiting` says whether the portal is in fact asking the client to act on
 * it right now (in progress, waiting on client, dated, and not already spoken
 * for by a deliverable), so a confirm can answer 404 and 409 apart.
 */
export async function findPortalFeedbackTask(
  access: PortalAccessInfo,
  feedbackTaskId: string
): Promise<PortalFeedbackTaskTarget | null> {
  if (!feedbackTaskId) return null;
  const ctx = await loadPortalContext(access);
  let listId: string | null = null;
  let task: LiveFeedbackTask | null = null;
  for (const [id, payload] of Object.entries(ctx.live)) {
    const found = allFeedbackTasks(payload).find((t) => t.taskId === feedbackTaskId);
    if (found) {
      listId = id;
      task = found;
      break;
    }
  }
  if (!task || !listId) return null;

  const page = buildPortalPage({ ...ctx, focusListId: null });
  const item = page.attention.find((a) => a.feedbackTaskId === feedbackTaskId && a.deliveryId === null);
  const project = page.projects.find((p) => p.listId === listId);
  const fmt = formatFeedbackDeadline(task.dueMs);
  return {
    feedbackTaskId,
    projectListId: listId,
    projectName: item?.projectName ?? project?.name ?? "",
    title: item?.deliverableTitle ?? feedbackTaskTitle(task.name, null, task.deliverableType),
    deadlineLabel: fmt.timeLabel ? `${fmt.formattedDate}, ${fmt.timeLabel}` : fmt.formattedDate,
    awaiting: Boolean(item),
  };
}

export async function loadPortal(access: PortalAccessInfo, onlyListId?: string): Promise<PortalData> {
  const rows = await selectDeliveries(access, onlyListId);
  const names = MENTION_NAMES;
  const timeline = buildTimeline(rows, names);
  const rowsById = new Map(rows.map((r) => [r.id, r]));

  const latestIds = timeline.projects.flatMap((p) => p.deliverables.map((g) => g.latest.id));
  const confirmations = await latestConfirmations(latestIds);
  const now = Date.now();
  const status: PortalData["status"] = {};
  const actionItems: PortalData["actionItems"] = [];

  // One cache read for every project, misses fetched a few at a time.
  // Ad-hoc deliveries with no list ("" ids) have no ClickUp tasks to look up.
  const liveByList = await getLiveFeedbackMany(timeline.projects.map((p) => p.listId));

  for (const project of timeline.projects) {
    const live = liveByList[project.listId];

    for (const group of project.deliverables) {
      const e = group.latest;
      const s = decideFeedbackStatus({
        task: pairFeedbackTask(live, {
          parentTaskId: rowsById.get(e.id)?.parentTaskId ?? null,
          deliverableType: e.deliverableType,
          shareTaskName: rowsById.get(e.id)?.shareTaskName ?? null,
          sentAtMs: e.sentAt.getTime(),
        }),
        confirmation: confirmations.get(e.id) ?? null,
        sentAt: e.sentAt,
        feedbackWindows: e.feedbackWindows,
        nowMs: now,
      });
      status[e.id] = s;
      if (s.kind === "awaiting") actionItems.push({ entry: e, projectName: project.name, status: s });
    }
  }
  actionItems.sort((a, b) => a.status.dueMs - b.status.dueMs);
  return { access, timeline, status, actionItems };
}
