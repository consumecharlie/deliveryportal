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

/**
 * Fetch every task in a ClickUp list, transparently paging.
 *
 * ClickUp's `/list/{listId}/task` returns at most ~100 tasks per call and
 * uses a 0-indexed `page` query param. Without paging, any list with more
 * than ~100 tasks (subtasks count too) silently drops the rest — which made
 * mature project lists (and every share task past page 0) invisible to the
 * portal. We loop until a page comes back below `PAGE_SIZE`, which signals
 * the last page (the API exposes no total/last-page flag).
 */
export async function getListTasks(
  listId: string,
  includeSubtasks = true
): Promise<{ tasks: ClickUpTask[] }> {
  // ClickUp's list-task endpoint returns up to ~100 tasks per page.
  const PAGE_SIZE = 100;
  // Safety cap — 5,000 tasks per list is well beyond anything we expect.
  const MAX_PAGES = 50;

  const all: ClickUpTask[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      include_closed: "false",
      subtasks: String(includeSubtasks),
      page: String(page),
    });
    const res = await clickupFetch<{ tasks: ClickUpTask[] }>(
      `/list/${listId}/task?${params}`
    );
    const batch = res.tasks ?? [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return { tasks: all };
}

/**
 * Fetch tasks across a whole space via ClickUp's Filtered Team Tasks endpoint,
 * narrowed server-side by a dropdown custom field. This replaces fanning out
 * one /list/{id}/task call per list (and deep-paginating large, irrelevant
 * lists like Billable Hours): ClickUp does the filtering, so we page through
 * only the matching tasks. Returns full task objects (custom_fields, list,
 * folder, status, assignees, url — everything the dashboard needs).
 */
export async function getSpaceTasksByDropdownField(
  spaceId: string,
  fieldId: string,
  optionId: string,
  includeSubtasks = true
): Promise<{ tasks: ClickUpTask[] }> {
  const PAGE_SIZE = 100;
  const MAX_PAGES = 50;
  // team_id == workspace_id in ClickUp.
  const teamId = process.env.CLICKUP_WORKSPACE_ID ?? "9010023164";
  const customFields = JSON.stringify([
    { field_id: fieldId, operator: "=", value: optionId },
  ]);

  const all: ClickUpTask[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      include_closed: "false",
      subtasks: String(includeSubtasks),
      page: String(page),
      custom_fields: customFields,
    });
    // space_ids is an array param — URLSearchParams handles the encoding.
    params.append("space_ids[]", spaceId);
    const res = await clickupFetch<{ tasks: ClickUpTask[] }>(
      `/team/${teamId}/task?${params}`
    );
    const batch = res.tasks ?? [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return { tasks: all };
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

export async function updateTaskName(
  taskId: string,
  name: string
): Promise<void> {
  await clickupFetch(`/task/${taskId}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
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

export async function getList(listId: string) {
  return clickupFetch<{ id: string; name: string; folder: { id: string; name: string } }>(
    `/list/${listId}`
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
 * Extract a dropdown custom field's available options, in ClickUp's display
 * order, as {value,label} pairs keyed by the option name. The form stores the
 * option name as its value (see resolveDropdownOptionId for write-back), so
 * surfacing these straight from the task's field definition keeps the portal's
 * dropdowns in sync with ClickUp — adding an option in ClickUp needs no code
 * change. Returns [] when the field is absent or has no options.
 */
export function extractDropdownOptions(
  fields: ClickUpCustomField[],
  fieldId: string
): Array<{ value: string; label: string }> {
  const field = fields.find((f) => f.id === fieldId);
  if (!field?.type_config?.options) return [];
  return [...field.type_config.options]
    .sort((a, b) => (a.orderindex ?? 0) - (b.orderindex ?? 0))
    .map((o) => {
      const name = o.name ?? o.label ?? "";
      return { value: name, label: name };
    })
    .filter((o) => o.value !== "");
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
