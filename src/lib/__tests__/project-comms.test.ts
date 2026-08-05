import { describe, it, expect } from "vitest";
import { resolveProjectComms } from "@/lib/project-comms";
import { CUSTOM_FIELDS, PROJECT_TASK_TYPES } from "@/lib/custom-field-ids";
import type { ClickUpTask, ClickUpCustomField } from "@/lib/types";

/**
 * Build a minimal ClickUpTask fixture. Custom fields are plain
 * `{ id, value }` (no `type`), so `extractCustomFieldValue` returns
 * `String(value)`. The PROJECT_TASK_TYPE field's value is set to the
 * matching PROJECT_TASK_TYPES.* UUID so `taskTypeMatches` matches on the
 * raw value (String(raw) === optionId).
 */
function makeTask(
  id: string,
  name: string,
  fields: Array<{ id: string; value: unknown }>
): ClickUpTask {
  return {
    id,
    name,
    status: { status: "open", color: "#000", type: "open" },
    assignees: [],
    due_date: null,
    date_created: "0",
    date_updated: "0",
    list: { id: "L1", name: "List" },
    folder: { id: "F1", name: "Folder" },
    space: { id: "S1" },
    custom_fields: fields as ClickUpCustomField[],
    url: "https://app.clickup.com/t/" + id,
  };
}

function contactTask(
  id: string,
  overrides: {
    firstName?: string;
    email?: string;
    role?: string;
    slackHandle?: string;
    slackUserId?: string;
  } = {},
  name = "Contact Task"
): ClickUpTask {
  const fields: Array<{ id: string; value: unknown }> = [
    { id: CUSTOM_FIELDS.PROJECT_TASK_TYPE, value: PROJECT_TASK_TYPES.PROJECT_CONTACT },
  ];
  if (overrides.firstName !== undefined)
    fields.push({ id: CUSTOM_FIELDS.CONTACT_FIRST_NAME, value: overrides.firstName });
  if (overrides.email !== undefined)
    fields.push({ id: CUSTOM_FIELDS.CONTACT_EMAIL, value: overrides.email });
  if (overrides.role !== undefined)
    fields.push({ id: CUSTOM_FIELDS.CONTACT_ROLE, value: overrides.role });
  if (overrides.slackHandle !== undefined)
    fields.push({ id: CUSTOM_FIELDS.SLACK_HANDLE, value: overrides.slackHandle });
  if (overrides.slackUserId !== undefined)
    fields.push({ id: CUSTOM_FIELDS.SLACK_USER_ID, value: overrides.slackUserId });
  return makeTask(id, name, fields);
}

function slackChannelTask(id: string, channelId: string): ClickUpTask {
  return makeTask(id, "Slack Channel Task", [
    { id: CUSTOM_FIELDS.PROJECT_TASK_TYPE, value: PROJECT_TASK_TYPES.SLACK_CHANNEL },
    { id: CUSTOM_FIELDS.SLACK_DELIVERY_CHANNEL_ID, value: channelId },
  ]);
}

function projectPlanTask(id: string, link: string): ClickUpTask {
  return makeTask(id, "Project Plan Task", [
    { id: CUSTOM_FIELDS.PROJECT_TASK_TYPE, value: PROJECT_TASK_TYPES.PROJECT_PLAN },
    { id: CUSTOM_FIELDS.PROJECT_PLAN_LINK, value: link },
  ]);
}

function deliveryDeadlineTask(id: string, deliverableType: string): ClickUpTask {
  return makeTask(id, "Delivery Deadline Task", [
    { id: CUSTOM_FIELDS.PROJECT_TASK_TYPE, value: PROJECT_TASK_TYPES.DELIVERY_DEADLINE },
    { id: CUSTOM_FIELDS.DELIVERABLE_TYPE, value: deliverableType },
  ]);
}

describe("resolveProjectComms", () => {
  it("resolves a Slack project: contact with slack fields + slack channel", () => {
    const tasks = [
      contactTask("c1", {
        firstName: "Emily",
        email: "emily@client.com",
        role: "Primary",
        slackHandle: "@emily",
        slackUserId: "U05AC4CFK62",
      }),
      slackChannelTask("s1", "C0123456789"),
    ];

    const result = resolveProjectComms(tasks);

    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]).toEqual({
      taskId: "c1",
      name: "Emily",
      email: "emily@client.com",
      role: "Primary",
      slackHandle: "@emily",
      slackUserId: "U05AC4CFK62",
    });
    expect(result.slackChannelId).toBe("C0123456789");
    expect(result.projectPlanLink).toBeNull();
    expect(result.deliverableTypes).toEqual([]);
  });

  it("resolves an email-only project: contact with no slack fields, slackChannelId null", () => {
    const tasks = [
      contactTask("c1", { firstName: "Bob", email: "bob@client.com", role: "Standard" }),
    ];

    const result = resolveProjectComms(tasks);

    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]).toEqual({
      taskId: "c1",
      name: "Bob",
      email: "bob@client.com",
      role: "Standard",
      slackHandle: undefined,
      slackUserId: undefined,
    });
    expect(result.slackChannelId).toBeNull();
  });

  it("falls back to task name / defaults when contact fields are absent", () => {
    const tasks = [contactTask("c1", {}, "Fallback Person")];

    const result = resolveProjectComms(tasks);

    expect(result.contacts[0].name).toBe("Fallback Person");
    expect(result.contacts[0].email).toBe("");
    expect(result.contacts[0].role).toBe("Standard");
  });

  it("resolves the project plan link", () => {
    const tasks = [projectPlanTask("p1", "https://docs.google.com/plan")];

    const result = resolveProjectComms(tasks);

    expect(result.projectPlanLink).toBe("https://docs.google.com/plan");
  });

  it("populates distinct deliverableTypes from Delivery Deadline tasks", () => {
    const tasks = [
      deliveryDeadlineTask("d1", "Animatic"),
      deliveryDeadlineTask("d2", "Final Cut"),
      deliveryDeadlineTask("d3", "Animatic"), // duplicate — should be deduped
    ];

    const result = resolveProjectComms(tasks);

    expect(result.deliverableTypes).toHaveLength(2);
    expect(result.deliverableTypes).toContain("Animatic");
    expect(result.deliverableTypes).toContain("Final Cut");
  });

  it("resolves a full project with all task types together", () => {
    const tasks = [
      contactTask("c1", { firstName: "Ann", email: "ann@client.com", role: "Primary" }),
      contactTask("c2", { firstName: "Lee", email: "lee@client.com", role: "Log" }),
      slackChannelTask("s1", "C999"),
      projectPlanTask("p1", "https://plan.example/x"),
      deliveryDeadlineTask("d1", "Animatic"),
    ];

    const result = resolveProjectComms(tasks);

    expect(result.contacts.map((c) => c.taskId)).toEqual(["c1", "c2"]);
    expect(result.slackChannelId).toBe("C999");
    expect(result.projectPlanLink).toBe("https://plan.example/x");
    expect(result.deliverableTypes).toEqual(["Animatic"]);
  });
});
