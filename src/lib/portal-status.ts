/**
 * Feedback status rules for one deliverable. Pure, no I/O.
 *
 * Inputs are the live feedback task (if any), the newest confirmation row
 * (if any), and the delivery's send date and snapshotted feedback window.
 */
import type { LiveFeedbackTask } from "@/lib/portal-live";
import {
  resolveDeadline,
  deadlineState,
  type DeadlineState,
  type DeadlineSource,
} from "@/lib/portal-deadline";
import { formatFeedbackDeadline } from "@/lib/feedback-deadline";

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
  /**
   * True when the deadline carries no time of day, so it is due end of day:
   * a ClickUp date-only due date (the 08:00 UTC sentinel), or a deadline we
   * computed from the feedback window rather than read from a task.
   */
  dueIsEndOfDay: boolean;
  state: DeadlineState;
  feedbackDeadlineTaskId: string | null;
  confirmedAt: Date | null;
  confirmedByName: string | null;
}

export interface ConfirmationRow {
  confirmedAt: Date;
  undoneAt: Date | null;
  confirmedByName: string | null;
}

/** The most recent row by confirmedAt (undone rows included, so an undo wins). */
export function newestConfirmation<T extends ConfirmationRow>(rows: T[]): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (!best || r.confirmedAt.getTime() > best.confirmedAt.getTime()) best = r;
  }
  return best;
}

/**
 * ClickUp decides whether the client owes us anything: only a Feedback
 * Deadline task in "waiting on client" asks them for something. A task that
 * has not started ("not ready") is ours to finish, and a delivery with no
 * paired task at all is simply delivered. Inferring a deadline from the send
 * date alone once produced firm countdowns for work nobody was waiting on.
 */
export function decideFeedbackStatus(input: {
  task: LiveFeedbackTask | null;
  confirmation: ConfirmationRow | null;
  sentAt: Date;
  feedbackWindows: string;
  nowMs: number;
}): FeedbackStatus {
  const { task, sentAt, nowMs } = input;
  const active = input.confirmation && !input.confirmation.undoneAt ? input.confirmation : null;
  const confirmed = Boolean(active) || Boolean(task && !task.isOpen);

  const { dueMs, source } = resolveDeadline({
    liveDueMs: task?.dueMs ?? null,
    sentAt,
    feedbackWindows: input.feedbackWindows,
  });
  const fmt = formatFeedbackDeadline(dueMs);

  let kind: FeedbackStatus["kind"];
  if (confirmed) kind = "confirmed";
  else if (task?.awaitingClient) kind = "awaiting";
  else kind = "none";

  return {
    kind,
    dueMs,
    source,
    // A date we worked out from the send date and the feedback window is our
    // suggestion, never a deadline anyone set, whichever window it used. It
    // only reaches the client when the awaiting task carries no due date.
    dueIsEstimate: source !== "clickup",
    dueIsEndOfDay: fmt.timeLabel === "",
    dueLabel: fmt.timeLabel ? `${fmt.formattedDate}, ${fmt.timeLabel}` : fmt.formattedDate,
    state: deadlineState(dueMs, nowMs),
    feedbackDeadlineTaskId: task?.taskId ?? null,
    confirmedAt: active?.confirmedAt ?? null,
    confirmedByName: active?.confirmedByName ?? null,
  };
}
