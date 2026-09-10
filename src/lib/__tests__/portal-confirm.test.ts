import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const tx = {
  $queryRaw: vi.fn(),
  feedbackConfirmation: { findFirst: vi.fn(), create: vi.fn() },
};
vi.mock("@/lib/db", () => ({
  prisma: {
    delivery: { findFirst: vi.fn() },
    feedbackConfirmation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));
vi.mock("@/lib/clickup", () => ({
  updateTaskStatus: vi.fn(),
  createTaskComment: vi.fn(),
  getUserGroupMembers: vi.fn(),
}));
vi.mock("@/lib/slack-dm", () => ({ postChannelMessage: vi.fn(), sendSlackDM: vi.fn() }));
vi.mock("@/lib/project-channel", () => ({ resolveProjectChannel: vi.fn() }));
vi.mock("@/lib/portal-live", () => ({ invalidateLiveFeedback: vi.fn() }));

import { prisma } from "@/lib/db";
import { updateTaskStatus, createTaskComment, getUserGroupMembers } from "@/lib/clickup";
import { postChannelMessage, sendSlackDM } from "@/lib/slack-dm";
import { resolveProjectChannel } from "@/lib/project-channel";
import {
  confirmFeedback,
  undoFeedback,
  lastFeedbackActivity,
  lastFeedbackTaskActivity,
  PortalConfirmError,
} from "@/lib/portal-confirm";

const delivery = {
  id: "d1",
  projectListId: "list-1",
  projectName: "Acme Launch Video",
  deliverableType: "Edit V1",
  clientFolderId: "folder-1",
  senderEmail: "pm@consume-media.com",
};

const input = {
  accessId: "a1",
  clientName: "Acme",
  clientFolderId: "folder-1",
  deliveryId: "d1",
  confirmedByName: null,
  feedbackDeadlineTaskId: "task-1",
  deadlineLabel: "Tue, Sep 9",
  portalUrl: "https://portal.example.com/portal/abc",
};

function order(fn: unknown): number {
  return (fn as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder[0];
}

describe("confirmFeedback", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(prisma.delivery.findFirst).mockResolvedValue(delivery as never);
    tx.$queryRaw.mockResolvedValue([{ id: "d1" }]);
    tx.feedbackConfirmation.findFirst.mockResolvedValue(null);
    tx.feedbackConfirmation.create.mockResolvedValue({ id: "conf-1" });
    vi.mocked(prisma.feedbackConfirmation.update).mockResolvedValue({ id: "conf-1" } as never);
    vi.mocked(getUserGroupMembers).mockResolvedValue([{ id: 1, username: "PM" }]);
    vi.mocked(updateTaskStatus).mockResolvedValue(undefined);
    vi.mocked(createTaskComment).mockResolvedValue({ id: "c1" });
    vi.mocked(resolveProjectChannel).mockResolvedValue({
      channelId: "C1",
      channelName: "acme-launch",
      source: "confirmed",
      autoMatched: false,
      suggestions: [],
    });
    vi.mocked(postChannelMessage).mockResolvedValue("171.1");
    vi.mocked(sendSlackDM).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("records the confirmation inside a locked transaction before any side effect", async () => {
    await confirmFeedback(input);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.feedbackConfirmation.create).toHaveBeenCalledTimes(1);
    const data = tx.feedbackConfirmation.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      deliveryId: "d1",
      projectListId: "list-1",
      deliverableType: "Edit V1",
      feedbackDeadlineTaskId: "task-1",
      slackChannelId: null,
      slackMessageTs: null,
    });
    expect(order(tx.feedbackConfirmation.create)).toBeLessThan(order(updateTaskStatus));
    expect(order(tx.feedbackConfirmation.create)).toBeLessThan(order(postChannelMessage));
  });

  it("rejects with 409 when an active confirmation already exists, with no side effects", async () => {
    tx.feedbackConfirmation.findFirst.mockResolvedValue({ id: "conf-old" });
    await expect(confirmFeedback(input)).rejects.toMatchObject({ status: 409 });
    expect(tx.feedbackConfirmation.create).not.toHaveBeenCalled();
    expect(updateTaskStatus).not.toHaveBeenCalled();
    expect(postChannelMessage).not.toHaveBeenCalled();
  });

  it("closes the task, posts to the channel, then stores the Slack pointer on the row", async () => {
    const r = await confirmFeedback(input);
    expect(resolveProjectChannel).toHaveBeenCalledWith("list-1", "Acme Launch Video", "Acme", { persist: true });
    expect(updateTaskStatus).toHaveBeenCalledWith("task-1", "complete");
    expect(createTaskComment).toHaveBeenCalledTimes(1);
    expect(postChannelMessage).toHaveBeenCalledWith("C1", expect.stringContaining("*Acme* confirmed"));
    expect(prisma.feedbackConfirmation.update).toHaveBeenCalledWith({
      where: { id: "conf-1" },
      data: { slackChannelId: "C1", slackMessageTs: "171.1" },
    });
    expect(r).toEqual({ id: "conf-1", clickupOk: true, slackOk: true });
  });

  it("logs one structured info line", async () => {
    await confirmFeedback(input);
    const lines = vi.mocked(console.info).mock.calls.filter((c) => c[0] === "[portal-confirm]");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0][1] as string)).toMatchObject({
      deliveryId: "d1",
      projectListId: "list-1",
      clickupOk: true,
      slackOk: true,
      channel: "C1",
    });
  });

  it("DMs the sender when the channel post fails", async () => {
    vi.mocked(postChannelMessage).mockResolvedValue(null);
    const r = await confirmFeedback(input);
    expect(sendSlackDM).toHaveBeenCalledWith("pm@consume-media.com", expect.stringContaining("*Acme* confirmed"));
    expect(r.slackOk).toBe(true);
    expect(prisma.feedbackConfirmation.update).toHaveBeenCalledWith({
      where: { id: "conf-1" },
      data: { slackChannelId: "C1", slackMessageTs: null },
    });
  });

  it("DMs the sender when no internal channel is mapped", async () => {
    vi.mocked(resolveProjectChannel).mockResolvedValue({
      channelId: null,
      channelName: null,
      source: "none",
      autoMatched: false,
      suggestions: [],
    });
    vi.mocked(sendSlackDM).mockResolvedValue(false);
    const r = await confirmFeedback(input);
    expect(postChannelMessage).not.toHaveBeenCalled();
    expect(sendSlackDM).toHaveBeenCalledTimes(1);
    expect(r.slackOk).toBe(false);
  });

  it("flags an auto-matched channel in the first post", async () => {
    vi.mocked(resolveProjectChannel).mockResolvedValue({
      channelId: "C9",
      channelName: "acme-launch-video",
      source: "auto",
      autoMatched: true,
      suggestions: [],
    });
    await confirmFeedback(input);
    const text = vi.mocked(postChannelMessage).mock.calls[0][1];
    expect(text.endsWith(" (auto-matched channel; change it in Project Setup)")).toBe(true);
  });

  it("does not add the auto suffix for a confirmed mapping", async () => {
    await confirmFeedback(input);
    expect(vi.mocked(postChannelMessage).mock.calls[0][1]).not.toContain("auto-matched");
  });

  it("404s when the delivery is not in this client's folder", async () => {
    vi.mocked(prisma.delivery.findFirst).mockResolvedValue(null);
    await expect(confirmFeedback(input)).rejects.toBeInstanceOf(PortalConfirmError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("undoFeedback", () => {
  const conf = {
    id: "conf-1",
    deliveryId: "d1",
    projectListId: "list-1",
    deliverableType: "Edit V1",
    feedbackDeadlineTaskId: "task-1",
    confirmedByName: null,
    slackChannelId: "C1",
    slackMessageTs: "171.1",
    delivery,
  };
  const undoInput = {
    clientFolderId: "folder-1",
    clientName: "Acme",
    deliveryId: "d1",
    portalUrl: "https://portal.example.com/portal/abc",
  };

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(prisma.feedbackConfirmation.findFirst).mockResolvedValue(conf as never);
    vi.mocked(prisma.feedbackConfirmation.update).mockResolvedValue(conf as never);
    vi.mocked(getUserGroupMembers).mockResolvedValue([{ id: 1, username: "PM" }]);
    vi.mocked(updateTaskStatus).mockResolvedValue(undefined);
    vi.mocked(createTaskComment).mockResolvedValue({ id: "c1" });
    vi.mocked(postChannelMessage).mockResolvedValue("171.2");
    vi.mocked(sendSlackDM).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("reopens the task, replies in the thread and marks the row undone", async () => {
    const r = await undoFeedback(undoInput);
    expect(updateTaskStatus).toHaveBeenCalledWith("task-1", "waiting on client");
    expect(postChannelMessage).toHaveBeenCalledWith("C1", expect.stringContaining("reopened feedback"), {
      threadTs: "171.1",
    });
    expect(prisma.feedbackConfirmation.update).toHaveBeenCalledWith({
      where: { id: "conf-1" },
      data: { undoneAt: expect.any(Date) },
    });
    expect(r).toEqual({ id: "conf-1", clickupOk: true, slackOk: true });
  });

  it("409s when there is no active confirmation", async () => {
    vi.mocked(prisma.feedbackConfirmation.findFirst).mockResolvedValue(null);
    await expect(undoFeedback(undoInput)).rejects.toMatchObject({ status: 409, message: "Nothing to undo" });
  });

  it("does not strand the client: a failed status reopen throws 502 and leaves the row active", async () => {
    vi.mocked(updateTaskStatus).mockRejectedValue(new Error("ClickUp API error 500"));
    await expect(undoFeedback(undoInput)).rejects.toMatchObject({ status: 502 });
    expect(prisma.feedbackConfirmation.update).not.toHaveBeenCalled();
    expect(createTaskComment).not.toHaveBeenCalled();
    expect(postChannelMessage).not.toHaveBeenCalled();
  });

  it("DMs the sender when the thread reply fails", async () => {
    vi.mocked(postChannelMessage).mockResolvedValue(null);
    const r = await undoFeedback(undoInput);
    expect(sendSlackDM).toHaveBeenCalledWith("pm@consume-media.com", expect.stringContaining("reopened feedback"));
    expect(r.slackOk).toBe(true);
  });

  it("DMs the sender when the confirmation had no channel", async () => {
    vi.mocked(prisma.feedbackConfirmation.findFirst).mockResolvedValue({
      ...conf,
      slackChannelId: null,
      slackMessageTs: null,
    } as never);
    await undoFeedback(undoInput);
    expect(postChannelMessage).not.toHaveBeenCalled();
    expect(sendSlackDM).toHaveBeenCalledTimes(1);
  });

  it("a failed comment or Slack reply stays best effort", async () => {
    vi.mocked(createTaskComment).mockRejectedValue(new Error("boom"));
    vi.mocked(postChannelMessage).mockResolvedValue(null);
    vi.mocked(sendSlackDM).mockResolvedValue(false);
    const r = await undoFeedback(undoInput);
    expect(prisma.feedbackConfirmation.update).toHaveBeenCalledTimes(1);
    expect(r.clickupOk).toBe(false);
  });
});

describe("lastFeedbackActivity", () => {
  afterEach(() => vi.clearAllMocks());

  it("is null with no rows", async () => {
    vi.mocked(prisma.feedbackConfirmation.findFirst).mockResolvedValue(null);
    await expect(lastFeedbackActivity("d1", "folder-1")).resolves.toBeNull();
    const where = vi.mocked(prisma.feedbackConfirmation.findFirst).mock.calls[0][0]?.where;
    expect(where).toEqual({ deliveryId: "d1", delivery: { clientFolderId: "folder-1" } });
  });

  it("picks undoneAt when it is newer than confirmedAt", async () => {
    const confirmedAt = new Date("2026-09-03T12:00:00Z");
    const undoneAt = new Date("2026-09-03T12:05:00Z");
    vi.mocked(prisma.feedbackConfirmation.findFirst).mockResolvedValue({ confirmedAt, undoneAt } as never);
    await expect(lastFeedbackActivity("d1", "folder-1")).resolves.toEqual(undoneAt);
  });

  it("picks confirmedAt when the row is still active", async () => {
    const confirmedAt = new Date("2026-09-03T12:00:00Z");
    vi.mocked(prisma.feedbackConfirmation.findFirst).mockResolvedValue({ confirmedAt, undoneAt: null } as never);
    await expect(lastFeedbackActivity("d1", "folder-1")).resolves.toEqual(confirmedAt);
  });
});

describe("confirmFeedback and undoFeedback on a feedback task with no delivery", () => {
  const taskInput = {
    accessId: "a1",
    clientName: "Stack Overflow",
    clientFolderId: "folder-1",
    task: {
      feedbackTaskId: "fd-9",
      projectListId: "list-9",
      projectName: "2026 Internal Explainer",
      title: "Spinoff Details",
    },
    confirmedByName: "Dana",
    feedbackDeadlineTaskId: "fd-9",
    deadlineLabel: "Thu, Sep 10",
    portalUrl: "https://portal.example.com/portal/abc",
  };
  const confirmedRow = {
    id: "conf-9",
    deliveryId: null,
    projectListId: "list-9",
    deliverableType: "Spinoff Details",
    feedbackDeadlineTaskId: "fd-9",
    confirmedByName: "Dana",
    slackChannelId: "C9",
    slackMessageTs: "171.9",
  };

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    tx.$queryRaw.mockResolvedValue([{ pg_advisory_xact_lock: "" }]);
    tx.feedbackConfirmation.findFirst.mockResolvedValue(null);
    tx.feedbackConfirmation.create.mockResolvedValue({ id: "conf-9" });
    vi.mocked(prisma.feedbackConfirmation.findFirst).mockResolvedValue(confirmedRow as never);
    vi.mocked(prisma.feedbackConfirmation.update).mockResolvedValue({ id: "conf-9" } as never);
    vi.mocked(getUserGroupMembers).mockResolvedValue([{ id: 1, username: "PM" }]);
    vi.mocked(updateTaskStatus).mockResolvedValue(undefined);
    vi.mocked(createTaskComment).mockResolvedValue({ id: "c9" });
    vi.mocked(resolveProjectChannel).mockResolvedValue({
      channelId: "C9",
      channelName: "stack-explainer",
      source: "confirmed",
      autoMatched: false,
      suggestions: [],
    });
    vi.mocked(postChannelMessage).mockResolvedValue("171.9");
    vi.mocked(sendSlackDM).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("writes a row with no delivery, under a lock, before any side effect", async () => {
    const r = await confirmFeedback(taskInput);
    expect(prisma.delivery.findFirst).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.feedbackConfirmation.create.mock.calls[0][0].data).toMatchObject({
      deliveryId: null,
      projectListId: "list-9",
      deliverableType: "Spinoff Details",
      feedbackDeadlineTaskId: "fd-9",
      confirmedByName: "Dana",
    });
    expect(order(tx.feedbackConfirmation.create)).toBeLessThan(order(updateTaskStatus));
    expect(order(tx.feedbackConfirmation.create)).toBeLessThan(order(postChannelMessage));
    expect(updateTaskStatus).toHaveBeenCalledWith("fd-9", "complete");
    expect(postChannelMessage).toHaveBeenCalledWith("C9", expect.stringContaining("*Spinoff Details*"));
    expect(prisma.feedbackConfirmation.update).toHaveBeenCalledWith({
      where: { id: "conf-9" },
      data: { slackChannelId: "C9", slackMessageTs: "171.9" },
    });
    expect(r).toEqual({ id: "conf-9", clickupOk: true, slackOk: true });
  });

  it("409s when this task already has an active confirmation, with no side effects", async () => {
    tx.feedbackConfirmation.findFirst.mockResolvedValue({ id: "conf-old" });
    await expect(confirmFeedback(taskInput)).rejects.toMatchObject({ status: 409 });
    expect(updateTaskStatus).not.toHaveBeenCalled();
    expect(postChannelMessage).not.toHaveBeenCalled();
    expect(tx.feedbackConfirmation.findFirst.mock.calls[0][0].where).toEqual({
      feedbackDeadlineTaskId: "fd-9",
      deliveryId: null,
      undoneAt: null,
    });
  });

  it("never DMs a sender: there is no delivery, so a missing channel is only logged", async () => {
    vi.mocked(resolveProjectChannel).mockResolvedValue({
      channelId: null,
      channelName: null,
      source: "none",
      autoMatched: false,
      suggestions: [],
    } as never);
    const r = await confirmFeedback(taskInput);
    expect(sendSlackDM).not.toHaveBeenCalled();
    expect(r.slackOk).toBe(false);
    expect(r.clickupOk).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(
      "portal confirm reached no Slack destination for",
      "list-9",
      expect.stringContaining("no sender to DM")
    );
  });

  it("undo reopens the task, replies in the thread, and marks the row undone", async () => {
    const r = await undoFeedback({
      clientFolderId: "folder-1",
      clientName: "Stack Overflow",
      feedbackTaskId: "fd-9",
      projectName: "2026 Internal Explainer",
      portalUrl: "https://portal.example.com/portal/abc",
    });
    expect(vi.mocked(prisma.feedbackConfirmation.findFirst).mock.calls[0][0]?.where).toEqual({
      feedbackDeadlineTaskId: "fd-9",
      deliveryId: null,
      undoneAt: null,
    });
    expect(updateTaskStatus).toHaveBeenCalledWith("fd-9", "waiting on client");
    expect(postChannelMessage).toHaveBeenCalledWith("C9", expect.stringContaining("reopened feedback"), {
      threadTs: "171.9",
    });
    expect(prisma.feedbackConfirmation.update).toHaveBeenCalledWith({
      where: { id: "conf-9" },
      data: { undoneAt: expect.any(Date) },
    });
    expect(r).toEqual({ id: "conf-9", clickupOk: true, slackOk: true });
  });

  it("undo 409s with nothing active, and 502s when ClickUp will not reopen", async () => {
    vi.mocked(prisma.feedbackConfirmation.findFirst).mockResolvedValue(null);
    await expect(
      undoFeedback({ clientFolderId: "folder-1", clientName: "Stack Overflow", feedbackTaskId: "fd-9", portalUrl: "u" })
    ).rejects.toMatchObject({ status: 409 });

    vi.mocked(prisma.feedbackConfirmation.findFirst).mockResolvedValue(confirmedRow as never);
    vi.mocked(updateTaskStatus).mockRejectedValue(new Error("ClickUp down"));
    await expect(
      undoFeedback({ clientFolderId: "folder-1", clientName: "Stack Overflow", feedbackTaskId: "fd-9", portalUrl: "u" })
    ).rejects.toMatchObject({ status: 502 });
    expect(prisma.feedbackConfirmation.update).not.toHaveBeenCalled();
  });

  it("lastFeedbackTaskActivity reads the newest row for the task, undo winning over confirm", async () => {
    const confirmedAt = new Date("2026-09-10T12:00:00Z");
    const undoneAt = new Date("2026-09-10T12:05:00Z");
    vi.mocked(prisma.feedbackConfirmation.findFirst).mockResolvedValue({ confirmedAt, undoneAt } as never);
    expect(await lastFeedbackTaskActivity("fd-9")).toEqual(undoneAt);
    vi.mocked(prisma.feedbackConfirmation.findFirst).mockResolvedValue({ confirmedAt, undoneAt: null } as never);
    expect(await lastFeedbackTaskActivity("fd-9")).toEqual(confirmedAt);
    vi.mocked(prisma.feedbackConfirmation.findFirst).mockResolvedValue(null);
    expect(await lastFeedbackTaskActivity("fd-9")).toBeNull();
  });
});
