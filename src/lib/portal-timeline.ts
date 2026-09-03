/**
 * Pure shaping of Delivery rows into the client portal's tree.
 * No I/O. Deadline/confirmation state is layered on later (portal-data.ts).
 */
import { extractFamilyName } from "@/lib/template-families";

export interface TimelineLink { url: string; label: string; variableName: string | null }

export interface TimelineDelivery {
  id: string;
  /** Null for ad-hoc deliveries that were never tied to a ClickUp list. */
  projectListId: string | null;
  projectName: string;
  deliverableType: string;
  department: string;
  sentAt: Date;
  emailContent: string;
  slackContent: string | null;
  replacesDeliveryId: string | null;
  links: TimelineLink[];
  /** Feedback Windows value snapshotted at send time ("" if unknown). */
  feedbackWindows: string;
}

export interface TimelineEntry extends TimelineDelivery {
  /** Client-safe body (markdown) with mention tokens replaced by names. */
  body: string;
}

export interface DeliverableGroup {
  family: string;
  latest: TimelineEntry;
  history: TimelineEntry[]; // newest first, excludes latest
}

export interface TimelineProject {
  /** ClickUp list id, or "" when the deliveries had none. */
  listId: string;
  name: string;
  lastActivity: Date;
  deliverables: DeliverableGroup[]; // most recent first
}

export interface Timeline { projects: TimelineProject[] }

/** Slack user id -> display name. */
export type MentionNames = Record<string, string>;

export function stripMentions(md: string, names: MentionNames): string {
  return md
    .replace(/@\[[^\]]*\]\(([^)]+)\)/g, (_, id) => names[id] ?? "you")
    .replace(/<@([A-Z0-9]+)(?:\|[^>]*)?>/g, (_, id) => names[id] ?? "you");
}

export function buildTimeline(rows: TimelineDelivery[], names: MentionNames): Timeline {
  // 1. Resends replace originals.
  const replaced = new Set(rows.map((r) => r.replacesDeliveryId).filter(Boolean) as string[]);
  const live = rows.filter((r) => !replaced.has(r.id));

  // 2. Client-safe body. The send route stores the merged email body even for
  // Slack sends, so slackContent is only a fallback.
  const entries: TimelineEntry[] = live.map((r) => ({
    ...r,
    body: stripMentions(r.emailContent || r.slackContent || "", names),
  }));

  // 3. Group by project, then by deliverable family. Deliveries without a
  // list id group by project name so ad-hoc sends do not all pile into one.
  const byProject = new Map<string, TimelineEntry[]>();
  for (const e of entries) {
    const key = e.projectListId || "name:" + e.projectName;
    const arr = byProject.get(key) ?? [];
    arr.push(e);
    byProject.set(key, arr);
  }

  const projects: TimelineProject[] = [];
  for (const list of byProject.values()) {
    const byFamily = new Map<string, TimelineEntry[]>();
    for (const e of list) {
      const fam = extractFamilyName(e.deliverableType);
      const arr = byFamily.get(fam) ?? [];
      arr.push(e);
      byFamily.set(fam, arr);
    }
    const deliverables: DeliverableGroup[] = [];
    for (const [family, versions] of byFamily) {
      versions.sort(
        (a, b) => b.sentAt.getTime() - a.sentAt.getTime() || a.id.localeCompare(b.id)
      );
      deliverables.push({ family, latest: versions[0], history: versions.slice(1) });
    }
    deliverables.sort(
      (a, b) =>
        b.latest.sentAt.getTime() - a.latest.sentAt.getTime() ||
        a.latest.id.localeCompare(b.latest.id)
    );
    // The most recent delivery carries the current project name.
    const newest = deliverables[0].latest;
    projects.push({
      listId: newest.projectListId ?? "",
      name: newest.projectName,
      lastActivity: newest.sentAt,
      deliverables,
    });
  }
  projects.sort(
    (a, b) =>
      b.lastActivity.getTime() - a.lastActivity.getTime() ||
      a.listId.localeCompare(b.listId) ||
      a.name.localeCompare(b.name)
  );
  return { projects };
}
