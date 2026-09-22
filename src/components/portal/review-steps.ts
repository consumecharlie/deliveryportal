/**
 * Which guided-review steps a client has ticked off. Purely a progress aid:
 * it lives in the browser, never on the server, and losing it costs nothing
 * but the ticks.
 */
const PREFIX = "portal:review";

export function stepsKey(token: string, deliveryId: string): string {
  return `${PREFIX}:${token}:${deliveryId}`;
}

export function readSteps(token: string, deliveryId: string): string[] {
  try {
    const raw = window.localStorage.getItem(stepsKey(token, deliveryId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function writeSteps(token: string, deliveryId: string, done: string[]): void {
  try {
    if (done.length === 0) window.localStorage.removeItem(stepsKey(token, deliveryId));
    else window.localStorage.setItem(stepsKey(token, deliveryId), JSON.stringify(done));
  } catch {
    /* storage unavailable: the ticks just do not persist */
  }
}

/** Every step ticked, so the flow can point at confirming. */
export function allDone(urls: string[], done: string[]): boolean {
  return urls.length > 0 && urls.every((u) => done.includes(u));
}
