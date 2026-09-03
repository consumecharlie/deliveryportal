/** Pure pieces of the portal reach-out form: validation and the Slack text. */
import { escapeMrkdwn } from "@/lib/portal-confirm-messages";

export const REACH_OUT_NAME_MAX = 80;
export const REACH_OUT_MESSAGE_MAX = 2000;
/** Notes per portal link per rolling hour. */
export const REACH_OUT_RATE_LIMIT = 5;
export const REACH_OUT_RATE_WINDOW_MS = 60 * 60_000;
export const REACH_OUT_RATE_MESSAGE = "Please wait a bit before sending another note";

export interface ReachOutInput {
  name: string;
  message: string;
  /** ClickUp list id of the project page the note was sent from, if any. */
  listId: string | null;
}

/** Trim and bound the form fields; returns an error message for the client on failure. */
export function validateReachOut(body: unknown): { ok: true; value: ReachOutInput } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const message = typeof b.message === "string" ? b.message.replace(/\r\n/g, "\n").trim() : "";
  const rawList = typeof b.listId === "string" ? b.listId.trim() : "";
  if (!name) return { ok: false, error: "Please add your name" };
  if (name.length > REACH_OUT_NAME_MAX) return { ok: false, error: `Name is too long (max ${REACH_OUT_NAME_MAX} characters)` };
  if (!message) return { ok: false, error: "Please write a message" };
  if (message.length > REACH_OUT_MESSAGE_MAX) {
    return { ok: false, error: `Message is too long (max ${REACH_OUT_MESSAGE_MAX} characters)` };
  }
  if (rawList && !/^[A-Za-z0-9_-]{1,64}$/.test(rawList)) return { ok: false, error: "Invalid project" };
  return { ok: true, value: { name, message, listId: rawList || null } };
}

export interface ReachOutText {
  clientName: string;
  name: string;
  message: string;
  portalUrl: string;
}

/** Internal Slack post for a client note. Every field is escaped; the message is quoted line by line. */
export function buildReachOutText(c: ReachOutText): string {
  const e = escapeMrkdwn;
  const quoted = e(c.message)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `:speech_balloon: Message from ${e(c.clientName)} via the client portal (${e(c.name)}):\n${quoted}\n<${c.portalUrl}|Open client portal>`;
}
