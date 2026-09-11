/**
 * Deadline arithmetic for the review window, in Eastern time, where the
 * client's day actually ends. Pure and separately testable: the component
 * only turns these into markup.
 */
const TZ = "America/New_York";

/** The zone's offset from UTC at an instant, in ms, positive when ahead. */
function zoneOffset(ms: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const hour = get("hour") % 24;
  // Zone offsets have no sub-second part, so carry the instant's own
  // milliseconds through: without them the offset is out by up to a second
  // and an end-of-day lands in the next day.
  const millis = new Date(ms).getUTCMilliseconds();
  return Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"), millis) - ms;
}

export interface EasternDate {
  year: number;
  month: number;
  day: number;
}

export function easternDate(ms: number): EasternDate {
  const shifted = new Date(ms + zoneOffset(ms));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** 23:59:59.999 Eastern on the day the instant falls in, resolved across DST. */
export function endOfEasternDay(ms: number): number {
  const { year, month, day } = easternDate(ms);
  const wall = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
  const once = wall - zoneOffset(wall);
  return wall - zoneOffset(once);
}

/** Whole Eastern calendar days from `from` to `to`. */
export function easternDayDiff(from: number, to: number): number {
  const a = easternDate(from);
  const b = easternDate(to);
  const ua = Date.UTC(a.year, a.month - 1, a.day);
  const ub = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((ub - ua) / 86_400_000);
}

/**
 * A date-only deadline reaches us as the 08:00 UTC sentinel we write for an
 * Eastern date, which means end of day rather than eight in the morning.
 * Used until the model carries `dueIsEndOfDay` itself.
 */
export function looksEndOfDay(dueMs: number): boolean {
  const d = new Date(dueMs);
  return d.getUTCHours() === 8 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
}

export interface DueInput {
  dueMs: number;
  /** The deadline is the end of that day rather than a set time. */
  endOfDay: boolean;
  /** We inferred the date rather than reading it off a task. */
  isEstimate: boolean;
  nowMs: number;
}

export type DueUrgency = "estimate" | "past" | "soon" | "calm";

/** The instant the client is actually working against. */
export function dueDeadline(dueMs: number, endOfDay: boolean): number {
  return endOfDay ? endOfEasternDay(dueMs) : dueMs;
}

export function dueUrgency({ dueMs, endOfDay, isEstimate, nowMs }: DueInput): DueUrgency {
  if (isEstimate) return "estimate";
  if (nowMs > dueDeadline(dueMs, endOfDay)) return "past";
  return easternDayDiff(nowMs, dueMs) <= 1 ? "soon" : "calm";
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * The live line under the ask: days out at a distance, hours on the day
 * itself, and how late once the deadline has passed. An estimated date never
 * counts down, because there is nothing firm to count to.
 */
export function countdownText({ dueMs, endOfDay, isEstimate, nowMs }: DueInput): string {
  const days = easternDayDiff(nowMs, dueMs);
  if (isEstimate) return days < 0 ? "Suggested date has passed" : "Suggested date";
  const deadline = dueDeadline(dueMs, endOfDay);
  if (nowMs > deadline) {
    // Late is floored: "3 hours late" means at least three.
    if (days <= -1) return `${plural(-days, "day")} late`;
    const over = nowMs - deadline;
    if (over >= 3_600_000) return `${plural(Math.floor(over / 3_600_000), "hour")} late`;
    return `${plural(Math.max(1, Math.floor(over / 60_000)), "minute")} late`;
  }
  if (days <= 0) {
    // Remaining is rounded, so five in the afternoon reads "7 hours left"
    // rather than six, but anything under an hour counts in minutes.
    const left = deadline - nowMs;
    if (left >= 3_600_000) return `${plural(Math.round(left / 3_600_000), "hour")} left`;
    return `${plural(Math.max(1, Math.round(left / 60_000)), "minute")} left`;
  }
  if (days === 1) return "Due tomorrow";
  return `${plural(days, "day")} left`;
}

/** "EOD" for a whole day, else the set time in Eastern. */
export function dueTimeLabel(dueMs: number, endOfDay: boolean): string {
  if (endOfDay) return "EOD";
  return new Date(dueMs).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
}

export function dueMonthLabel(dueMs: number): string {
  return new Date(dueMs).toLocaleDateString("en-US", { timeZone: TZ, month: "short" }).toUpperCase();
}

export function dueDayLabel(dueMs: number): string {
  return new Date(dueMs).toLocaleDateString("en-US", { timeZone: TZ, day: "numeric" });
}

/** The whole deadline as one sentence, for screen readers. */
export function dueSentence(ask: string, input: DueInput): string {
  const date = new Date(input.dueMs).toLocaleDateString("en-US", {
    timeZone: TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const when = input.endOfDay ? "by end of day" : `at ${dueTimeLabel(input.dueMs, false)}`;
  const lead = input.isEstimate ? "suggested for" : "due";
  return `${ask}, ${lead} ${date} ${when}. ${countdownText(input)}.`;
}
