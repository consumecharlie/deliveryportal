/**
 * Orchestration for a client pressing "All feedback is in" (and undoing it).
 * ClickUp and Slack side effects are best effort; the confirmation row is the
 * source of truth the portal reads back.
 *
 * Two kinds of item can be confirmed. A delivery we sent through the portal is
 * keyed by its Delivery row. An item that stands on a ClickUp Feedback Deadline
 * task alone (the team completed the share task without sending through the
 * portal, so there is no Delivery row) is keyed by that task id, and its
 * confirmation row carries `deliveryId: null`.
 */
import { prisma } from "@/lib/db";
import {
  updateTaskStatus,
  createTaskComment,
  getUserGroupMembers,
  type ClickUpGroupMember,
} from "@/lib/clickup";
import { USER_GROUPS, PM_FALLBACK_USERS } from "@/lib/custom-field-ids";
import { postChannelMessage, sendSlackDM } from "@/lib/slack-dm";
import {
  isPortalSandbox,
  sandboxComment,
  sandboxSlackDeliver,
  type SandboxDestination,
} from "@/lib/portal-sandbox";
import { resolveProjectChannel } from "@/lib/project-channel";
import { invalidateLiveFeedback } from "@/lib/portal-live";
import {
  slackConfirmText,
  slackUndoText,
  clickupConfirmComment,
  clickupUndoComment,
  type ConfirmContext,
  type UndoContext,
} from "@/lib/portal-confirm-messages";

/** Live-verified 2026-09-03 on Feedback Deadline tasks: open is "waiting on client", closed is "complete". */
const FD_OPEN_STATUS = "waiting on client";
const FD_CLOSED_STATUS = "complete";

export class PortalConfirmError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

const AUTO_SUFFIX = " (auto-matched channel; change it in Project Setup)";

/** When the channel post did not happen, tell the delivery's sender directly. */
async function dmFallback(senderEmail: string | null, text: string): Promise<boolean> {
  if (!senderEmail) return false;
  const ok = await sendSlackDM(senderEmail, text);
  if (!ok) console.warn("portal Slack DM fallback failed for", senderEmail);
  return ok;
}

async function pmMentions(): Promise<ClickUpGroupMember[]> {
  try {
    const m = await getUserGroupMembers(USER_GROUPS.PROJECT_MANAGEMENT);
    if (m.length) return m;
  } catch (err) {
    console.warn("PM group lookup failed, using fallback mentions", err);
  }
  return [...PM_FALLBACK_USERS];
}

/**
 * The item the client is confirming: a delivery we sent, or a bare Feedback
 * Deadline task. The task form carries the project and title the route already
 * resolved, because no Delivery row holds them.
 */
export interface ConfirmTaskTarget {
  feedbackTaskId: string;
  projectListId: string | null;
  projectName: string;
  /** What the client sees the item called; used in the Slack and ClickUp text. */
  title: string;
}

/**
 * When this delivery was last confirmed or undone (for the double-click
 * guard). Scoped to the portal's client so the guard cannot probe other
 * clients' deliveries.
 */
export async function lastFeedbackActivity(
  deliveryId: string,
  clientFolderId: string
): Promise<Date | null> {
  const row = await prisma.feedbackConfirmation.findFirst({
    where: { deliveryId, delivery: { clientFolderId } },
    orderBy: { confirmedAt: "desc" },
    select: { confirmedAt: true, undoneAt: true },
  });
  return activityAt(row);
}

/**
 * Same guard for a task-only item. Task rows have no delivery to scope by, so
 * the caller must have proven the task belongs to the token's folder (the
 * confirm and undo routes do, against the live payloads) before asking.
 */
export async function lastFeedbackTaskActivity(feedbackTaskId: string): Promise<Date | null> {
  const row = await prisma.feedbackConfirmation.findFirst({
    where: { feedbackDeadlineTaskId: feedbackTaskId, deliveryId: null },
    orderBy: { confirmedAt: "desc" },
    select: { confirmedAt: true, undoneAt: true },
  });
  return activityAt(row);
}

