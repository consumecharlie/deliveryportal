/** Pure message builders for the portal confirm / undo side effects. */

export interface ConfirmContext {
  clientName: string;
  projectName: string;
  deliverableType: string;
  confirmedByName: string | null;
  portalUrl: string;
  deadlineLabel: string;
}

export function slackConfirmText(c: ConfirmContext): string {
  const who = c.confirmedByName ? ` (${c.confirmedByName})` : "";
  return `:white_check_mark: *${c.clientName}* confirmed all feedback is in on *${c.deliverableType}* for *${c.projectName}*${who}. Deadline was ${c.deadlineLabel}. <${c.portalUrl}|Open client portal>`;
}

export function slackUndoText(c: ConfirmContext): string {
  return `:leftwards_arrow_with_hook: *${c.clientName}* reopened feedback on *${c.deliverableType}* for *${c.projectName}*. The feedback window is extended. <${c.portalUrl}|Open client portal>`;
}

export function clickupConfirmComment(c: ConfirmContext): string {
  const who = c.confirmedByName ? ` by ${c.confirmedByName}` : "";
  return `Client confirmed all feedback is in via the client portal${who}. Marking this feedback deadline complete.`;
}

export function clickupUndoComment(): string {
  return "Client reopened feedback via the client portal. Reopening this feedback deadline.";
}
