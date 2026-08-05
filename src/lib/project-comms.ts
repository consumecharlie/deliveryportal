import { extractCustomFieldValue, extractCustomFieldUrl } from "@/lib/clickup";
import { CUSTOM_FIELDS, PROJECT_TASK_TYPES } from "@/lib/custom-field-ids";
import type { ClickUpTask } from "@/lib/types";

export interface ResolvedContact {
  taskId: string;
  name: string;
  email: string;
  role: string;
  slackHandle?: string;
  slackUserId?: string;
}

export interface ResolvedProjectComms {
  contacts: ResolvedContact[];
  slackChannelId: string | null;
  projectPlanLink: string | null;
  deliverableTypes: string[];
}

function taskTypeMatches(task: ClickUpTask, optionId: string, name: string): boolean {
  const resolved = extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.PROJECT_TASK_TYPE);
  const raw = task.custom_fields.find((f) => f.id === CUSTOM_FIELDS.PROJECT_TASK_TYPE)?.value;
  return resolved === name || String(raw) === optionId;
}

/** Resolve a ClickUp project list's tasks into its communications config
 *  (contacts, Slack channel, project plan, deliverable types). Slack
 *  membership is added later by the scan. */
export function resolveProjectComms(tasks: ClickUpTask[]): ResolvedProjectComms {
  const contacts: ResolvedContact[] = [];
  let slackChannelId: string | null = null;
  let projectPlanLink: string | null = null;
  const deliverableTypes = new Set<string>();

  for (const task of tasks) {
    if (taskTypeMatches(task, PROJECT_TASK_TYPES.PROJECT_CONTACT, "Project Contact")) {
      contacts.push({
        taskId: task.id,
        name: extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.CONTACT_FIRST_NAME) ?? task.name,
        email: extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.CONTACT_EMAIL) ?? "",
        role: extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.CONTACT_ROLE) ?? "Standard",
        slackHandle: extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.SLACK_HANDLE) ?? undefined,
        slackUserId: extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.SLACK_USER_ID) ?? undefined,
      });
    }
    if (taskTypeMatches(task, PROJECT_TASK_TYPES.SLACK_CHANNEL, "Slack Channel")) {
      slackChannelId =
        extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.SLACK_DELIVERY_CHANNEL_ID) ?? slackChannelId;
    }
    if (taskTypeMatches(task, PROJECT_TASK_TYPES.PROJECT_PLAN, "Project Plan")) {
      projectPlanLink =
        extractCustomFieldUrl(task.custom_fields, CUSTOM_FIELDS.PROJECT_PLAN_LINK) ?? projectPlanLink;
    }
    if (taskTypeMatches(task, PROJECT_TASK_TYPES.DELIVERY_DEADLINE, "Delivery Deadline")) {
      const dt = extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.DELIVERABLE_TYPE);
      if (dt) deliverableTypes.add(dt);
    }
  }

  return { contacts, slackChannelId, projectPlanLink, deliverableTypes: [...deliverableTypes] };
}
