import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    portalMessage: { count: vi.fn(), create: vi.fn(), update: vi.fn() },
    delivery: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/portal-data", () => ({ resolveAccess: vi.fn() }));
vi.mock("@/lib/project-channel", () => ({ resolveProjectChannel: vi.fn() }));
vi.mock("@/lib/slack-dm", () => ({ postChannelMessage: vi.fn(), sendSlackDM: vi.fn() }));

import { prisma } from "@/lib/db";
import { resolveAccess } from "@/lib/portal-data";
import { resolveProjectChannel } from "@/lib/project-channel";
import { postChannelMessage, sendSlackDM } from "@/lib/slack-dm";
import { POST } from "@/app/api/portal/[token]/message/route";

const access = { id: "a1", clientFolderId: "folder-1", clientName: "Acme", token: "tok" };

function post(body: unknown, token = "tok") {
  const req = new Request(`http://localhost/api/portal/${token}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ token }) });
}

/** Records the order side effects happen in, so "persist before Slack" is provable. */
function trackOrder() {
  const order: string[] = [];
  vi.mocked(prisma.portalMessage.create).mockImplementation((async () => {
    order.push("create");
    return { id: "m1" };
  }) as never);
  vi.mocked(postChannelMessage).mockImplementation(async () => {
    order.push("channel");
    return "171.1";
  });
  vi.mocked(sendSlackDM).mockImplementation(async () => {
    order.push("dm");
    return true;
  });
  vi.mocked(prisma.portalMessage.update).mockImplementation((async () => {
    order.push("update");
    return { id: "m1" };
  }) as never);
  return order;
}

describe("POST /api/portal/[token]/message", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.mocked(resolveAccess).mockResolvedValue(access);
    vi.mocked(prisma.portalMessage.count).mockResolvedValue(0);
    // One mock serves both lookups: the ownership check (by projectListId) and the latest sender.
    vi.mocked(prisma.delivery.findFirst).mockImplementation((async (args: { where: { projectListId?: string } }) =>
      args.where.projectListId
        ? args.where.projectListId === "list-1"
          ? { id: "d1", projectName: "Spring Launch" }
          : null
        : { senderEmail: "pm@consume-media.com" }) as never);
    vi.mocked(resolveProjectChannel).mockResolvedValue({
      channelId: "C1",
      channelName: "acme-spring",
      source: "confirmed",
      autoMatched: false,
      suggestions: [],
    });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("404s an unknown or revoked token", async () => {
    vi.mocked(resolveAccess).mockResolvedValue(null);
    const res = await post({ name: "Dana", message: "hi" });
    expect(res.status).toBe(404);
    expect(prisma.portalMessage.create).not.toHaveBeenCalled();
  });

  it("400s invalid input, including a malformed body", async () => {
    expect((await post({ message: "hi" })).status).toBe(400);
    expect((await post({ name: "Dana" })).status).toBe(400);
    expect((await post("not json")).status).toBe(400);
    expect((await post({ name: "Dana", message: "x".repeat(2001) })).status).toBe(400);
    expect(prisma.portalMessage.create).not.toHaveBeenCalled();
  });

  it("429s after 5 notes in an hour, before persisting", async () => {
    vi.mocked(prisma.portalMessage.count).mockResolvedValue(5);
    const res = await post({ name: "Dana", message: "hi" });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("Please wait a bit before sending another note");
    expect(prisma.portalMessage.create).not.toHaveBeenCalled();
    const where = vi.mocked(prisma.portalMessage.count).mock.calls[0][0]?.where as { accessId: string };
    expect(where.accessId).toBe("a1");
  });

  it("persists the row, then posts to the project channel, then marks slackOk", async () => {
    const order = trackOrder();
    const res = await post({ name: " Dana ", message: "Can we <move> the call?\nThanks", listId: "list-1" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true });
    expect(order).toEqual(["create", "channel", "update"]);

    expect(prisma.portalMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { accessId: "a1", projectListId: "list-1", name: "Dana", message: "Can we <move> the call?\nThanks" },
      })
    );
    expect(prisma.delivery.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientFolderId: "folder-1", projectListId: "list-1" } })
    );
    expect(resolveProjectChannel).toHaveBeenCalledWith("list-1", "Spring Launch", "Acme");
    const text = vi.mocked(postChannelMessage).mock.calls[0][1];
    expect(text).toContain("Message from Acme via the client portal (Dana):");
    expect(text).toContain("> Can we &lt;move&gt; the call?\n> Thanks");
    expect(text).toMatch(/<http:\/\/localhost\/portal\/tok\/list-1\|Open client portal>/);
    expect(sendSlackDM).not.toHaveBeenCalled();
    expect(prisma.portalMessage.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { slackOk: true } });
  });

  it("DMs the latest delivery's sender when there is no project context", async () => {
    const order = trackOrder();
    const res = await post({ name: "Dana", message: "hi" });
    expect(res.status).toBe(200);
    expect(order).toEqual(["create", "dm", "update"]);
    expect(prisma.delivery.findFirst).toHaveBeenCalledTimes(1);
    expect(sendSlackDM).toHaveBeenCalledWith("pm@consume-media.com", expect.stringContaining("/portal/tok|"));
  });

  it("falls back to a DM when the project is not in this client's portal", async () => {
    const order = trackOrder();
    await post({ name: "Dana", message: "hi", listId: "other-list" });
    expect(resolveProjectChannel).not.toHaveBeenCalled();
    expect(order).toEqual(["create", "dm", "update"]);
    // The foreign list id is not recorded against the note and the DM links to the client root.
    expect(prisma.portalMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ projectListId: null }) })
    );
    expect(sendSlackDM).toHaveBeenCalledWith("pm@consume-media.com", expect.stringContaining("/portal/tok|"));
  });

  it("falls back to a DM when the channel post fails", async () => {
    const order = trackOrder();
    vi.mocked(postChannelMessage).mockResolvedValue(null);
    await post({ name: "Dana", message: "hi", listId: "list-1" });
    expect(order).toEqual(["create", "dm", "update"]);
  });

  it("still returns ok with the row kept when every Slack path fails", async () => {
    trackOrder();
    vi.mocked(postChannelMessage).mockResolvedValue(null);
    vi.mocked(sendSlackDM).mockResolvedValue(false);
    const res = await post({ name: "Dana", message: "hi", listId: "list-1" });
    expect(res.status).toBe(200);
    expect(prisma.portalMessage.create).toHaveBeenCalledTimes(1);
    expect(prisma.portalMessage.update).not.toHaveBeenCalled();
  });

  it("keeps the row and returns ok when Slack throws", async () => {
    trackOrder();
    vi.mocked(resolveProjectChannel).mockRejectedValue(new Error("slack down"));
    vi.mocked(sendSlackDM).mockRejectedValue(new Error("slack down"));
    const res = await post({ name: "Dana", message: "hi", listId: "list-1" });
    expect(res.status).toBe(200);
    expect(prisma.portalMessage.update).not.toHaveBeenCalled();
  });

  it("500s when the row cannot be written", async () => {
    vi.mocked(prisma.portalMessage.create).mockRejectedValue(new Error("db down"));
    const res = await post({ name: "Dana", message: "hi" });
    expect(res.status).toBe(500);
    expect(postChannelMessage).not.toHaveBeenCalled();
    expect(sendSlackDM).not.toHaveBeenCalled();
  });
});
