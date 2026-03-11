/**
 * ClickUp API client for the Deliverable Portal.
 *
 * All requests go through server-side API routes to keep the
 * ClickUp API token secure (never sent to the browser).
 */

import type { ClickUpTask, ClickUpCustomField } from "./types";

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

function getToken(): string {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) throw new Error("CLICKUP_API_TOKEN is not set");
  return token;
}

async function clickupFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${CLICKUP_API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: getToken(),
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(
      `ClickUp API error ${res.status}: ${res.statusText} - ${errorBody}`
    );
  }

  return res.json() as Promise<T>;
}

// ── Task Operations ──

export async function getTask(taskId: string): Promise<ClickUpTask> {
  return clickupFetch<ClickUpTask>(
    `/task/${taskId}?custom_fields=true&include_subtasks=true`
  );
}

export async function getListTasks(
  listId: string,
  includeSubtasks = true
): Promise<{ tasks: ClickUpTask[] }> {
  const params = new URLSearchParams({
    include_closed: "false",
    subtasks: String(includeSubtasks),
  });
  return clickupFetch<{ tasks: ClickUpTask[] }>(
    `/list/${listId}/task?${params}`
  );
}

export async function updateTaskCustomField(
  taskId: string,
  fieldId: string,
  value: unknown,
  valueRichText?: unknown
): Promise<void> {
  const body: Record<string, unknown> = { value };
  if (valueRichText !== undefined) {
    body.value_richtext = valueRichText;
  }
  await clickupFetch(`/task/${taskId}/field/${fieldId}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateTaskStatus(
  taskId: string,
  status: string
): Promise<void> {
  await clickupFetch(`/task/${taskId}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export async function createTask(
  listId: string,
  data: {
    name: string;
    custom_fields?: Array<{ id: string; value: unknown }>;
  }
): Promise<ClickUpTask> {
  return clickupFetch<ClickUpTask>(`/list/${listId}/task`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Space / Folder / List Operations ──

interface SpaceFolder {
  id: string;
  name: string;
  lists: Array<{ id: string; name: string }>;
}

export async function getSpaceFolders(
  spaceId: string,
  archived = false
): Promise<{ folders: SpaceFolder[] }> {
  return clickupFetch<{ folders: SpaceFolder[] }>(
    `/space/${spaceId}/folder?archived=${archived}`
  );
}

export async function getFolderlessLists(
  spaceId: string,
  archived = false
): Promise<{ lists: Array<{ id: string; name: string }> }> {
  return clickupFetch<{ lists: Array<{ id: string; name: string }> }>(
    `/space/${spaceId}/list?archived=${archived}`
  );
}

export async function getFolderLists(
  folderId: string,
  archived = false
): Promise<{ lists: Array<{ id: string; name: string }> }> {
  return clickupFetch<{ lists: Array<{ id: string; name: string }> }>(
    `/folder/${folderId}/list?archived=${archived}`
  );
}

// ── Field / List Metadata ──

export async function getListFields(
  listId: string
): Promise<{ fields: ClickUpCustomField[] }> {
  return clickupFetch<{ fields: ClickUpCustomField[] }>(
    `/list/${listId}/field`
  );
}

// ── Custom Field Helpers ──

export function extractCustomFieldValue(
  fields: ClickUpCustomField[],
  fieldId: string
): string | null {
  const field = fields.find((f) => f.id === fieldId);
  if (!field || field.value === null || field.value === undefined) return null;

  // Handle dropdown fields - resolve option ID to label
  if (field.type === "drop_down" && field.type_config?.options) {
    const option = field.type_config.options.find(
      (o) => String(o.orderindex) === String(field.value) || o.id === String(field.value)
    );
    return option?.name ?? option?.label ?? String(field.value);
  }

  // Handle users type fields (extract email)
  if (field.type === "users" && Array.isArray(field.value)) {
    const users = field.value as Array<{ email?: string }>;
    return users[0]?.email ?? null;
  }

  // Handle rich text
  if (field.type === "text" && field.value_richtext) {
    // Return plain text value; rich text is available via value_richtext
    return String(field.value ?? "");
  }

  return String(field.value);
}

export function extractCustomFieldUrl(
  fields: ClickUpCustomField[],
  fieldId: string
): string | null {
  const field = fields.find((f) => f.id === fieldId);
  if (!field || !field.value) return null;
  return String(field.value);
}

/**
 * Resolve a dropdown custom field's option name to its orderindex/ID
 * (needed when writing back to ClickUp).
 */
export function resolveDropdownOptionId(
  fields: ClickUpCustomField[],
  fieldId: string,
  optionName: string
): string | null {
  const field = fields.find((f) => f.id === fieldId);
  if (!field?.type_config?.options) return null;
  const option = field.type_config.options.find(
    (o) => o.name === optionName || o.label === optionName
  );
  return option ? String(option.orderindex) : null;
}
