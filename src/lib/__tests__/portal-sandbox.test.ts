import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isPortalSandbox,
  sandboxPrefix,
  sandboxSlackEmail,
  describeDestination,
  sandboxSlackText,
  sandboxComment,
  sandboxSlackDeliver,
  DEFAULT_SANDBOX_SLACK_EMAIL,
} from "@/lib/portal-sandbox";
import { sendSlackDM } from "@/lib/slack-dm";

vi.mock("@/lib/slack-dm", () => ({ sendSlackDM: vi.fn(), postChannelMessage: vi.fn() }));

describe("portal sandbox", () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("is on only when PORTAL_SANDBOX is exactly '1'", () => {
    delete process.env.PORTAL_SANDBOX;
    expect(isPortalSandbox()).toBe(false);
    process.env.PORTAL_SANDBOX = "true";
    expect(isPortalSandbox()).toBe(false);
    process.env.PORTAL_SANDBOX = "1";
    expect(isPortalSandbox()).toBe(true);
  });

  it("has a fixed prefix and a configurable owner", () => {
    expect(sandboxPrefix()).toBe("[Portal sandbox test] ");
    delete process.env.PORTAL_SANDBOX_SLACK_EMAIL;
    expect(sandboxSlackEmail()).toBe(DEFAULT_SANDBOX_SLACK_EMAIL);
    process.env.PORTAL_SANDBOX_SLACK_EMAIL = " someone@consume-media.com ";
    expect(sandboxSlackEmail()).toBe("someone@consume-media.com");
  });

  it("describes destinations and builds the redirected text", () => {
    expect(describeDestination({ kind: "channel", channelId: "C1", channelName: "callrail-wiggam-law-virtual-testimonial" })).toBe("#callrail-wiggam-law-virtual-testimonial");
    expect(describeDestination({ kind: "channel", channelId: "C1", channelName: null, threadTs: "1.2" })).toBe("channel C1 (in thread)");
    expect(describeDestination({ kind: "dm", email: "pm@consume-media.com" })).toBe("a DM to pm@consume-media.com");
    expect(describeDestination({ kind: "none" })).toBe("nowhere (no channel or sender resolved)");
    expect(sandboxSlackText({ kind: "channel", channelId: "C1", channelName: "#proj" }, "Hello *there*")).toBe(
      "[Portal sandbox test] Would have posted to #proj.\n\nHello *there*"
    );
  });

  it("prefixes ClickUp comments only in sandbox", () => {
    delete process.env.PORTAL_SANDBOX;
    expect(sandboxComment("Marking complete.")).toBe("Marking complete.");
    process.env.PORTAL_SANDBOX = "1";
    expect(sandboxComment("Marking complete.")).toBe("[Portal sandbox test] Marking complete.");
  });

  it("delivers one DM to the owner with the intended destination and reports its result", async () => {
    process.env.PORTAL_SANDBOX_SLACK_EMAIL = "owner@consume-media.com";
    vi.mocked(sendSlackDM).mockResolvedValueOnce(true);
    expect(await sandboxSlackDeliver({ kind: "dm", email: "sender@consume-media.com" }, "Note")).toBe(true);
    expect(sendSlackDM).toHaveBeenCalledWith(
      "owner@consume-media.com",
      "[Portal sandbox test] Would have posted to a DM to sender@consume-media.com.\n\nNote"
    );
    vi.mocked(sendSlackDM).mockResolvedValueOnce(false);
    expect(await sandboxSlackDeliver({ kind: "none" }, "Note")).toBe(false);
  });
});
