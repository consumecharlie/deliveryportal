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
import { getLiveFeedbackMany, pairFeedbackTask } from "@/lib/portal-live";
import { buildPortalPage, deriveClientDomain, type PortalPageRow } from "@/lib/portal-page";
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
): Promise<Array<PortalPageRow & { primaryEmail: string }>> {
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
 * `focusListId` is given. Live ClickUp state comes from the per-list cache.
 */
export async function loadPortalPage(
  access: PortalAccessInfo,
  focusListId?: string
): Promise<PortalPageModel> {
  const rows = await selectDeliveries(access);
  const current = dropReplaced(rows);
  const [confirmations, live, preference] = await Promise.all([
    latestConfirmations(current.map((r) => r.id)),
    getLiveFeedbackMany(current.map((r) => r.projectListId ?? "")),
    prisma.clientPreference
      .findUnique({ where: { clientFolderId: access.clientFolderId }, select: { logoUrl: true } })
      .catch(() => null),
  ]);
  return buildPortalPage({
    token: access.token,
    clientName: access.clientName,
    clientLogoUrl: preference?.logoUrl ?? null,
    clientDomain: deriveClientDomain(rows),
    focusListId: focusListId ?? null,
    nowMs: Date.now(),
    rows,
    live,
    confirmations,
    names: MENTION_NAMES,
  });
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
