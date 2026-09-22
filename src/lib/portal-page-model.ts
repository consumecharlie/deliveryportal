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
  /**
   * Position in a guided review, 0 first. The order the links appear in the
   * message we sent, because whoever wrote it put the walkthrough before the
   * animatic before the review link on purpose; when the message named none of
   * them, a kind ladder: watch, then look, then read, then notes.
   */
  order: number;
  /**
   * What the message asks the client to do with this link, as plain text:
   * "Please consolidate feedback from all internal stakeholders and submit
   * directly in Edit V1." Null when the link was not mentioned in prose.
   */
  instruction: string | null;
}

export interface PortalVersion {
  deliveryId: string;
  /** The deliverable type of that send, e.g. "Edit V2", "AV Script V1 + Loom". */
  label: string;
  /**
   * Where this send sits in the deliverable's timeline: "V1", "V2", "MASTER"
   * (Potential Master, the last cut before the handoff) or "FINAL". Empty for
   * a deliverable whose type carries no version at all.
   */
  tag: string;
  /** 1-based position in the deliverable's version list, oldest = 1. */
  versionNumber: number;
  sentAtMs: number;
  links: PortalLink[];
  /** Sanitized markdown body (render with renderPortalBody). */
  body: string;
}

export interface PortalDeliverable {
  /** Stable key: parent task id and family, or a family key when no parent is known. */
  key: string;
  /**
   * The thing being revised, never a version of it: "LOC19: Intuit" from the
   * parent task, else the type's family ("Edit", "Post Script").
   */
  title: string;
  /**
   * Second line naming which one, when the title does not already say it:
   * "Video", "Snippets", "(3) 15s Spinoff (4:5)". Null when it would only
   * restate the title or the version.
   */
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
    /**
     * True when the deadline has no time of day, so it is due end of day (the
     * label says "by EOD Tue, Sep 15"). False when ClickUp carried a real time,
     * which the label shows instead.
     */
    dueIsEndOfDay: boolean;
    /**
     * When the review window started, for a "6 of 10 days" progress bar: the
     * latest version's send date, or for an item with no delivery the date we
     * completed its share task. Null when there is no deadline, and null rather
     * than a backwards window when the data disagrees, so a bar can rely on
     * `windowStartMs < dueMs` whenever both are set.
     */
    windowStartMs: number | null;
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
