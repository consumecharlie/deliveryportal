/**
 * Orchestration for a client pressing "All feedback is in" (and undoing it).
 * ClickUp and Slack side effects are best effort; the confirmation row is the
 * source of truth the portal reads back.
 */
import { prisma } from "@/lib/db";
import {
  updateTaskStatus,
  createTaskComment,
  getUserGroupMembers,
  type ClickUpGroupMember,
} from "@/lib/clickup";
import { USER_GROUPS, PM_FALLBACK_USERS } from "@/lib/custom-field-ids";
import { postChannelMessage } from "@/lib/slack-dm";
import { resolveProjectChannel } from "@/lib/project-channel";
import { invalidateLiveFeedback } from "@/lib/portal-live";
import {
  slackConfirmText,
  slackUndoText,
  clickupConfirmComment,
  clickupUndoComment,
  type ConfirmContext,
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
  if (!row) return null;
  return row.undoneAt && row.undoneAt > row.confirmedAt ? row.undoneAt : row.confirmedAt;
}

export async function confirmFeedback(input: {
  accessId: string;
  clientName: string;
  clientFolderId: string;
  deliveryId: string;
  confirmedByName: string | null;
  feedbackDeadlineTaskId: string | null;
  deadlineLabel: string;
  portalUrl: string;
}): Promise<{ id: string; clickupOk: boolean; slackOk: boolean }> {
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
    try {
      await updateTaskStatus(input.feedbackDeadlineTaskId, FD_CLOSED_STATUS);
      await createTaskComment(input.feedbackDeadlineTaskId, {
        text: clickupConfirmComment(ctx),
        mentions: await pmMentions(),
        groupAssignee: USER_GROUPS.PROJECT_MANAGEMENT,
      });
      clickupOk = true;
    } catch (err) {
      console.error("ClickUp confirm side-effect failed", input.feedbackDeadlineTaskId, err);
    }
    if (delivery.projectListId) await invalidateLiveFeedback(delivery.projectListId);
  }

  // 3. Slack (best effort).
  let slackChannelId: string | null = null;
  let slackMessageTs: string | null = null;
  if (delivery.projectListId) {
    try {
      const ch = await resolveProjectChannel(delivery.projectListId, delivery.projectName, input.clientName);
      if (ch.channelId) {
        slackChannelId = ch.channelId;
        slackMessageTs = await postChannelMessage(ch.channelId, slackConfirmText(ctx));
      } else {
        console.warn(
          "No internal channel mapped for",
          delivery.projectListId,
          "suggestions:",
          ch.suggestions.map((s) => s.name)
        );
      }
    } catch (err) {
      console.error("Slack confirm side-effect failed", delivery.projectListId, err);
    }
  }

  // 4. Attach the Slack pointer so undo can reply in the thread.
  if (slackChannelId) {
    await prisma.feedbackConfirmation.update({
      where: { id: created.id },
      data: { slackChannelId, slackMessageTs },
    });
  }

  const slackOk = Boolean(slackMessageTs);
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

export async function undoFeedback(input: {
  clientFolderId: string;
  clientName: string;
  deliveryId: string;
  portalUrl: string;
}): Promise<{ id: string; clickupOk: boolean; slackOk: boolean }> {
  const conf = await prisma.feedbackConfirmation.findFirst({
    where: { deliveryId: input.deliveryId, undoneAt: null, delivery: { clientFolderId: input.clientFolderId } },
    orderBy: { confirmedAt: "desc" },
    include: { delivery: true },
  });
  if (!conf) throw new PortalConfirmError("Nothing to undo", 409);

  const ctx: ConfirmContext = {
    clientName: input.clientName,
    projectName: conf.delivery.projectName,
    deliverableType: conf.deliverableType,
    confirmedByName: conf.confirmedByName,
    portalUrl: input.portalUrl,
    deadlineLabel: "",
  };

  let clickupOk = false;
  if (conf.feedbackDeadlineTaskId) {
    // Reopening the task is the one side effect undo cannot skip: if the
    // portal says "awaiting" while ClickUp still says complete, nobody is
    // waiting for the client's feedback. Keep the row active and let them retry.
    try {
      await updateTaskStatus(conf.feedbackDeadlineTaskId, FD_OPEN_STATUS);
    } catch (err) {
      console.error("ClickUp undo status reopen failed", conf.feedbackDeadlineTaskId, err);
      throw new PortalConfirmError("Could not reopen the feedback window, please try again", 502);
    }
    try {
      await createTaskComment(conf.feedbackDeadlineTaskId, {
        text: clickupUndoComment(),
        mentions: await pmMentions(),
      });
      clickupOk = true;
    } catch (err) {
      console.error("ClickUp undo comment failed", conf.feedbackDeadlineTaskId, err);
    }
    if (conf.projectListId) await invalidateLiveFeedback(conf.projectListId);
  }

  let slackOk = false;
  if (conf.slackChannelId) {
    const ts = await postChannelMessage(conf.slackChannelId, slackUndoText(ctx), {
      threadTs: conf.slackMessageTs ?? undefined,
    });
    slackOk = Boolean(ts);
  }

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
