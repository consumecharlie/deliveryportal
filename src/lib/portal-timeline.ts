/**
 * Pure shaping of Delivery rows into the client portal's tree.
 * No I/O. Deadline/confirmation state is layered on later (portal-data.ts).
 */
import { extractFamilyName } from "@/lib/template-families";

export interface TimelineLink { url: string; label: string; variableName: string | null }

export interface TimelineDelivery {
  id: string;
  projectListId: string;
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
    .replace(/<@([A-Z0-9]+)>/g, (_, id) => names[id] ?? "you");
}

export function buildTimeline(rows: TimelineDelivery[], names: MentionNames): Timeline {
  // 1. Resends replace originals.
  const replaced = new Set(rows.map((r) => r.replacesDeliveryId).filter(Boolean) as string[]);
  const live = rows.filter((r) => !replaced.has(r.id));

  // 2. Client-safe body.
  const entries: TimelineEntry[] = live.map((r) => ({
    ...r,
    body: stripMentions(r.emailContent || r.slackContent || "", names),
  }));

  // 3. Group by project, then by deliverable family.
  const byProject = new Map<string, TimelineEntry[]>();
  for (const e of entries) {
    const arr = byProject.get(e.projectListId) ?? [];
    arr.push(e);
    byProject.set(e.projectListId, arr);
  }

  const projects: TimelineProject[] = [];
  for (const [listId, list] of byProject) {
    const byFamily = new Map<string, TimelineEntry[]>();
    for (const e of list) {
      const fam = extractFamilyName(e.deliverableType);
      const arr = byFamily.get(fam) ?? [];
      arr.push(e);
      byFamily.set(fam, arr);
    }
    const deliverables: DeliverableGroup[] = [];
    for (const [family, versions] of byFamily) {
      versions.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
      deliverables.push({ family, latest: versions[0], history: versions.slice(1) });
    }
    deliverables.sort((a, b) => b.latest.sentAt.getTime() - a.latest.sentAt.getTime());
    projects.push({
      listId,
      name: list[0].projectName,
      lastActivity: deliverables[0].latest.sentAt,
      deliverables,
    });
  }
  projects.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  return { projects };
}
