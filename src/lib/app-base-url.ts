/**
 * Base URL for links the app hands out (portal links, Slack buttons).
 * `NEXT_PUBLIC_APP_URL` wins when set and non-empty; otherwise the origin of
 * the incoming request. Server side pass the request; client side omit it and
 * the browser origin is used.
 *
 * Future call sites: src/app/api/portal/[token]/confirm and undo routes, and
 * the scheduled-sends cron, each compute this inline today.
 */
export function getAppBaseUrl(req?: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (req) return new URL(req.url).origin;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}
