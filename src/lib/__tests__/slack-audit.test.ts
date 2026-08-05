import { afterEach, describe, expect, it, vi } from "vitest";
import { getChannelMembership, joinChannel } from "@/lib/slack-audit";

function mockFetch(payload: unknown) {
  const fn = vi.fn().mockResolvedValue({ json: async () => payload });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getChannelMembership", () => {
  it("maps a successful conversations.info response", async () => {
    mockFetch({ ok: true, channel: { name: "acme", is_member: true, is_private: false } });
    const result = await getChannelMembership("C123");
    expect(result).toEqual({
      channelId: "C123",
      name: "acme",
      isMember: true,
      isPrivate: false,
      notVisible: false,
    });
  });

  it("maps channel_not_found to notVisible", async () => {
    mockFetch({ ok: false, error: "channel_not_found" });
    const result = await getChannelMembership("C404");
    expect(result.isMember).toBe(false);
    expect(result.notVisible).toBe(true);
    expect(result.name).toBeNull();
  });

  it("maps a non-member visible channel", async () => {
    mockFetch({ ok: true, channel: { is_member: false } });
    const result = await getChannelMembership("C555");
    expect(result.isMember).toBe(false);
    expect(result.notVisible).toBe(false);
  });
});

describe("joinChannel", () => {
  it("returns ok:true on success", async () => {
    mockFetch({ ok: true });
    expect(await joinChannel("C123")).toEqual({ ok: true, error: undefined });
  });

  it("returns ok:false with error on failure", async () => {
    mockFetch({ ok: false, error: "method_not_supported_for_channel_type" });
    expect(await joinChannel("C999")).toEqual({
      ok: false,
      error: "method_not_supported_for_channel_type",
    });
  });
});
