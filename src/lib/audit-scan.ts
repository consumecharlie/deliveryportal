import { Prisma } from "@prisma/client";
import {
  getSpaceFolders,
  getListTasks,
  extractCustomFieldValue,
} from "@/lib/clickup";
import { SPACES, LISTS, TEMPLATE_FIELDS } from "@/lib/custom-field-ids";
import { resolveProjectComms } from "@/lib/project-comms";
import { auditProject, isSlackClient, type AuditIssue } from "@/lib/comms-audit";
import { getChannelMembership } from "@/lib/slack-audit";
import { prisma } from "@/lib/db";

export interface ProjectAudit {
  listId: string;
  clientName: string;
  projectName: string;
  mode: "email" | "slack";
  slackChannelId: string | null;
  slackChannelName: string | null;
  /** true/false when a channel is set and was checked; null when no channel. */
  botInChannel: boolean | null;
  channelPrivate: boolean;
  channelNotVisible: boolean;
  contacts: Array<{ taskId: string; name: string; role: string }>;
  issues: AuditIssue[];
  /** Set when the project couldn't be scanned (ClickUp/Slack error). */
  scanError?: string;
}

interface ProjectMeta {
  listId: string;
  clientName: string;
  projectName: string;
}

/** Deliverable-type names that have a Delivery Snippet template. */
export async function getTemplateDeliverableTypes(): Promise<Set<string>> {
  const { tasks } = await getListTasks(LISTS.DELIVERY_SNIPPETS, false);
  const set = new Set<string>();
  for (const t of tasks) {
    const dt = extractCustomFieldValue(t.custom_fields, TEMPLATE_FIELDS.DELIVERABLE_TYPE);
    if (dt) set.add(dt);
  }
  return set;
}

async function saveAudit(a: ProjectAudit): Promise<void> {
  try {
    const value = a as unknown as Prisma.InputJsonValue;
    await prisma.auditResult.upsert({
      where: { listId: a.listId },
      create: {
        listId: a.listId,
        clientName: a.clientName,
        projectName: a.projectName,
        data: value,
      },
      update: { clientName: a.clientName, projectName: a.projectName, data: value },
    });
  } catch (e) {
    console.error("Failed to save audit result:", e);
  }
}

/** Scan one project: resolve its config, check Slack membership, run the engine,
 *  and persist the row. Never throws — a failure yields a scanError row. */
export async function scanProject(
  meta: ProjectMeta,
  templateTypes?: Set<string>
): Promise<ProjectAudit> {
  try {
    const templates = templateTypes ?? (await getTemplateDeliverableTypes());
    const { tasks } = await getListTasks(meta.listId, true);
    const resolved = resolveProjectComms(tasks);
    const slackClient = isSlackClient(resolved.contacts);

    let slackChannelName: string | null = null;
    let botInChannel: boolean | null = null;
    let channelPrivate = false;
    let channelNotVisible = false;
    if (resolved.slackChannelId) {
      const m = await getChannelMembership(resolved.slackChannelId);
      slackChannelName = m.name;
      // A private channel the bot can't see counts as "not in channel".
      botInChannel = m.notVisible ? false : m.isMember;
      channelPrivate = m.isPrivate;
      channelNotVisible = m.notVisible;
    }

    const hasTemplateForDeliverable =
      resolved.deliverableTypes.length === 0 ||
      resolved.deliverableTypes.every((dt) => templates.has(dt));

    const issues = auditProject({
      listId: meta.listId,
      clientName: meta.clientName,
      projectName: meta.projectName,
      contacts: resolved.contacts,
      slackChannelId: resolved.slackChannelId,
      slackChannelName,
      botInChannel,
      projectPlanLink: resolved.projectPlanLink,
      hasTemplateForDeliverable,
    });

    const audit: ProjectAudit = {
      ...meta,
      mode: slackClient ? "slack" : "email",
      slackChannelId: resolved.slackChannelId,
      slackChannelName,
      botInChannel,
      channelPrivate,
      channelNotVisible,
      contacts: resolved.contacts.map((c) => ({
        taskId: c.taskId,
        name: c.name,
        role: c.role,
      })),
      issues,
    };
    await saveAudit(audit);
    return audit;
  } catch (e) {
    const audit: ProjectAudit = {
      ...meta,
      mode: "email",
      slackChannelId: null,
      slackChannelName: null,
      botInChannel: null,
      channelPrivate: false,
      channelNotVisible: false,
      contacts: [],
      issues: [],
      scanError: e instanceof Error ? e.message : String(e),
    };
    await saveAudit(audit);
    return audit;
  }
}

/** Full sweep across every project (folder → list) in the Projects space. */
export async function scanAllProjects(): Promise<number> {
  const { folders } = await getSpaceFolders(SPACES.PROJECTS);
  const metas: ProjectMeta[] = [];
  for (const f of folders) {
    for (const l of f.lists) {
      metas.push({ listId: l.id, clientName: f.name, projectName: l.name });
    }
  }
  const templates = await getTemplateDeliverableTypes();
  const BATCH = 8; // respect ClickUp/Slack rate limits
  for (let i = 0; i < metas.length; i += BATCH) {
    await Promise.all(metas.slice(i, i + BATCH).map((m) => scanProject(m, templates)));
  }
  return metas.length;
}
