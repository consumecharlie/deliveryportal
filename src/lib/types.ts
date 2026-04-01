/**
 * Core TypeScript types for the Deliverable Portal
 */

// ClickUp API response types

export interface ClickUpCustomField {
  id: string;
  name: string;
  type: string;
  type_config?: {
    options?: Array<{
      id: string;
      name: string;
      label?: string;
      orderindex: number;
      color?: string;
    }>;
  };
  value?: string | number | boolean | null;
  value_richtext?: unknown;
}

export interface ClickUpTask {
  id: string;
  name: string;
  status: {
    status: string;
    color: string;
    type: string;
  };
  assignees: Array<{
    id: number;
    username: string;
    email: string;
    profilePicture?: string;
  }>;
  due_date: string | null;
  date_created: string;
  date_updated: string;
  list: {
    id: string;
    name: string;
  };
  folder: {
    id: string;
    name: string;
  };
  space: {
    id: string;
  };
  custom_fields: ClickUpCustomField[];
  parent?: string | null;
  url: string;
}

// Portal domain types

export interface DeliverableTask {
  id: string;
  name: string;
  status: string;
  statusColor: string;
  assignee?: {
    id: number;
    name: string;
    email: string;
    avatar?: string;
  };
  dueDate: string | null;
  clientName: string;
  projectName: string;
  deliverableType: string;
  department: string;
  listId: string;
  folderId: string;
  clickUpUrl: string;
}

export interface ProjectContact {
  taskId: string;
  name: string;
  email: string;
  role: string; // "Primary", "Standard", "Log"
  slackHandle?: string;
  slackUserId?: string;
}

export interface FeedbackDeadline {
  taskId: string;
  name: string;
  deliverableType: string;
  department: string;
  dueDate: string | null;
  formattedDate: string;
}

export interface DeliverySnippetTemplate {
  taskId: string;
  name: string;
  snippet: string; // Template body with [variable] placeholders
  snippetRichText?: unknown; // Quill Delta format
  subjectLine: string;
  deliverableType: string;
  department: string;
  senderEmail: string;
  senderName?: string;
  senderUserId?: number;
  senderProfilePicture?: string;
}

export interface TaskDetail {
  task: DeliverableTask;
  contacts: ProjectContact[];
  feedbackDeadline: FeedbackDeadline | null;
  slackChannelId: string | null;
  slackChannelName?: string;
  projectPlanLink: string | null;
  template: DeliverySnippetTemplate | null;
  reviewLinks: {
    googleDeliverableLink?: string;
    frameReviewLink?: string;
    animaticReviewLink?: string;
    loomReviewLink?: string;
    flexLink?: string;
  };
  revisionRounds: string;
  feedbackWindows: string;
  versionNotes: string;
}

export interface MergedContent {
  emailContent: string; // Markdown (with contact names)
  slackContent: string; // Markdown (with <@userId> mention tokens, converted to Slack mrkdwn at send time)
  subjectLine: string;
}

export interface DeliveryFormState {
  deliverableType: string;
  reviewLinks: Record<string, string>;
  extraLinks: Array<{ url: string; label: string }>;
  revisionRounds: string;
  feedbackWindows: string;
  versionNotes: string;
  slackChannelId: string;
  editedEmailContent: string | null; // null = use merged template
  editedSlackContent: string | null;
  editedSubjectLine: string | null;
  editedToEmail: string | null;
  editedCcEmails: string | null;
  editedSenderEmail: string | null;
  // Add-on project data (when combining projects)
  addonListId?: string;
  addonDeliverableType?: string;
  addonDepartment?: string;
  addonReviewLinks?: Record<string, string>;
  addonProjectName?: string;
}

export interface SendPayload {
  email_content: string;
  slack_content: string;
  slack_channel: string;
  primary_email: string;
  cc_emails: string;
  email_subject: string;
  sender_email: string;
  post_to_slack: boolean;
  communication_log: string;
  tasks_waiting_count: number;
  tasks_in_progress_count: number;
  tasks_upcoming_count: number;
  task_id: string;
  skip_email_draft?: boolean;
}

export interface SlackChannel {
  id: string;
  name: string;
  isMember: boolean;
  numMembers: number;
  isExtShared: boolean;
}

export interface SlackMember {
  id: string;
  name: string;
  realName: string;
  displayName: string;
  avatar?: string;
}
