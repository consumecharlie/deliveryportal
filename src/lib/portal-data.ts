/**
 * Portal read path: turn a portal token into everything the client pages
 * need. Every query here is scoped by the token's clientFolderId, so a token
 * can never see another client's deliveries.
 */
import { prisma } from "@/lib/db";
import { isValidPortalToken } from "@/lib/portal-token";
import {
  buildTimeline,
  type Timeline,
  type TimelineEntry,
  type MentionNames,
} from "@/lib/portal-timeline";
import { getLiveFeedback, type LiveFeedbackMap } from "@/lib/portal-live";
import {
  resolveDeadline,
  deadlineState,
  type DeadlineState,
  type DeadlineSource,
} from "@/lib/portal-deadline";
import { formatFeedbackDeadline } from "@/lib/feedback-deadline";

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

export interface FeedbackStatus {
  /** "awaiting" = client owes feedback; "confirmed" = client pressed the button
   *  (or the live feedback task is complete); "none" = nothing to do (older version). */
  kind: "awaiting" | "confirmed" | "none";
  dueMs: number;
  /** "Tue, Sep 9" (+ ", 12:00 PM ET" when a real time is set). */
  dueLabel: string;
  source: DeadlineSource;
  /** True when the date is our default window, not a deadline anyone set. */
  dueIsEstimate: boolean;
  state: DeadlineState;
  feedbackDeadlineTaskId: string | null;
  confirmedAt: Date | null;
  confirmedByName: string | null;
}

export interface PortalEntry extends TimelineEntry {
  feedback: FeedbackStatus | null;
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

/** Without a live feedback task, stop asking for feedback this long after send. */
const STALE_AFTER_MS = 30 * 86_400_000;

/** Newest confirmation per delivery (undone ones included, so undo wins). */
async function latestConfirmations(deliveryIds: string[]) {
  if (deliveryIds.length === 0) return new Map<string, never>();
  const rows = await prisma.feedbackConfirmation.findMany({
    where: { deliveryId: { in: deliveryIds } },
    orderBy: { confirmedAt: "desc" },
  });
  const out = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!out.has(r.deliveryId)) out.set(r.deliveryId, r);
  return out;
}

export async function loadPortal(access: PortalAccessInfo, onlyListId?: string): Promise<PortalData> {
  const rows = await prisma.delivery.findMany({
    where: {
      clientFolderId: access.clientFolderId,
      ...(onlyListId ? { projectListId: onlyListId } : {}),
    },
    orderBy: { sentAt: "desc" },
    include: { links: true },
  });

  // Names for mention stripping: we do not store Slack ids and names on the
  // delivery, so v1 maps nothing and every mention renders as "you".
  const names: MentionNames = {};

  const timeline = buildTimeline(
    rows.map((r) => ({
      id: r.id,
      projectListId: r.projectListId ?? "",
      projectName: r.projectName,
      deliverableType: r.deliverableType,
      department: r.department,
      sentAt: r.sentAt,
      emailContent: r.emailContent,
      slackContent: r.slackContent,
      replacesDeliveryId: r.replacesDeliveryId,
      links: r.links.map((l) => ({ url: l.url, label: l.label, variableName: l.variableName })),
      feedbackWindows: r.feedbackWindows ?? "",
    })),
    names
  );

  const latestIds = timeline.projects.flatMap((p) => p.deliverables.map((g) => g.latest.id));
  const confirmations = await latestConfirmations(latestIds);
  const now = Date.now();
  const status: PortalData["status"] = {};
  const actionItems: PortalData["actionItems"] = [];

  for (const project of timeline.projects) {
    let live: LiveFeedbackMap = {};
    try {
      live = await getLiveFeedback(project.listId);
    } catch (err) {
      console.warn("live feedback failed", project.listId, err);
    }

    for (const group of project.deliverables) {
      const e = group.latest;
      const task = live[e.deliverableType] ?? null;
      const conf = confirmations.get(e.id);
      const activeConf = conf && !conf.undoneAt ? conf : null;
      const confirmed = Boolean(activeConf) || Boolean(task && !task.isOpen);
      const { dueMs, source } = resolveDeadline({
        liveDueMs: task?.dueMs ?? null,
        sentAt: e.sentAt,
        feedbackWindows: e.feedbackWindows,
      });
      const fmt = formatFeedbackDeadline(dueMs);
      const s: FeedbackStatus = {
        kind: confirmed ? "confirmed" : "awaiting",
        dueMs,
        source,
        dueIsEstimate: source === "default",
        dueLabel: fmt.timeLabel ? `${fmt.formattedDate}, ${fmt.timeLabel}` : fmt.formattedDate,
        state: deadlineState(dueMs, now),
        feedbackDeadlineTaskId: task?.taskId ?? null,
        confirmedAt: activeConf?.confirmedAt ?? null,
        confirmedByName: activeConf?.confirmedByName ?? null,
      };
      // Without a live feedback task, stop asking 30 days after send.
      if (!task && !confirmed && now - e.sentAt.getTime() > STALE_AFTER_MS) s.kind = "none";
      status[e.id] = s;
      if (s.kind === "awaiting") actionItems.push({ entry: e, projectName: project.name, status: s });
    }
  }
  actionItems.sort((a, b) => a.status.dueMs - b.status.dueMs);
  return { access, timeline, status, actionItems };
}
