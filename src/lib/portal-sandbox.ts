/**
 * Portal sandbox: until launch, nothing the portal does may reach a client
 * or look like a real notification to the team. With PORTAL_SANDBOX=1:
 * - Slack posts and DMs are redirected to ONE DM to the sandbox owner, with
 *   the intended destination spelled out;
 * - ClickUp comments carry the sandbox prefix (status changes still happen,
 *   they are what is being tested);
 * - reminder emails are never sent.
 * Removing PORTAL_SANDBOX is the launch switch.
 */
import { sendSlackDM } from "@/lib/slack-dm";

export const DEFAULT_SANDBOX_SLACK_EMAIL = "michael@consume-media.com";

export function isPortalSandbox(): boolean {
  return process.env.PORTAL_SANDBOX === "1";
}

export function sandboxPrefix(): string {
  return "[Portal sandbox test] ";
}

export function sandboxSlackEmail(): string {
  return process.env.PORTAL_SANDBOX_SLACK_EMAIL?.trim() || DEFAULT_SANDBOX_SLACK_EMAIL;
}

/** Where a Slack message would have gone, as a human-readable destination. */
export type SandboxDestination =
  | { kind: "channel"; channelId: string; channelName: string | null; threadTs?: string | null }
  | { kind: "dm"; email: string }
  | { kind: "none" };

export function describeDestination(dest: SandboxDestination): string {
  switch (dest.kind) {
    case "channel": {
      const name = dest.channelName ? `#${dest.channelName.replace(/^#/, "")}` : `channel ${dest.channelId}`;
      return dest.threadTs ? `${name} (in thread)` : name;
    }
    case "dm":
      return `a DM to ${dest.email}`;
    case "none":
      return "nowhere (no channel or sender resolved)";
  }
}

/** Pure: the single DM body the sandbox owner receives instead of the real post. */
export function sandboxSlackText(dest: SandboxDestination, original: string): string {
  return `${sandboxPrefix()}Would have posted to ${describeDestination(dest)}.\n\n${original}`;
}

/** Pure: a ClickUp comment with the sandbox marker in front. */
export function sandboxComment(text: string): string {
  return isPortalSandbox() ? `${sandboxPrefix()}${text}` : text;
}

/**
 * Deliver a Slack message the sandbox way: one DM to the sandbox owner that
 * names the intended destination. Returns whether that DM went out.
 */
export async function sandboxSlackDeliver(dest: SandboxDestination, original: string): Promise<boolean> {
  const to = sandboxSlackEmail();
  const ok = await sendSlackDM(to, sandboxSlackText(dest, original));
  console.info(
    "[portal-sandbox]",
    JSON.stringify({ redirectedTo: to, intended: describeDestination(dest), ok })
  );
  return ok;
}
