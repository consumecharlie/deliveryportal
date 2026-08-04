// Formats a ClickUp feedback-deadline due date for delivery snippets.
//
// ClickUp's v2 API (for our workspace/token) returns only the raw `due_date`
// timestamp — never the `due_date_time` boolean — so we can't ask it whether a
// time was actually set. Empirically, date-only due dates in this workspace are
// stored at exactly 08:00:00 UTC (the "date-only sentinel"); anything else is a
// real, intentionally-chosen time. We use that to decide whether to surface the
// time. All display is in Eastern time (the office timezone).

const TIME_ZONE = "America/New_York";

// ClickUp stores a date-only due date at this fixed UTC time-of-day.
const DATE_ONLY_UTC_HOUR = 8;

function isDateOnly(d: Date): boolean {
  return (
    d.getUTCHours() === DATE_ONLY_UTC_HOUR &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0
  );
}

export interface FormattedDeadline {
  /** e.g. "Tue, Aug 4" (always Eastern). */
  formattedDate: string;
  /** e.g. "12:00 PM ET" when a real time is set; "" for date-only. */
  timeLabel: string;
}

export function formatFeedbackDeadline(
  dueDateMs: number | string | null | undefined
): FormattedDeadline {
  const ms = Number(dueDateMs);
  if (!dueDateMs || Number.isNaN(ms)) {
    return { formattedDate: "", timeLabel: "" };
  }

  const date = new Date(ms);
  const formattedDate = date.toLocaleDateString("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  if (isDateOnly(date)) {
    return { formattedDate, timeLabel: "" };
  }

  const time = date.toLocaleTimeString("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  return { formattedDate, timeLabel: `${time} ET` };
}
