import { describe, it, expect } from "vitest";
import {
  buildTimeline,
  stripMentions,
  type TimelineDelivery,
} from "@/lib/portal-timeline";

function d(over: Partial<TimelineDelivery>): TimelineDelivery {
  return {
    id: "x",
    projectListId: "L1",
    projectName: "Proj",
    deliverableType: "AV Script V1",
    department: "Pre-Pro",
    sentAt: new Date("2026-06-01T15:00:00Z"),
    emailContent: "Hi",
    slackContent: null,
    replacesDeliveryId: null,
    links: [],
    feedbackWindows: "",
    ...over,
  };
}

describe("stripMentions", () => {
  it("replaces slack + tiptap mention tokens with names, unknown -> 'you'", () => {
    const names = { U1: "Whitney" };
    expect(stripMentions("Hey <@U1> and @[dana](U2)!", names)).toBe("Hey Whitney and you!");
  });
});

describe("buildTimeline", () => {
  it("groups project -> deliverable -> versions newest first", () => {
    // "b" is a different deliverable from "a" (not a later version of it), so
    // the project shows two cards ordered by most recent send.
    const t = buildTimeline([
      d({ id: "a", deliverableType: "AV Script V1", sentAt: new Date("2026-06-01") }),
      d({ id: "b", deliverableType: "Storyboard V1", sentAt: new Date("2026-06-05") }),
      d({ id: "c", projectListId: "L2", projectName: "Other", sentAt: new Date("2026-05-01") }),
    ], {});
    expect(t.projects.map((p) => p.listId)).toEqual(["L1", "L2"]); // most recent activity first
    expect(t.projects[0].deliverables.map((g) => g.latest.id)).toEqual(["b", "a"]);
  });

  it("a resend replaces its original", () => {
    const t = buildTimeline([
      d({ id: "orig", sentAt: new Date("2026-06-01") }),
      d({ id: "fix", replacesDeliveryId: "orig", sentAt: new Date("2026-06-02") }),
    ], {});
    const all = t.projects[0].deliverables.flatMap((g) => [g.latest, ...g.history]);
    expect(all.map((x) => x.id)).toEqual(["fix"]);
  });

  it("stacks the same deliverable family as history", () => {
    const t = buildTimeline([
      d({ id: "v1", deliverableType: "Edit V1", sentAt: new Date("2026-06-01") }),
      d({ id: "v2", deliverableType: "Edit V2", sentAt: new Date("2026-06-08") }),
      d({ id: "f", deliverableType: "Final Delivery", sentAt: new Date("2026-06-15") }),
    ], {});
    const g = t.projects[0].deliverables;
    expect(g).toHaveLength(1);
    expect(g[0].family).toBe("Edit");
    expect(g[0].latest.id).toBe("f");
    expect(g[0].history.map((x) => x.id)).toEqual(["v2", "v1"]);
  });

  it("uses slack body with mentions stripped when there is no email body", () => {
    const t = buildTimeline([d({ emailContent: "", slackContent: "Hi <@U1>", })], { U1: "Sam" });
    expect(t.projects[0].deliverables[0].latest.body).toBe("Hi Sam");
  });
});
