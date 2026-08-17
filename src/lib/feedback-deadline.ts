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

/**
 * Format a manually-entered feedback deadline (used for ad-hoc deliveries that
 * have no ClickUp Feedback Deadline task, or to override a detected one).
 *
 * Inputs are plain wall-clock values from `<input type="date">` / `type="time">`:
 *   dateStr "YYYY-MM-DD", timeStr "HH:MM" (24h) or "" for a date-only deadline.
 *
 * The date is anchored at UTC midnight and formatted in UTC so the calendar
 * date never shifts by timezone — the weekday/month/day reflect exactly what
 * the user picked, and the time (when given) is echoed back verbatim with an
 * "ET" label to match `formatFeedbackDeadline`'s output shape.
 */
export function formatManualDeadline(
  dateStr: string,
  timeStr: string
): FormattedDeadline {
  if (!dateStr) return { formattedDate: "", timeLabel: "" };
  const dateOnly = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(dateOnly.getTime())) return { formattedDate: "", timeLabel: "" };

  const formattedDate = dateOnly.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  if (!timeStr) return { formattedDate, timeLabel: "" };

  const withTime = new Date(`${dateStr}T${timeStr}:00Z`);
  if (Number.isNaN(withTime.getTime())) return { formattedDate, timeLabel: "" };
  const time = withTime.toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  });
  return { formattedDate, timeLabel: `${time} ET` };
}

/**
 * Convert a ClickUp due-date timestamp into the `{ date, time }` strings that
 * `<input type="date">` / `type="time">` expect, in Eastern time. Used to
 * prefill the manual deadline control from a detected deadline. Date-only
 * deadlines (the 08:00 UTC sentinel) return an empty time.
 */
export function deadlineMsToInputs(
  dueDateMs: number | string | null | undefined
): { date: string; time: string } {
  const ms = Number(dueDateMs);
  if (!dueDateMs || Number.isNaN(ms)) return { date: "", time: "" };
  const d = new Date(ms);

  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const pick = (t: string) => dateParts.find((p) => p.type === t)?.value ?? "";
  const date = `${pick("year")}-${pick("month")}-${pick("day")}`;

  if (isDateOnly(d)) return { date, time: "" };

  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const th = timeParts.find((p) => p.type === "hour")?.value ?? "00";
  const tm = timeParts.find((p) => p.type === "minute")?.value ?? "00";
  return { date, time: `${th}:${tm}` };
}
