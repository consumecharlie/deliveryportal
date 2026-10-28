// Business-hours window (America/New_York), DST-safe via Intl.
const START_HOUR = 8; // 8:00 AM ET
const END_HOUR = 19; // up to 7:59 PM ET

export function withinBusinessHours(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  // Intl can emit "24" for midnight under hour12:false — normalize.
  const hour = Number(hourStr) % 24;
  const isWeekday = !["Sat", "Sun"].includes(weekday ?? "");
  return isWeekday && hour >= START_HOUR && hour < END_HOUR;
}
