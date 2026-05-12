const SLACK_API = "https://slack.com/api";

interface SlackResp {
  ok: boolean;
  error?: string;
}

interface LookupResp extends SlackResp {
  user?: { id: string };
}

interface ConversationsOpenResp extends SlackResp {
  channel?: { id: string };
}

async function slackCall<T extends SlackResp>(
  method: string,
  body: Record<string, unknown>
): Promise<T> {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN is not set");
  }
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T;
  if (!json.ok) {
    throw new Error(`Slack ${method} failed: ${json.error ?? "unknown"}`);
  }
  return json;
}

/**
 * DM a Consume Media user by email. Returns true on success.
 * On any failure (missing scopes, user not found, token issue) logs a warning
 * and returns false rather than throwing — callers (the cron) must remain robust.
 */
export async function sendSlackDM(
  senderEmail: string,
  text: string
): Promise<boolean> {
  if (!senderEmail) {
    console.warn("sendSlackDM called with empty senderEmail; skipping");
    return false;
  }
  try {
    const lookup = await slackCall<LookupResp>("users.lookupByEmail", {
      email: senderEmail,
    });
    const userId = lookup.user?.id;
    if (!userId) return false;
    const conv = await slackCall<ConversationsOpenResp>("conversations.open", {
      users: userId,
    });
    const channel = conv.channel?.id;
    if (!channel) return false;
    await slackCall("chat.postMessage", { channel, text });
    return true;
  } catch (err) {
    console.warn("sendSlackDM failed for", senderEmail, ":", err);
    return false;
  }
}
