/** Pure message builders for the portal confirm / undo side effects. */

export interface ConfirmContext {
  clientName: string;
  projectName: string;
  deliverableType: string;
  confirmedByName: string | null;
  portalUrl: string;
  deadlineLabel: string;
}

/**
 * Slack mrkdwn treats &, < and > as control characters (links, mentions,
 * `<!channel>`), so every client-supplied value must be escaped before it is
 * interpolated into a message.
 */
export function escapeMrkdwn(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function slackConfirmText(c: ConfirmContext): string {
  const e = escapeMrkdwn;
  const who = c.confirmedByName ? ` (${e(c.confirmedByName)})` : "";
  return `:white_check_mark: *${e(c.clientName)}* confirmed all feedback is in on *${e(c.deliverableType)}* for *${e(c.projectName)}*${who}. Deadline was ${e(c.deadlineLabel)}. <${c.portalUrl}|Open client portal>`;
}

export function slackUndoText(c: ConfirmContext): string {
  const e = escapeMrkdwn;
  return `:leftwards_arrow_with_hook: *${e(c.clientName)}* reopened feedback on *${e(c.deliverableType)}* for *${e(c.projectName)}*. The feedback window is extended. <${c.portalUrl}|Open client portal>`;
}

export function clickupConfirmComment(c: ConfirmContext): string {
  const who = c.confirmedByName ? ` by ${c.confirmedByName}` : "";
  return `Client confirmed all feedback is in via the client portal${who}. Marking this feedback deadline complete.`;
}

export function clickupUndoComment(): string {
  return "Client reopened feedback via the client portal. Reopening this feedback deadline.";
}