function activityAt(row: { confirmedAt: Date; undoneAt: Date | null } | null): Date | null {
  if (!row) return null;
  return row.undoneAt && row.undoneAt > row.confirmedAt ? row.undoneAt : row.confirmedAt;
}

/** A stable 63-bit advisory-lock key for a string (task ids have no numeric id to lock). */
function advisoryKey(s: string): bigint {
  // FNV-1a, kept inside a signed 64-bit range. BigInt literals need a newer
  // target than this project builds with, hence the constructor calls.
  const PRIME = BigInt("1099511628211");
  const MOD = BigInt("9223372036854775783");
  let h = BigInt("14695981039346656037") % MOD;
  for (let i = 0; i < s.length; i++) {
    h = ((h ^ BigInt(s.charCodeAt(i))) * PRIME) % MOD;
  }
  return h;
}

/** Close the feedback task and comment on it. Best effort; never throws. */
async function clickupConfirmSideEffects(
  feedbackDeadlineTaskId: string,
  ctx: ConfirmContext
): Promise<boolean> {
  try {
    await updateTaskStatus(feedbackDeadlineTaskId, FD_CLOSED_STATUS);
    await createTaskComment(feedbackDeadlineTaskId, {
      text: sandboxComment(clickupConfirmComment(ctx)),
      mentions: await pmMentions(),
      groupAssignee: USER_GROUPS.PROJECT_MANAGEMENT,
    });
    return true;
  } catch (err) {
    console.error("ClickUp confirm side-effect failed", feedbackDeadlineTaskId, err);
    return false;
  }
}

/**
 * Tell the team: the project's internal channel first, and when that is
 * impossible the delivery's sender by DM. Without a delivery there is no
 * sender, so the channel is the only route and a miss is logged.
 */
async function deliverConfirmSlack(input: {
  clientName: string;
  projectListId: string | null;
  projectName: string;
  senderEmail: string | null;
  text: string;
}): Promise<{ slackChannelId: string | null; slackMessageTs: string | null; slackOk: boolean }> {
  let slackChannelId: string | null = null;
  let slackMessageTs: string | null = null;
  let slackOk = false;
  const { text } = input;
  if (input.projectListId) {
    try {
      const ch = await resolveProjectChannel(input.projectListId, input.projectName, input.clientName, {
        persist: true,
      });
      if (ch.channelId && isPortalSandbox()) {
        // Sandbox: the channel is never posted to; the owner gets one DM naming it.
        slackOk = await sandboxSlackDeliver(
          { kind: "channel", channelId: ch.channelId, channelName: ch.channelName },
          ch.source === "auto" ? `${text}${AUTO_SUFFIX}` : text
        );
      } else if (ch.channelId) {
        slackChannelId = ch.channelId;
        slackMessageTs = await postChannelMessage(ch.channelId, ch.source === "auto" ? `${text}${AUTO_SUFFIX}` : text);
      } else {
        console.warn(
          "No internal channel mapped for",
          input.projectListId,
          "suggestions:",
          ch.suggestions.map((s) => s.name)
        );
      }
    } catch (err) {
      console.error("Slack confirm side-effect failed", input.projectListId, err);
    }
  }
  if (!slackOk) {
    if (isPortalSandbox()) {
      const dest: SandboxDestination = input.senderEmail
        ? { kind: "dm", email: input.senderEmail }
        : { kind: "none" };
      slackOk = await sandboxSlackDeliver(dest, text);
    } else if (slackMessageTs) {
      slackOk = true;
    } else if (input.senderEmail) {
      slackOk = await dmFallback(input.senderEmail, text);
    } else {
      console.warn(
        "portal confirm reached no Slack destination for",
        input.projectListId,
        "(no channel, and a task-only item has no sender to DM)"
      );
    }
  }
  return { slackChannelId, slackMessageTs, slackOk };
}

