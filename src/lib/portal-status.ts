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

/** Without a live feedback task, stop asking for feedback this long after send. */
export const STALE_AFTER_MS = 30 * 86_400_000;

/** The most recent row by confirmedAt (undone rows included, so an undo wins). */
export function newestConfirmation<T extends ConfirmationRow>(rows: T[]): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (!best || r.confirmedAt.getTime() > best.confirmedAt.getTime()) best = r;
  }
  return best;
}

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

  let kind: FeedbackStatus["kind"] = confirmed ? "confirmed" : "awaiting";
  // Without a live feedback task, stop asking 30 days after send.
  if (!task && !confirmed && nowMs - sentAt.getTime() > STALE_AFTER_MS) kind = "none";

  return {
    kind,
    dueMs,
    source,
    dueIsEstimate: source === "default",
    dueIsEndOfDay: fmt.timeLabel === "",
    dueLabel: fmt.timeLabel ? `${fmt.formattedDate}, ${fmt.timeLabel}` : fmt.formattedDate,
    state: deadlineState(dueMs, nowMs),
    feedbackDeadlineTaskId: task?.taskId ?? null,
    confirmedAt: active?.confirmedAt ?? null,
    confirmedByName: active?.confirmedByName ?? null,
  };
}
