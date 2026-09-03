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

  it("handles the labelled slack form <@ID|label>", () => {
    expect(stripMentions("Hi <@U1|whitney> and <@U9|dana>", { U1: "Whitney" })).toBe("Hi Whitney and you");
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

  it("a resend chain A -> B -> C keeps only C", () => {
    const t = buildTimeline([
      d({ id: "A", sentAt: new Date("2026-06-01") }),
      d({ id: "B", replacesDeliveryId: "A", sentAt: new Date("2026-06-02") }),
      d({ id: "C", replacesDeliveryId: "B", sentAt: new Date("2026-06-03") }),
    ], {});
    const all = t.projects[0].deliverables.flatMap((g) => [g.latest, ...g.history]);
    expect(all.map((x) => x.id)).toEqual(["C"]);
  });

  it("a resend whose original is not in the set still appears", () => {
    const t = buildTimeline([d({ id: "fix", replacesDeliveryId: "gone" })], {});
    expect(t.projects[0].deliverables[0].latest.id).toBe("fix");
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

  it("keeps ad-hoc deliveries with no list id apart by project name", () => {
    const t = buildTimeline([
      d({ id: "a", projectListId: null, projectName: "Alpha", sentAt: new Date("2026-06-01") }),
      d({ id: "b", projectListId: null, projectName: "Beta", sentAt: new Date("2026-06-02") }),
      d({ id: "a2", projectListId: null, projectName: "Alpha", deliverableType: "Storyboard V1", sentAt: new Date("2026-06-03") }),
    ], {});
    expect(t.projects.map((p) => p.name)).toEqual(["Alpha", "Beta"]);
    expect(t.projects.map((p) => p.listId)).toEqual(["", ""]);
    expect(t.projects[0].deliverables).toHaveLength(2);
  });

  it("names the project after its most recent delivery", () => {
    const t = buildTimeline([
      d({ id: "new", projectName: "Proj (renamed)", deliverableType: "Storyboard V1", sentAt: new Date("2026-06-09") }),
      d({ id: "old", projectName: "Proj", sentAt: new Date("2026-06-01") }),
    ].reverse(), {});
    expect(t.projects[0].name).toBe("Proj (renamed)");
  });

  it("orders deterministically when timestamps tie", () => {
    const same = new Date("2026-06-01");
    const t = buildTimeline([
      d({ id: "z", deliverableType: "Storyboard V1", sentAt: same }),
      d({ id: "y", deliverableType: "AV Script V1", sentAt: same }),
      d({ id: "b2", projectListId: "L2", projectName: "Other", sentAt: same }),
      d({ id: "b1", projectListId: "L0", projectName: "Other", sentAt: same }),
    ], {});
    expect(t.projects.map((p) => p.listId)).toEqual(["L0", "L1", "L2"]);
    expect(t.projects[1].deliverables.map((g) => g.latest.id)).toEqual(["y", "z"]);
  });

  it("uses slack body with mentions stripped when there is no email body", () => {
    const t = buildTimeline([d({ emailContent: "", slackContent: "Hi <@U1>", })], { U1: "Sam" });
    expect(t.projects[0].deliverables[0].latest.body).toBe("Hi Sam");
  });
});
