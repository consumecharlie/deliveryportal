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
