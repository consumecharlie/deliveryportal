/**
 * Slim view models for the portal's client components. Only these shapes
 * cross the server/client boundary, so raw email and Slack content, internal
 * fields, and ClickUp task ids never reach the browser. Pure, no I/O.
 */
import type { DeliverableGroup, TimelineEntry, TimelineLink } from "@/lib/portal-timeline";
import type { FeedbackStatus } from "@/lib/portal-status";

export interface PortalCardEntry {
  id: string;
  deliverableType: string;
  sentAt: Date;
  links: TimelineLink[];
  /** Client-safe body (markdown). */
  body: string;
}

export interface PortalCardGroup {
  family: string;
  latest: PortalCardEntry;
  history: PortalCardEntry[];
}

/** What a badge or confirm button needs; the confirm route recomputes the rest server-side. */
export type PortalCardStatus = Pick<
  FeedbackStatus,
  "kind" | "dueLabel" | "dueIsEstimate" | "state" | "confirmedAt" | "confirmedByName"
>;

function toCardEntry(e: TimelineEntry): PortalCardEntry {
  return {
    id: e.id,
    deliverableType: e.deliverableType,
    sentAt: e.sentAt,
    links: e.links.map((l) => ({ url: l.url, label: l.label, variableName: l.variableName })),
    body: e.body,
  };
}

export function toCardGroup(g: DeliverableGroup): PortalCardGroup {
  return { family: g.family, latest: toCardEntry(g.latest), history: g.history.map(toCardEntry) };
}

export function toCardStatus(s: FeedbackStatus | undefined): PortalCardStatus | undefined {
  if (!s) return undefined;
  return {
    kind: s.kind,
    dueLabel: s.dueLabel,
    dueIsEstimate: s.dueIsEstimate,
    state: s.state,
    confirmedAt: s.confirmedAt,
    confirmedByName: s.confirmedByName,
  };
}
