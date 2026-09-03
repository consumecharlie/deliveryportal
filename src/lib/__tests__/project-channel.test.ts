import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { projectChannel: { findUnique: vi.fn(), upsert: vi.fn() } },
}));
vi.mock("@/lib/slack-audit", () => ({ listVisibleChannels: vi.fn() }));

import { prisma } from "@/lib/db";
import { listVisibleChannels } from "@/lib/slack-audit";
import { resolveProjectChannel } from "@/lib/project-channel";

const channels = [
  { id: "C1", name: "callrail-wiggam-law-virtual-testimonial", isMember: false, isPrivate: false, isShared: false },
  { id: "C2", name: "callrail-almstead-virtual-testimonial", isMember: false, isPrivate: false, isShared: false },
  { id: "C3", name: "callrail-consume", isMember: true, isPrivate: true, isShared: true },
];

describe("resolveProjectChannel", () => {
  beforeEach(() => {
    vi.mocked(listVisibleChannels).mockResolvedValue(channels);
    vi.mocked(prisma.projectChannel.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.projectChannel.upsert).mockResolvedValue({} as never);
  });
  afterEach(() => vi.clearAllMocks());

  it("an existing PM-confirmed row wins and reports confirmed", async () => {
    vi.mocked(prisma.projectChannel.findUnique).mockResolvedValue({
      projectListId: "L1",
      channelId: "C7",
      channelName: "seven",
      autoMatched: false,
      confirmedBy: "pm@consume-media.com",
      confirmedAt: new Date(),
    });
    const r = await resolveProjectChannel("L1", "CallRail Wiggam Law Virtual Testimonial", "CallRail");
    expect(r).toMatchObject({ channelId: "C7", channelName: "seven", source: "confirmed", autoMatched: false });
    expect(listVisibleChannels).not.toHaveBeenCalled();
    expect(prisma.projectChannel.upsert).not.toHaveBeenCalled();
  });

  it("an existing auto-matched row reports auto", async () => {
    vi.mocked(prisma.projectChannel.findUnique).mockResolvedValue({
      projectListId: "L1",
      channelId: "C1",
      channelName: "callrail-wiggam-law-virtual-testimonial",
      autoMatched: true,
      confirmedBy: "auto-match",
      confirmedAt: new Date(),
    });
    const r = await resolveProjectChannel("L1", "CallRail Wiggam Law Virtual Testimonial", "CallRail");
    expect(r.source).toBe("auto");
    expect(r.autoMatched).toBe(true);
  });

  it("does not persist a confident match by default", async () => {
    const r = await resolveProjectChannel("L1", "CallRail Wiggam Law Virtual Testimonial", "CallRail");
    expect(r).toMatchObject({ channelId: "C1", source: "auto", autoMatched: true });
    expect(prisma.projectChannel.upsert).not.toHaveBeenCalled();
  });

  it("persists a confident match only when asked", async () => {
    const r = await resolveProjectChannel("L1", "CallRail Wiggam Law Virtual Testimonial", "CallRail", {
      persist: true,
    });
    expect(r.source).toBe("auto");
    // Create-only upsert: a concurrent auto-match cannot throw P2002 or clobber the other writer.
    expect(prisma.projectChannel.upsert).toHaveBeenCalledWith({
      where: { projectListId: "L1" },
      create: {
        projectListId: "L1",
        channelId: "C1",
        channelName: "callrail-wiggam-law-virtual-testimonial",
        autoMatched: true,
        confirmedBy: "auto-match",
      },
      update: {},
    });
  });

  it("writes nothing when no candidate is confident, but still suggests", async () => {
    const r = await resolveProjectChannel("L2", "CallRail Virtual Testimonial", "CallRail", { persist: true });
    expect(r).toMatchObject({ channelId: null, source: "none", autoMatched: false });
    expect(r.suggestions.length).toBeGreaterThan(0);
    expect(r.suggestions.every((s) => !s.isShared)).toBe(true);
    expect(prisma.projectChannel.upsert).not.toHaveBeenCalled();
  });
});
