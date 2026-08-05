export interface AuditContact {
  name: string;
  email: string;
  role: string; // "Primary" | "Standard" | "Log"
  slackHandle?: string;
  slackUserId?: string;
}

export interface ProjectCommsConfig {
  listId: string;
  clientName: string;
  projectName: string;
  contacts: AuditContact[];
  slackChannelId: string | null;
  slackChannelName: string | null;
  /** true/false when a Slack channel is set and membership was checked; null otherwise. */
  botInChannel: boolean | null;
  projectPlanLink: string | null;
  hasTemplateForDeliverable: boolean;
}

export type AuditSeverity = "blocker" | "warning";

export type AuditIssueType =
  | "no_contacts"
  | "no_primary_contact"
  | "multiple_primary_contacts"
  | "contact_missing_email"
  | "no_slack_channel"
  | "bot_not_in_channel"
  | "contact_missing_slack_user_id"
  | "no_project_plan"
  | "no_template";

export interface AuditIssue {
  type: AuditIssueType;
  severity: AuditSeverity;
  message: string;
  /** Contact name(s) the issue is about, when per-contact. */
  detail?: string;
}

const NON_LOG = (c: AuditContact) => c.role !== "Log";

export function isSlackClient(contacts: AuditContact[]): boolean {
  // A Slack handle OR a Slack user ID marks a Slack client — the user ID is
  // what actually drives the @mention (and is how the send flow decides mode),
  // so a contact with an ID but no handle still counts.
  return contacts.some(
    (c) => NON_LOG(c) && (!!c.slackHandle?.trim() || !!c.slackUserId?.trim())
  );
}

export function auditProject(cfg: ProjectCommsConfig): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const contacts = cfg.contacts.filter(NON_LOG);
  const slackClient = isSlackClient(cfg.contacts);

  // Both modes
  if (contacts.length === 0) {
    issues.push({ type: "no_contacts", severity: "blocker", message: "No project contacts configured." });
  } else {
    const primaries = contacts.filter((c) => c.role === "Primary");
    if (primaries.length === 0) {
      issues.push({ type: "no_primary_contact", severity: "blocker", message: "No Primary contact set." });
    } else if (primaries.length > 1) {
      issues.push({
        type: "multiple_primary_contacts",
        severity: "warning",
        message: `${primaries.length} Primary contacts; all will be addressed.`,
        detail: primaries.map((c) => c.name).join(", "),
      });
    }
  }
  if (!cfg.projectPlanLink) {
    issues.push({ type: "no_project_plan", severity: "warning", message: "No project plan link." });
  }
  if (!cfg.hasTemplateForDeliverable) {
    issues.push({ type: "no_template", severity: "warning", message: "No delivery template for this deliverable type." });
  }

  if (slackClient) {
    if (!cfg.slackChannelId) {
      issues.push({ type: "no_slack_channel", severity: "blocker", message: "Slack client, but no Slack delivery channel is set." });
    } else if (cfg.botInChannel === false) {
      issues.push({
        type: "bot_not_in_channel",
        severity: "blocker",
        message: `The n8n bot is not in #${cfg.slackChannelName ?? cfg.slackChannelId}.`,
      });
    }
    for (const c of contacts) {
      if (c.slackHandle?.trim() && !c.slackUserId?.trim()) {
        issues.push({
          type: "contact_missing_slack_user_id",
          severity: "blocker",
          message: `${c.name} has a Slack handle but no Slack user ID.`,
          detail: c.name,
        });
      }
    }
  } else {
    for (const c of contacts) {
      if (!c.email?.trim()) {
        issues.push({ type: "contact_missing_email", severity: "blocker", message: `${c.name} has no email address.`, detail: c.name });
      }
    }
  }

  return issues;
}
