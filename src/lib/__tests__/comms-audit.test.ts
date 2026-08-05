import { describe, it, expect } from "vitest";
import { auditProject, type ProjectCommsConfig } from "@/lib/comms-audit";

function base(over: Partial<ProjectCommsConfig> = {}): ProjectCommsConfig {
  return {
    listId: "L1",
    clientName: "Acme",
    projectName: "Acme Brand Video",
    contacts: [{ name: "Jane", email: "jane@acme.com", role: "Primary" }],
    slackChannelId: null,
    slackChannelName: null,
    botInChannel: null,
    projectPlanLink: "https://clickup.com/plan",
    hasTemplateForDeliverable: true,
    ...over,
  };
}
const types = (cfg: ProjectCommsConfig) => auditProject(cfg).map((i) => i.type);

describe("mode inference", () => {
  it("is an email client when no contact has a Slack handle", () => {
    expect(auditProject(base()).find((i) => i.type === "no_slack_channel")).toBeUndefined();
  });
  it("is a Slack client when any contact has a Slack handle", () => {
    const cfg = base({
      contacts: [{ name: "Jane", email: "j@a.com", role: "Primary", slackHandle: "@jane" }],
    });
    expect(types(cfg)).toContain("no_slack_channel");
  });
});

describe("email-client checks", () => {
  it("flags a contact with no email", () => {
    const cfg = base({ contacts: [{ name: "Jane", email: "", role: "Primary" }] });
    expect(types(cfg)).toContain("contact_missing_email");
  });
});

describe("slack-client checks", () => {
  const slack = (over: Partial<ProjectCommsConfig> = {}) =>
    base({
      contacts: [{ name: "Jane", email: "j@a.com", role: "Primary", slackHandle: "@jane", slackUserId: "U1" }],
      slackChannelId: "C1",
      slackChannelName: "acme-consume",
      botInChannel: true,
      ...over,
    });

  it("is healthy when channel set, bot in channel, user IDs present", () => {
    expect(auditProject(slack())).toEqual([]);
  });
  it("flags missing Slack channel (the #1 gap)", () => {
    expect(types(slack({ slackChannelId: null, botInChannel: null }))).toContain("no_slack_channel");
  });
  it("flags bot not in channel", () => {
    expect(types(slack({ botInChannel: false }))).toContain("bot_not_in_channel");
  });
  it("flags a Slack contact with a handle but no user ID", () => {
    const cfg = slack({
      contacts: [{ name: "Jane", email: "j@a.com", role: "Primary", slackHandle: "@jane" }],
    });
    expect(types(cfg)).toContain("contact_missing_slack_user_id");
  });
});

describe("both modes", () => {
  it("flags no contacts", () => {
    expect(types(base({ contacts: [] }))).toContain("no_contacts");
  });
  it("flags no primary contact", () => {
    const cfg = base({ contacts: [{ name: "Jane", email: "j@a.com", role: "Standard" }] });
    expect(types(cfg)).toContain("no_primary_contact");
  });
  it("flags missing project plan link", () => {
    expect(types(base({ projectPlanLink: null }))).toContain("no_project_plan");
  });
  it("flags missing template mapping", () => {
    expect(types(base({ hasTemplateForDeliverable: false }))).toContain("no_template");
  });
  it("assigns blocker severity to a missing Slack channel", () => {
    const issue = auditProject(base({
      contacts: [{ name: "J", email: "j@a.com", role: "Primary", slackHandle: "@j" }],
    })).find((i) => i.type === "no_slack_channel");
    expect(issue?.severity).toBe("blocker");
  });
});
