import {
  createTask,
  updateTaskCustomField,
  getListTasks,
  extractCustomFieldValue,
} from "@/lib/clickup";
import {
  CUSTOM_FIELDS,
  PROJECT_TASK_TYPES,
  CONTACT_ROLES,
  TASK_TYPES,
} from "@/lib/custom-field-ids";

export interface NewContact {
  name: string;
  email?: string;
  userId?: string;
  role: keyof typeof CONTACT_ROLES; // "Primary" | "Standard" | "Log"
}

/** Create a Project Contact task in the project list. Returns its task id. */
export async function createProjectContact(
  listId: string,
  c: NewContact
): Promise<string> {
  const custom_fields: Array<{ id: string; value: unknown }> = [
    { id: CUSTOM_FIELDS.PROJECT_TASK_TYPE, value: PROJECT_TASK_TYPES.PROJECT_CONTACT },
    { id: CUSTOM_FIELDS.CONTACT_FIRST_NAME, value: c.name },
    { id: CUSTOM_FIELDS.CONTACT_ROLE, value: CONTACT_ROLES[c.role] },
  ];
  if (c.email) custom_fields.push({ id: CUSTOM_FIELDS.CONTACT_EMAIL, value: c.email });
  if (c.userId) custom_fields.push({ id: CUSTOM_FIELDS.SLACK_USER_ID, value: c.userId });
  const task = await createTask(listId, {
    name: "Project Contact",
    custom_item_id: TASK_TYPES.Person,
    status: "ongoing",
    custom_fields,
  });
  return task.id;
}

/** Fill missing email / Slack user ID on an existing contact task. */
export async function updateContactFields(
  taskId: string,
  fields: { email?: string; userId?: string }
): Promise<void> {
  if (fields.email) {
    await updateTaskCustomField(taskId, CUSTOM_FIELDS.CONTACT_EMAIL, fields.email);
  }
  if (fields.userId) {
    await updateTaskCustomField(taskId, CUSTOM_FIELDS.SLACK_USER_ID, fields.userId);
  }
}

/** Set the project's Slack delivery channel — updates the existing Slack Channel
 *  task, or creates one if none exists. */
export async function setSlackChannel(
  listId: string,
  channelId: string
): Promise<void> {
  const { tasks } = await getListTasks(listId, true);
  const existing = tasks.find((t) => {
    const resolved = extractCustomFieldValue(
      t.custom_fields,
      CUSTOM_FIELDS.PROJECT_TASK_TYPE
    );
    const raw = t.custom_fields.find(
      (f) => f.id === CUSTOM_FIELDS.PROJECT_TASK_TYPE
    )?.value;
    return resolved === "Slack Channel" || String(raw) === PROJECT_TASK_TYPES.SLACK_CHANNEL;
  });
  if (existing) {
    await updateTaskCustomField(
      existing.id,
      CUSTOM_FIELDS.SLACK_DELIVERY_CHANNEL_ID,
      channelId
    );
  } else {
    await createTask(listId, {
      name: "Slack Channel",
      custom_item_id: TASK_TYPES.Communication,
      status: "ongoing",
      custom_fields: [
        { id: CUSTOM_FIELDS.PROJECT_TASK_TYPE, value: PROJECT_TASK_TYPES.SLACK_CHANNEL },
        { id: CUSTOM_FIELDS.SLACK_DELIVERY_CHANNEL_ID, value: channelId },
      ],
    });
  }
}
