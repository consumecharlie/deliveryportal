/**
 * Client-side, fire-and-forget view beacon for the portal. Sent once per
 * delivery per page load the first time the client opens a review link or
 * the message body; the route ignores anything outside the token's folder.
 */
const sent = new Set<string>();

/** @internal exported for tests */
export function resetPortalViewBeacons(): void {
  sent.clear();
}

export function sendPortalView(token: string, deliveryId: string): void {
  const key = `${token}:${deliveryId}`;
  if (sent.has(key)) return;
  sent.add(key);

  const url = `/api/portal/${encodeURIComponent(token)}/view`;
  const body = JSON.stringify({ deliveryId });
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      if (navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))) return;
    }
    if (typeof fetch === "function") {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* fire and forget */
  }
}
