/**
 * Client Portal page model: the contract between the data layer
 * (`portal-data.ts`) and the portal UI. Everything here is serializable and
 * client-safe (no raw email/Slack bodies, no ClickUp task ids beyond what the
 * UI needs for keys, no internal jargon in strings).
 *
 * Dates are epoch milliseconds so server and client components agree.
 */

export type MilestoneState =
  | "delivered" // share task complete and we have a delivery (or the task closed)
  | "in-review" // delivered and its feedback deadline task is still open
  | "up-next" // the soonest undelivered milestone
  | "planned"; // later undelivered milestones

export interface PortalMilestone {
  /** ClickUp share task id (stable key). */
  id: string;
  /** Client-facing label, e.g. "Edit V1", "Final Delivery". */
  label: string;
  /** Deliverable name from the parent task when it adds information, e.g. "Ep #21". */
  sublabel: string | null;
  /** Planned or actual date. */
  dateMs: number | null;
  state: MilestoneState;
  /** Delivery row that fulfilled this milestone, when delivered. */
  deliveryId: string | null;
}

export type ReviewState =
  | "awaiting" // client owes feedback
  | "due-today"
  | "overdue"
  | "confirmed"
  | "none"; // nothing to do (older version, or stale)

/** What a link opens, inferred from its host/path. Drives the icon and the host hint. */
export type LinkKind =
  | "google-doc"
  | "google-sheet"
  | "google-slides"
  | "google-drive"
  | "frame"
  | "loom"
  | "vimeo"
  | "youtube"
  | "box"
  | "dropbox"
  | "audio"
  | "video"
  | "pdf"
  | "web";

export interface PortalLink {
  url: string;
  /**
   * Button label. The anchor text this link had in the message we sent
   * ("Final Post Script", "Audio File Final"), with the project name prefix
   * stripped; falls back to the host hint when the message did not name it.
   */
  label: string;
  /** Short host hint shown under or beside the label, e.g. "Google Doc", "Frame.io", "Audio file". */
  hint: string;
  kind: LinkKind;
}

export interface PortalVersion {
  deliveryId: string;
  /** e.g. "Edit V2" (deliverable type of that send). */
  label: string;
  /** 1-based position in the deliverable's version list, oldest = 1. */
  versionNumber: number;
  sentAtMs: number;
  links: PortalLink[];
  /** Sanitized markdown body (render with renderPortalBody). */
  body: string;
}

export interface PortalDeliverable {
  /** Stable key: parent task id, or a family key when no parent is known. */
  key: string;
  /** Primary title, e.g. "LOC19: Intuit" or, without a parent, the type family. */
  title: string;
  /** Secondary line, e.g. "Video Edit01" or "Edit V2". Null when the title says it all. */
  variant: string | null;
  latest: PortalVersion;
  /** Earlier versions, newest first. */
  history: PortalVersion[];
  review: {
    state: ReviewState;
    /**
     * What the client is being asked for, from the paired ClickUp task name:
     * "approval" when it reads "Confirm ... Approval" (finals), else "feedback".
     * Falls back to "approval" when the deliverable type contains "Final".
     */
    mode: "feedback" | "approval";
    /** "Due Tue, Sep 8", "Suggested by Fri, Sep 11", "Confirmed Jul 12" */
    label: string;
    dueMs: number | null;
    dueIsEstimate: boolean;
    confirmedAtMs: number | null;
    canUndo: boolean;
  };
}

export type ProjectPhase = "in-progress" | "completed";

export interface PortalProject {
  listId: string;
  name: string;
  phase: ProjectPhase;
  /** "In post-production, wraps up Sep 28" style summary built by the data layer. */
  summary: string;
  wrapsUpMs: number | null;
  lastActivityMs: number;
  milestones: PortalMilestone[];
  deliverables: PortalDeliverable[];
}

export interface PortalAttentionItem {
  /**
   * The delivery behind this item, when we sent one through the portal. Null
   * for an item that exists only as an open ClickUp Feedback Deadline task
   * (the matching share task was completed outside the portal), which still
   * needs the client's answer and can still be confirmed.
   */
  deliveryId: string | null;
  /** The ClickUp Feedback Deadline task; the confirm key when deliveryId is null. */
  feedbackTaskId: string | null;
  deliverableTitle: string;
  variant: string | null;
  projectName: string;
  projectListId: string;
  review: PortalDeliverable["review"];
  primaryLink: PortalLink | null;
}

export interface PortalPageModel {
  token: string;
  clientName: string;
  /** Client logo for the header (ClientPreference.logoUrl), when one is set. */
  clientLogoUrl: string | null;
  /** Email domain of the newest delivery's primary recipient (not consume-media.com), lowercase. */
  clientDomain: string | null;
  counts: { inProgress: number; completed: number };
  /** The line under the client name ("2 projects in progress, 1 completed"); "" when nothing to count. */
  countsLabel?: string;
  attention: PortalAttentionItem[];
  projects: PortalProject[];
  /** When the page is a single-project view, the project shown; else null. */
  focusListId: string | null;
}
