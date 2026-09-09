/** Client-facing date labels for the portal, always in Eastern time. */
const TZ = "America/New_York";

function easternYear(ms: number): number {
  return Number(new Date(ms).toLocaleDateString("en-US", { timeZone: TZ, year: "numeric" }));
}

/** "Sep 15", or "Sep 15, 2025" when the date is not in the current year. */
export function shortDate(ms: number, nowMs: number = Date.now()): string {
  const withYear = easternYear(ms) !== easternYear(nowMs);
  return new Date(ms).toLocaleDateString("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

/** "SEP 9": the pixel-caps date for the Up next window. */
export function pixelDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" }).toUpperCase();
}

/** Eastern calendar day, for grouping milestones that share a date. */
export function easternDayKey(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ });
}

/** "Tue 4:12 PM", Eastern, for the menu bar clock. */
export function menuClock(ms: number = Date.now()): string {
  return new Date(ms).toLocaleString("en-US", {
    timeZone: TZ,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Cut a label to `max` characters with a single ellipsis; never splits a surrogate pair. */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, Math.max(1, max - 1)).join("").trimEnd() + "…";
}

/**
 * The tag a version wears in the version control: "FINAL" when its label
 * contains the whole word "Final" (any case), else "V<n>". Numbering never
 * skips: a final after V2 still leaves V1, V2, FINAL.
 */
export function versionTag(label: string, versionNumber: number): string {
  return /\bfinal\b/i.test(label) ? "FINAL" : `V${versionNumber}`;
}