export async function confirmFeedback(input: {
  accessId: string;
  clientName: string;
  clientFolderId: string;
  /** Exactly one of these: the delivery behind the item, or the bare feedback task. */
  deliveryId?: string;
  task?: ConfirmTaskTarget;
  confirmedByName: string | null;
  feedbackDeadlineTaskId: string | null;
  deadlineLabel: string;
  portalUrl: string;
}): Promise<{ id: string; clickupOk: boolean; slackOk: boolean }> {
  if (input.task) return confirmTaskFeedback(input as typeof input & { task: ConfirmTaskTarget });
  const delivery = await prisma.delivery.findFirst({
    where: { id: input.deliveryId, clientFolderId: input.clientFolderId },
  });
  if (!delivery) throw new PortalConfirmError("Delivery not in this portal", 404);

  const ctx: ConfirmContext = {
    clientName: input.clientName,
    projectName: delivery.projectName,
    deliverableType: delivery.deliverableType,
    confirmedByName: input.confirmedByName,
    portalUrl: input.portalUrl,
    deadlineLabel: input.deadlineLabel,
  };

  // 1. Record first, under a row lock, so two presses (or two tabs) cannot
  //    both pass the "nothing active" check. The row is the source of truth
  //    the portal reads back; side effects below are best effort.
  const created = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Delivery" WHERE id = ${delivery.id} FOR UPDATE`;
    const active = await tx.feedbackConfirmation.findFirst({
      where: { deliveryId: delivery.id, undoneAt: null },
      select: { id: true },
    });
    if (active) throw new PortalConfirmError("Nothing awaiting feedback", 409);
    return tx.feedbackConfirmation.create({
      data: {
        deliveryId: delivery.id,
        projectListId: delivery.projectListId,
        deliverableType: delivery.deliverableType,
        feedbackDeadlineTaskId: input.feedbackDeadlineTaskId,
        confirmedByName: input.confirmedByName,
        slackChannelId: null,
        slackMessageTs: null,
      },
      select: { id: true },
    });
  });

  // 2. ClickUp (best effort).
  let clickupOk = false;
  if (input.feedbackDeadlineTaskId) {
    clickupOk = await clickupConfirmSideEffects(input.feedbackDeadlineTaskId, ctx);
    if (delivery.projectListId) await invalidateLiveFeedback(delivery.projectListId);
  }

  // 3. Slack (best effort). Channel post first; if that is impossible or
  //    fails, DM the person who sent the delivery so someone still hears.
  const { slackChannelId, slackMessageTs, slackOk } = await deliverConfirmSlack({
    clientName: input.clientName,
    projectListId: delivery.projectListId,
    projectName: delivery.projectName,
    senderEmail: delivery.senderEmail,
    text: slackConfirmText(ctx),
  });

  // 4. Attach the Slack pointer so undo can reply in the thread.
  if (slackChannelId) {
    await prisma.feedbackConfirmation.update({
      where: { id: created.id },
      data: { slackChannelId, slackMessageTs },
    });
  }

  console.info(
    "[portal-confirm]",
    JSON.stringify({
      action: "confirm",
      deliveryId: delivery.id,
      projectListId: delivery.projectListId,
      clickupOk,
      slackOk,
      channel: slackChannelId,
    })
  );
  return { id: created.id, clickupOk, slackOk };
}

/**
 * Confirm an item that has no delivery behind it. Same order as the delivery
 * path: the row first (under an advisory lock on the task id, since there is
 * no Delivery row to lock), then ClickUp, then Slack, then the Slack pointer.
 */
