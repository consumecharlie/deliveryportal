/**
 * Feedback deadline for a portal card. Pure, no I/O.
 *
 * The live ClickUp due date wins when a Feedback Deadline task exists.
 * Otherwise the deadline is computed from the send date plus the feedback
 * window in business days (Eastern), so a card is never blank.
 */
import { windowBusinessDays } from "@/lib/feedback-conflict";
import { addBusinessDays, holidaySet } from "@/lib/us-holidays";

const TZ = "America/New_York";
const DEFAULT_WINDOW_DAYS = 2;

/** "YYYY-MM-DD" of an instant in Eastern time. */
export function easternDateString(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** ClickUp's date-only sentinel: 08:00 UTC on that calendar date. */
export function dateOnlySentinelMs(date: string): number {
  return Date.parse(`${date}T08:00:00Z`);
}

export interface ResolvedDeadline { dueMs: number; source: "clickup" | "computed" }

export function resolveDeadline(input: {
  liveDueMs: number | null;
  sentAt: Date;
  feedbackWindows: string;
}): ResolvedDeadline {
  if (input.liveDueMs) return { dueMs: input.liveDueMs, source: "clickup" };
  const days = windowBusinessDays(input.feedbackWindows) ?? DEFAULT_WINDOW_DAYS;
  const start = easternDateString(input.sentAt.getTime());
  const year = Number(start.slice(0, 4));
  const due = addBusinessDays(start, days, holidaySet([year]));
  return { dueMs: dateOnlySentinelMs(due), source: "computed" };
}

export type DeadlineState = "open" | "due-today" | "overdue";

export function deadlineState(dueMs: number, nowMs: number): DeadlineState {
  const dueDay = easternDateString(dueMs);
  const today = easternDateString(nowMs);
  if (today < dueDay) return "open";
  if (today === dueDay) return "due-today";
  return "overdue";
}
