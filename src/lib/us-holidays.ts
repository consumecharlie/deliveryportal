/**
 * Office-closure calendar for business-day math.
 *
 * Holidays are COMPUTED from their rules, never stored as a list, so the
 * calendar can never go stale and nobody has to top it up each year.
 *
 * Every date here is an Eastern calendar date as a plain "YYYY-MM-DD" string.
 * We deliberately never carry a time-of-day: the feedback window is expressed
 * in whole days, so all comparisons are date-only.
 */

// Consume Media's office-closure days, which are NOT the full federal list:
// New Year's Day, Memorial Day, Independence Day, Labor Day, Thanksgiving, the
// day after Thanksgiving, and Christmas Day. Each is derived in
// `officeHolidays()` below rather than stored.

const DAY_MS = 86_400_000;

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/** "YYYY-MM-DD" for a UTC-anchored calendar date. */
export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse "YYYY-MM-DD" into a UTC-midnight Date. */
export function parseDateString(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return utc(y, m - 1, d);
}

function shiftDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** 0 = Sunday .. 6 = Saturday */
function dayOfWeek(d: Date): number {
  return d.getUTCDay();
}

/** The nth (1-based) occurrence of `weekday` in a month. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = utc(year, month, 1);
  const offset = (weekday - dayOfWeek(first) + 7) % 7;
  return utc(year, month, 1 + offset + (n - 1) * 7);
}

/** The last occurrence of `weekday` in a month. */
function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = new Date(Date.UTC(year, month + 1, 0)); // day 0 of next month
  const offset = (dayOfWeek(last) - weekday + 7) % 7;
  return utc(year, month, last.getUTCDate() - offset);
}

/**
 * Federal observance shift for fixed-date holidays: Saturday is observed the
 * Friday before, Sunday the Monday after.
 */
function observed(d: Date): Date {
  if (dayOfWeek(d) === 6) return shiftDays(d, -1);
  if (dayOfWeek(d) === 0) return shiftDays(d, 1);
  return d;
}

/**
 * Office-closure dates that fall inside `year`, as "YYYY-MM-DD", sorted.
 *
 * New Year's Day needs care at both edges: when Jan 1 lands on a Saturday it is
 * observed on Dec 31 of the PREVIOUS year. So this year's Jan 1 may belong to
 * last year's list, and next year's may belong to this one. Only dates that
 * actually fall inside `year` are kept — use `holidaySet()` for lookups so a
 * closure sitting across a boundary is never missed.
 */
export function officeHolidays(year: number): string[] {
  const thanksgiving = nthWeekday(year, 10, 4, 4); // 4th Thursday of November
  const days: Date[] = [
    lastWeekday(year, 4, 1), // Memorial Day, last Monday of May
    observed(utc(year, 6, 4)), // Independence Day
    nthWeekday(year, 8, 1, 1), // Labor Day, first Monday of September
    thanksgiving,
    shiftDays(thanksgiving, 1), // day after Thanksgiving
    observed(utc(year, 11, 25)), // Christmas Day
  ];
  for (const y of [year, year + 1]) {
    const newYear = observed(utc(y, 0, 1));
    if (newYear.getUTCFullYear() === year) days.push(newYear);
  }
  return days.map(toDateString).sort();
}

/**
 * Closure lookup spanning the years around those given, plus any one-off
 * company closures. The surrounding years are included so a closure just across
 * a year boundary is never missed regardless of where the anchor date falls.
 */
export function holidaySet(years: number[], extraClosures: string[] = []): Set<string> {
  const span = new Set<string>();
  for (const year of years) {
    for (const offset of [-1, 0, 1]) {
      for (const h of officeHolidays(year + offset)) span.add(h);
    }
  }
  for (const extra of extraClosures) span.add(extra);
  return span;
}

/** A weekday that is not a closure. */
export function isBusinessDay(date: string, closures: Set<string>): boolean {
  const d = parseDateString(date);
  const dow = dayOfWeek(d);
  if (dow === 0 || dow === 6) return false;
  return !closures.has(date);
}

/** The given date, or the next business day if it is a weekend or closure. */
export function rollForwardToBusinessDay(date: string, closures: Set<string>): string {
  let d = parseDateString(date);
  // Bounded so a bad closure list can never spin forever.
  for (let i = 0; i < 3650 && !isBusinessDay(toDateString(d), closures); i++) {
    d = shiftDays(d, 1);
  }
  return toDateString(d);
}

/**
 * Advance `days` business days from `date`.
 *
 * The start is first rolled forward to a business day, so a window counted from
 * a Saturday delivery starts counting on the Monday. `days: 0` therefore means
 * "the delivery day itself, or the next working day".
 */
export function addBusinessDays(date: string, days: number, closures: Set<string>): string {
  let current = rollForwardToBusinessDay(date, closures);
  for (let i = 0; i < days; i++) {
    let next = shiftDays(parseDateString(current), 1);
    while (!isBusinessDay(toDateString(next), closures)) next = shiftDays(next, 1);
    current = toDateString(next);
  }
  return current;
}

/**
 * How many business days separate `from` and `to`, i.e. the smallest n where
 * addBusinessDays(from, n) === to. Returns null when `to` is before `from` or
 * is not itself a business day, since no window could have produced it.
 */
export function businessDaysBetween(
  from: string,
  to: string,
  closures: Set<string>
): number | null {
  if (to < from) return null;
  for (let n = 0; n <= 60; n++) {
    if (addBusinessDays(from, n, closures) === to) return n;
  }
  return null;
}

/** Plain calendar-day difference (to - from), used to describe the gap. */
export function calendarDaysBetween(from: string, to: string): number {
  return Math.round((parseDateString(to).getTime() - parseDateString(from).getTime()) / DAY_MS);
}