async function confirmTaskFeedback(input: {
  clientName: string;
  task: ConfirmTaskTarget;
  confirmedByName: string | null;
  deadlineLabel: string;
  portalUrl: string;
}): Promise<{ id: string; clickupOk: boolean; slackOk: boolean }> {
  const { task } = input;
  const ctx: ConfirmContext = {
    clientName: input.clientName,
    projectName: task.projectName,
    deliverableType: task.title,
    confirmedByName: input.confirmedByName,
    portalUrl: input.portalUrl,
    deadlineLabel: input.deadlineLabel,
  };

  const created = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${advisoryKey(task.feedbackTaskId)}::bigint)`;
    const active = await tx.feedbackConfirmation.findFirst({
      where: { feedbackDeadlineTaskId: task.feedbackTaskId, deliveryId: null, undoneAt: null },
      select: { id: true },
    });
    if (active) throw new PortalConfirmError("Nothing awaiting feedback", 409);
    return tx.feedbackConfirmation.create({
      data: {
        deliveryId: null,
        projectListId: task.projectListId,
        deliverableType: task.title,
        feedbackDeadlineTaskId: task.feedbackTaskId,
        confirmedByName: input.confirmedByName,
        slackChannelId: null,
        slackMessageTs: null,
      },
      select: { id: true },
    });
  });

  const clickupOk = await clickupConfirmSideEffects(task.feedbackTaskId, ctx);
  if (task.projectListId) await invalidateLiveFeedback(task.projectListId);

  const { slackChannelId, slackMessageTs, slackOk } = await deliverConfirmSlack({
    clientName: input.clientName,
    projectListId: task.projectListId,
    projectName: task.projectName,
    senderEmail: null,
    text: slackConfirmText(ctx),
  });

  if (slackChannelId) {
    await prisma.feedbackConfirmation.update({
      where: { id: created.id },
      data: { slackChannelId, slackMessageTs },
    });
  }

  console.info(
    "[portal-confirm]",
    JSON.stringify({
      action: "confirm",
      feedbackTaskId: task.feedbackTaskId,
      projectListId: task.projectListId,
      clickupOk,
      slackOk,
      channel: slackChannelId,
    })
  );
  return { id: created.id, clickupOk, slackOk };
}

/**
 * Reopen the feedback task. This is the one side effect undo cannot skip: if
 * the portal says "awaiting" while ClickUp still says complete, nobody is
 * waiting for the client's feedback. Keep the row active and let them retry.
 */
async function clickupUndoSideEffects(feedbackDeadlineTaskId: string): Promise<boolean> {
  try {
    await updateTaskStatus(feedbackDeadlineTaskId, FD_OPEN_STATUS);
  } catch (err) {
    console.error("ClickUp undo status reopen failed", feedbackDeadlineTaskId, err);
    throw new PortalConfirmError("Could not reopen the feedback window, please try again", 502);
  }
  try {
    await createTaskComment(feedbackDeadlineTaskId, {
      text: sandboxComment(clickupUndoComment()),
      mentions: await pmMentions(),
    });
    return true;
  } catch (err) {
    console.error("ClickUp undo comment failed", feedbackDeadlineTaskId, err);
    return false;
  }
}

/** The undo note: in the confirm message's thread when we have one, else the sender. */
async function deliverUndoSlack(input: {
  slackChannelId: string | null;
  slackMessageTs: string | null;
  senderEmail: string | null;
  text: string;
}): Promise<boolean> {
  const { text } = input;
  if (isPortalSandbox()) {
    const dest: SandboxDestination = input.slackChannelId
      ? {
          kind: "channel",
          channelId: input.slackChannelId,
          channelName: null,
          threadTs: input.slackMessageTs,
        }
      : input.senderEmail
        ? { kind: "dm", email: input.senderEmail }
        : { kind: "none" };
    return sandboxSlackDeliver(dest, text);
  }
  let slackOk = false;
  if (input.slackChannelId) {
    const ts = await postChannelMessage(input.slackChannelId, text, {
      threadTs: input.slackMessageTs ?? undefined,
    });
    slackOk = Boolean(ts);
  }
  if (!slackOk) {
    if (input.senderEmail) slackOk = await dmFallback(input.senderEmail, text);
    else console.warn("portal undo reached no Slack destination (no channel post, and no sender to DM)");
  }
  return slackOk;
}

export async function undoFeedback(input: {
  clientFolderId: string;
  clientName: string;
  /** Exactly one of these, matching the confirm that is being undone. */
  deliveryId?: string;
  feedbackTaskId?: string;
  /** The project name for the task-only path (no Delivery row holds it). */
  projectName?: string;
  portalUrl: string;
}): Promise<{ id: string; clickupOk: boolean; slackOk: boolean }> {
  if (input.feedbackTaskId) {
    return undoTaskFeedback({
      clientName: input.clientName,
      feedbackTaskId: input.feedbackTaskId,
      projectName: input.projectName ?? "",
      portalUrl: input.portalUrl,
    });
  }
  const conf = await prisma.feedbackConfirmation.findFirst({
    where: { deliveryId: input.deliveryId, undoneAt: null, delivery: { clientFolderId: input.clientFolderId } },
    orderBy: { confirmedAt: "desc" },
    include: { delivery: true },
  });
  if (!conf || !conf.delivery) throw new PortalConfirmError("Nothing to undo", 409);

  const ctx: UndoContext = {
    clientName: input.clientName,
    projectName: conf.delivery.projectName,
    deliverableType: conf.deliverableType,
    confirmedByName: conf.confirmedByName,
    portalUrl: input.portalUrl,
  };

  let clickupOk = false;
  if (conf.feedbackDeadlineTaskId) {
    clickupOk = await clickupUndoSideEffects(conf.feedbackDeadlineTaskId);
    if (conf.projectListId) await invalidateLiveFeedback(conf.projectListId);
  }

  const slackOk = await deliverUndoSlack({
    slackChannelId: conf.slackChannelId,
    slackMessageTs: conf.slackMessageTs,
    senderEmail: conf.delivery.senderEmail,
    text: slackUndoText(ctx),
  });

  await prisma.feedbackConfirmation.update({ where: { id: conf.id }, data: { undoneAt: new Date() } });
  console.info(
    "[portal-confirm]",
    JSON.stringify({
      action: "undo",
      deliveryId: conf.deliveryId,
      projectListId: conf.projectListId,
      clickupOk,
      slackOk,
      channel: conf.slackChannelId,
    })
  );
  return { id: conf.id, clickupOk, slackOk };
}

/** Undo a confirmation that stands on a feedback task alone. */
async function undoTaskFeedback(input: {
  clientName: string;
  feedbackTaskId: string;
  projectName: string;
  portalUrl: string;
}): Promise<{ id: string; clickupOk: boolean; slackOk: boolean }> {
  const conf = await prisma.feedbackConfirmation.findFirst({
    where: { feedbackDeadlineTaskId: input.feedbackTaskId, deliveryId: null, undoneAt: null },
    orderBy: { confirmedAt: "desc" },
  });
  if (!conf) throw new PortalConfirmError("Nothing to undo", 409);

  const ctx: UndoContext = {
    clientName: input.clientName,
    projectName: input.projectName,
    deliverableType: conf.deliverableType,
    confirmedByName: conf.confirmedByName,
    portalUrl: input.portalUrl,
  };

  const clickupOk = await clickupUndoSideEffects(input.feedbackTaskId);
  if (conf.projectListId) await invalidateLiveFeedback(conf.projectListId);

  const slackOk = await deliverUndoSlack({
    slackChannelId: conf.slackChannelId,
    slackMessageTs: conf.slackMessageTs,
    senderEmail: null,
    text: slackUndoText(ctx),
  });

  await prisma.feedbackConfirmation.update({ where: { id: conf.id }, data: { undoneAt: new Date() } });
  console.info(
    "[portal-confirm]",
    JSON.stringify({
      action: "undo",
      feedbackTaskId: input.feedbackTaskId,
      projectListId: conf.projectListId,
      clickupOk,
      slackOk,
      channel: conf.slackChannelId,
    })
  );
  return { id: conf.id, clickupOk, slackOk };
}
