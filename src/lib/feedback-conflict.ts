/**
 * Detects when a delivery's Feedback Windows value and its Feedback Deadline
 * date are logically inconsistent, before the message reaches the client.
 *
 * These two values have no relationship in ClickUp: the window is a dropdown on
 * the Delivery Deadline task, while the deadline is the due date of a separate
 * sibling task someone scheduled by hand. Nothing has ever compared them, so a
 * message can promise "48 Hours" while granting 24.
 *
 * The window is counted in BUSINESS days from the Delivery Deadline task's due
 * date (not the send moment), so a late send does not by itself create a
 * conflict. See docs/plans/2026-09-02-feedback-conflict-design.md.
 */

import { deadlineMsToInputs, formatManualDeadline } from "./feedback-deadline";
import {
  addBusinessDays,
  businessDaysBetween,
  calendarDaysBetween,
  holidaySet,
  parseDateString,
} from "./us-holidays";

export type FeedbackConflictStatus = "ok" | "conflict" | "unknown";

export interface FeedbackConflictInput {
  /** Feedback Windows label as it will appear in the message, e.g. "48 Hours". */
  feedbackWindows: string;
  /** Delivery Deadline task's due date (ms). Absent for ad-hoc deliveries. */
  anchorMs?: number | string | null;
  /** Eastern calendar date ("YYYY-MM-DD") of the deadline the message will show. */
  deadlineDate: string;
  /** Send moment, used as the anchor only when the task has no due date. */
  nowMs?: number;
  /** One-off company closures ("YYYY-MM-DD") on top of the computed holidays. */
  extraClosures?: string[];
}

export interface FeedbackConflictResult {
  status: FeedbackConflictStatus;
  /** Business days the window promises, or null when the label is unrecognized. */
  windowDays: number | null;
  /** Eastern date the window was counted from. */
  anchorDate: string | null;
  /** True when we fell back to the send moment because the task had no due date. */
  anchorFallback: boolean;
  /** Eastern date the window implies. */
  expectedDate: string | null;
  /** Eastern date actually set. */
  actualDate: string | null;
  /** actualDate - expectedDate in calendar days. Negative = client shortchanged. */
  deltaDays: number | null;
  /** Business days actually granted, when the gap maps cleanly onto a window. */
  actualWindowDays: number | null;
}

/**
 * Business days a Feedback Windows label promises.
 *
 * Options come live from ClickUp, so this parses rather than enumerates. An
 * unrecognized label returns null and the check goes silent: a false "unknown"
 * is harmless, a false conflict trains people to ignore the warning.
 */
export function windowBusinessDays(label: string): number | null {
  const s = label.trim().toLowerCase();
  if (!s) return null;
  // "Flexible" has no promised window at all; it is already special-cased in
  // the merge (applyFlexibleFeedback) to drop the hard EOD phrasing.
  if (s === "flexible") return null;
  if (s === "same day" || s === "same-day") return 0;

  const hours = s.match(/^(\d+)\s*(?:hours?|hrs?)$/);
  if (hours) {
    const n = Number(hours[1]);
    // Only whole days are representable. "12 Hours" stays unknown rather than
    // being rounded into a promise nobody made.
    return n % 24 === 0 ? n / 24 : null;
  }

  const days = s.match(/^(\d+)\s*(?:business\s*)?days?$/);
  if (days) return Number(days[1]);

  return null;
}

/**
 * The window label matching a given number of business days, chosen from the
 * options ClickUp actually offers. Returns null when no option fits, because we
 * cannot create dropdown options via the API (ClickUp denies it).
 */
export function windowLabelForDays(
  days: number | null,
  options: Array<{ value: string; label: string }> | undefined
): string | null {
  if (days === null) return null;
  for (const option of options ?? []) {
    if (windowBusinessDays(option.value) === days) return option.value;
  }
  return null;
}

function etDate(ms: number | string): string {
  return deadlineMsToInputs(ms).date;
}

export function evaluateFeedbackConflict(
  input: FeedbackConflictInput
): FeedbackConflictResult {
  const { feedbackWindows, anchorMs, deadlineDate, nowMs, extraClosures } = input;

  const windowDays = windowBusinessDays(feedbackWindows);
  const anchorFallback = !anchorMs;
  const anchorSource = anchorMs || nowMs;
  const anchorDate = anchorSource ? etDate(anchorSource) : null;
  const actualDate = deadlineDate || null;

  const base: FeedbackConflictResult = {
    status: "unknown",
    windowDays,
    anchorDate,
    anchorFallback,
    expectedDate: null,
    actualDate,
    deltaDays: null,
    actualWindowDays: null,
  };

  if (windowDays === null || !anchorDate || !actualDate) return base;

  const years = [anchorDate, actualDate].map((d) => parseDateString(d).getUTCFullYear());
  const closures = holidaySet(years, extraClosures);

  const expectedDate = addBusinessDays(anchorDate, windowDays, closures);
  const actualWindowDays = businessDaysBetween(anchorDate, actualDate, closures);

  return {
    ...base,
    status: expectedDate === actualDate ? "ok" : "conflict",
    expectedDate,
    actualWindowDays,
    deltaDays: calendarDaysBetween(expectedDate, actualDate),
  };
}

export interface FeedbackConflictCopy {
  headline: string;
  detail: string;
  consequence: string;
}

function describeDays(n: number): string {
  if (n === 0) return "the same day";
  return n === 1 ? "1 business day" : `${n} business days`;
}

/**
 * Human wording for a conflict, derived once here so the inline warning and the
 * send-time confirm can never drift apart.
 */
export function describeFeedbackConflict(
  result: FeedbackConflictResult,
  windowLabel: string
): FeedbackConflictCopy | null {
  if (result.status !== "conflict") return null;
  const { anchorDate, expectedDate, actualDate, deltaDays, actualWindowDays } = result;
  if (!anchorDate || !expectedDate || !actualDate) return null;

  const fmt = (d: string) => formatManualDeadline(d, "").formattedDate;

  const headline = `${windowLabel} does not match the ${fmt(actualDate)} deadline.`;

  const detail = result.anchorFallback
    ? `Counting from today (${fmt(anchorDate)}), a ${windowLabel} window ends ${fmt(expectedDate)}.`
    : `Delivery was due ${fmt(anchorDate)}, so a ${windowLabel} window ends ${fmt(expectedDate)}.`;

  const consequence =
    (deltaDays ?? 0) < 0
      ? actualWindowDays !== null
        ? `The client is being told ${windowLabel} but given ${describeDays(actualWindowDays)}.`
        : "The client is being given less time than the message promises."
      : "The client is being given more time than the message promises.";

  return { headline, detail, consequence };
}
