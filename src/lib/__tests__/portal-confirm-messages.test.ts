import { describe, it, expect } from "vitest";
import {
  slackConfirmText,
  slackUndoText,
  clickupConfirmComment,
  clickupUndoComment,
  type ConfirmContext,
} from "@/lib/portal-confirm-messages";
import { isDoubleClick, DOUBLE_CLICK_MS } from "@/lib/portal-confirm-guard";

const ctx: ConfirmContext = {
  clientName: "CallRail",
  projectName: "CallRail Wiggam Law Virtual Testimonial",
  deliverableType: "Edit V1",
  confirmedByName: "Dana",
  portalUrl: "https://portal.example.com/portal/abc",
  deadlineLabel: "Tue, Sep 9",
};

describe("portal confirm message builders", () => {
  it("slackConfirmText names client, deliverable, project, person, deadline and link", () => {
    const t = slackConfirmText(ctx);
    expect(t).toContain("*CallRail* confirmed all feedback is in");
    expect(t).toContain("*Edit V1*");
    expect(t).toContain("*CallRail Wiggam Law Virtual Testimonial*");
    expect(t).toContain("(Dana)");
    expect(t).toContain("Deadline was Tue, Sep 9");
    expect(t).toContain("<https://portal.example.com/portal/abc|Open client portal>");
  });

  it("slackConfirmText omits the person when no name was given", () => {
    const t = slackConfirmText({ ...ctx, confirmedByName: null });
    expect(t).not.toContain("(");
    expect(t).toContain("*CallRail Wiggam Law Virtual Testimonial*.");
  });

  it("slackUndoText says feedback was reopened and links the portal", () => {
    const t = slackUndoText(ctx);
    expect(t).toContain("reopened feedback on *Edit V1*");
    expect(t).toContain("The feedback window is extended.");
    expect(t).toContain("|Open client portal>");
  });

  it("clickupConfirmComment credits the person and marks complete", () => {
    expect(clickupConfirmComment(ctx)).toBe(
      "Client confirmed all feedback is in via the client portal by Dana. Marking this feedback deadline complete."
    );
    expect(clickupConfirmComment({ ...ctx, confirmedByName: null })).toContain("via the client portal. Marking");
  });

  it("clickupUndoComment is the fixed reopen note", () => {
    expect(clickupUndoComment()).toContain("Reopening this feedback deadline.");
  });
});

describe("isDoubleClick", () => {
  const now = Date.UTC(2026, 8, 3, 12, 0, 0);

  it("is false with no prior activity", () => {
    expect(isDoubleClick(null, now)).toBe(false);
  });

  it("is true inside the guard window", () => {
    expect(isDoubleClick(new Date(now - 1), now)).toBe(true);
    expect(isDoubleClick(new Date(now - DOUBLE_CLICK_MS + 1), now)).toBe(true);
  });

  it("is false at or beyond the window", () => {
    expect(isDoubleClick(new Date(now - DOUBLE_CLICK_MS), now)).toBe(false);
    expect(isDoubleClick(new Date(now - 60_000), now)).toBe(false);
  });

  it("ignores a timestamp in the future (clock skew)", () => {
    expect(isDoubleClick(new Date(now + 5_000), now)).toBe(false);
  });
});
