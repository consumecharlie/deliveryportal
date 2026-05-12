import type { DeliveryFormState, MergedContent } from "./types";

/**
 * Full snapshot of a send request captured at schedule time.
 * Mirrors the body shape consumed by POST /api/tasks/[taskId]/send so the
 * cron can forward it verbatim without re-reading ClickUp.
 */
export interface ScheduledSendPayload {
  formState: DeliveryFormState;
  mergedContent: MergedContent | null;
  primaryEmail: string;
  ccEmails: string;
  senderEmail: string;
  postToSlack: boolean;
  slackChannelId: string;
  originalDeliverableType: string;
  listId: string;
  taskMeta?: {
    clientName?: string;
    projectName?: string;
    department?: string;
    slackChannelName?: string;
  };
  addonListId?: string;
  addonDeliverableType?: string;
  addonDepartment?: string;
  addonReviewLinks?: Record<string, string>;
  addonProjectName?: string;
}

interface Check {
  label: string;
  validate: (p: ScheduledSendPayload) => boolean;
}

function hasSubject(p: ScheduledSendPayload): boolean {
  const subject = p.formState.editedSubjectLine ?? p.mergedContent?.subjectLine ?? "";
  return Boolean(subject.trim());
}

function hasBody(p: ScheduledSendPayload): boolean {
  if (p.postToSlack) {
    const slack = p.formState.editedSlackContent ?? p.mergedContent?.slackContent ?? "";
    return Boolean(slack.trim());
  }
  const email = p.formState.editedEmailContent ?? p.mergedContent?.emailContent ?? "";
  return Boolean(email.trim());
}

const CHECKS: Check[] = [
  {
    label: "Deliverable type",
    validate: (p) => Boolean(p.formState.deliverableType?.trim()),
  },
  {
    label: "Recipient email",
    validate: (p) => (p.postToSlack ? true : Boolean(p.primaryEmail?.trim())),
  },
  {
    label: "Sender",
    validate: (p) => (p.postToSlack ? true : Boolean(p.senderEmail?.trim())),
  },
  {
    label: "Slack channel",
    validate: (p) => (p.postToSlack ? Boolean(p.slackChannelId?.trim()) : true),
  },
  { label: "Subject line", validate: hasSubject },
  { label: "Message body", validate: hasBody },
];

export function isFormComplete(payload: ScheduledSendPayload): boolean {
  return CHECKS.every((c) => c.validate(payload));
}

export function missingFields(payload: ScheduledSendPayload): string[] {
  return CHECKS.filter((c) => !c.validate(payload)).map((c) => c.label);
}
