/**
 * Interprets what the n8n "Email and Slack" workflow reports back on send.
 *
 * Why this exists: on 2026-09-09 two of Tony's client deliveries were logged as
 * Sent and marked complete in ClickUp while no Gmail draft was ever created. His
 * Gmail OAuth credential had expired, but the workflow's draft nodes were set to
 * `onError: continueRegularOutput`, so n8n swallowed the error, reported the
 * execution as a success and returned 200. Nothing downstream could tell.
 *
 * The portal now records what actually came back, so a delivery that produced no
 * draft can be seen instead of silently trusted.
 */

export type N8nSendStatus =
  /** A Gmail draft was created in the sender's mailbox. */
  | "drafted"
  /** The Slack message was posted. */
  | "slack_posted"
  /** n8n acknowledged the webhook before running (responseMode "onReceived"),
   *  so the outcome is genuinely unknown rather than bad. */
  | "pending"
  /** n8n ran but the node reported an error. */
  | "failed"
  /** Nothing recognizable came back. */
  | "unknown";

export interface N8nSendResult {
  status: N8nSendStatus;
  /** Error text or a short note, when there is one. */
  detail?: string;
}

/** n8n's immediate acknowledgement when the webhook responds on receipt. */
const STARTED_ACK = "workflow was started";

function firstItem(body: unknown): Record<string, unknown> | null {
  if (Array.isArray(body)) return firstItem(body[0]);
  if (body && typeof body === "object") return body as Record<string, unknown>;
  return null;
}

export function interpretN8nResponse(
  body: unknown,
  postToSlack: boolean
): N8nSendResult {
  const item = firstItem(body);
  if (!item) return { status: "unknown" };

  // A swallowed node error surfaces as a plain { error } item.
  if (typeof item.error === "string" && item.error.trim()) {
    return { status: "failed", detail: item.error };
  }

  // Webhook still set to respond immediately: we cannot know the outcome yet.
  // This is NOT a failure and must not be reported as one.
  if (
    typeof item.message === "string" &&
    item.message.toLowerCase().includes(STARTED_ACK)
  ) {
    return { status: "pending" };
  }

  if (postToSlack) {
    if (item.ok === true || typeof item.ts === "string") {
      return { status: "slack_posted" };
    }
    return { status: "unknown" };
  }

  // Gmail draft response: { id, message: { id, threadId, labelIds: ["DRAFT"] } }
  const message = item.message;
  if (message && typeof message === "object") {
    const m = message as Record<string, unknown>;
    const labels = Array.isArray(m.labelIds) ? m.labelIds : [];
    if (labels.includes("DRAFT") || typeof m.id === "string") {
      return { status: "drafted" };
    }
  }

  return { status: "unknown" };
}

/**
 * True when the recorded status means a client message definitely never
 * materialized. Stored values carry their detail ("failed: The credential ...")
 * so this matches on the prefix. "error" is the legacy value the Sent table
 * already looked for.
 */
export function isFailedSend(status: string | null | undefined): boolean {
  if (!status) return false;
  return status === "error" || status.startsWith("failed");
}
