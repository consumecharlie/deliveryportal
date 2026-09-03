/**
 * Base URL for links the app hands out (portal links, Slack buttons, reminder
 * emails). Resolution order:
 *
 * 1. `NEXT_PUBLIC_APP_URL`, then `NEXTAUTH_URL`, then `VERCEL_URL` (a bare
 *    host is given an https scheme). A stable alias domain beats the
 *    per-deployment URL a Vercel cron request lands on, which is gated by
 *    Deployment Protection.
 * 2. The incoming request: `x-forwarded-proto` + `host` when present, else
 *    the request URL's origin. Server side pass the request.
 * 3. The browser origin. Client side omit the request.
 *
 * Call sites: src/app/api/portal/[token]/{confirm,undo,message} routes, the
 * portal-reminders cron, src/app/api/deliveries/[id] and the Settings
 * client portal section. The scheduled-sends cron keeps its own copy.
 */
const ENV_KEYS = ["NEXT_PUBLIC_APP_URL", "NEXTAUTH_URL", "VERCEL_URL"] as const;

function normalize(url: string): string {
  const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return withScheme.replace(/\/+$/, "");
}

export function getAppBaseUrl(req?: Request): string {
  for (const key of ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return normalize(value);
  }
  if (req) {
    const proto = req.headers.get("x-forwarded-proto");
    const host = req.headers.get("host");
    if (proto && host) return `${proto}://${host}`;
    return new URL(req.url).origin;
  }
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}
