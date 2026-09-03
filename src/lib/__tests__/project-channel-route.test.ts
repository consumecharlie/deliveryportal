import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { projectChannel: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() } },
}));
vi.mock("@/lib/get-session-user", () => ({ getSessionUserEmail: vi.fn() }));
vi.mock("@/lib/project-channel", () => ({ resolveProjectChannel: vi.fn(), rankProjectChannels: vi.fn() }));
vi.mock("@/lib/slack-audit", () => ({ getChannelMembership: vi.fn(), joinChannel: vi.fn() }));

import { prisma } from "@/lib/db";
import { getSessionUserEmail } from "@/lib/get-session-user";
import { getChannelMembership, joinChannel } from "@/lib/slack-audit";
import { PUT } from "@/app/api/settings/project-channel/route";

function put(body: unknown) {
  return new Request("http://localhost/api/settings/project-channel", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const visible = { channelId: "C1", name: "acme", isMember: false, isPrivate: false, isShared: false, notVisible: false };

describe("PUT /api/settings/project-channel", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(getSessionUserEmail).mockResolvedValue("pm@consume-media.com");
    vi.mocked(getChannelMembership).mockResolvedValue(visible);
    vi.mocked(joinChannel).mockResolvedValue({ ok: true });
    vi.mocked(prisma.projectChannel.upsert).mockResolvedValue({ projectListId: "L1" } as never);
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("rejects a channel the bot cannot see", async () => {
    vi.mocked(getChannelMembership).mockResolvedValue({ ...visible, notVisible: true });
    const res = await PUT(put({ listId: "L1", channelId: "C1", channelName: "acme" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("The bot cannot see that channel; invite it first");
    expect(prisma.projectChannel.upsert).not.toHaveBeenCalled();
  });

  it("rejects a Slack Connect channel", async () => {
    vi.mocked(getChannelMembership).mockResolvedValue({ ...visible, isShared: true });
    const res = await PUT(put({ listId: "L1", channelId: "C1", channelName: "acme" }));
    expect(res.status).toBe(400);
    expect(prisma.projectChannel.upsert).not.toHaveBeenCalled();
  });

  it("upserts with the session email and joins the channel", async () => {
    const res = await PUT(put({ listId: "L1", channelId: "C1", channelName: "acme" }));
    expect(res.status).toBe(200);
    const call = vi.mocked(prisma.projectChannel.upsert).mock.calls[0][0];
    expect(call.where).toEqual({ projectListId: "L1" });
    expect(call.update).toMatchObject({ channelId: "C1", channelName: "acme", autoMatched: false, confirmedBy: "pm@consume-media.com" });
    expect(joinChannel).toHaveBeenCalledWith("C1");
    expect((await res.json()).joined).toBe(true);
  });

  it("400s on a missing field", async () => {
    const res = await PUT(put({ listId: "L1", channelId: "C1" }));
    expect(res.status).toBe(400);
  });
});
