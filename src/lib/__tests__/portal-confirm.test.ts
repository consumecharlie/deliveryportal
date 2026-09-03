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
import { confirmFeedback, undoFeedback, PortalConfirmError } from "@/lib/portal-confirm";

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
