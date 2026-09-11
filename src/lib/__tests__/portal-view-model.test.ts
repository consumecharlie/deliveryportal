import { describe, it, expect } from "vitest";
import { toCardGroup, toCardStatus, pickReviewLink, badgePresentation } from "@/lib/portal-view-model";
import type { DeliverableGroup, TimelineEntry } from "@/lib/portal-timeline";
import type { FeedbackStatus } from "@/lib/portal-status";

function entry(id: string): TimelineEntry {
  return {
    id,
    projectListId: "L1",
    projectName: "Proj",
    deliverableType: "AV Script V1",
    department: "Pre-Pro",
    sentAt: new Date("2026-06-01T15:00:00Z"),
    emailContent: "raw email with <@U1>",
    slackContent: "raw slack",
    replacesDeliveryId: null,
    links: [{ url: "https://f.io/x", label: "Frame", variableName: "frameReviewLink" }],
    feedbackWindows: "48 Hours",
    body: "Client-safe body",
  };
}

describe("toCardGroup", () => {
  it("keeps only what a card renders and drops raw content and internal fields", () => {
    const group: DeliverableGroup = { family: "AV Script", latest: entry("a"), history: [entry("b")] };
    const card = toCardGroup(group);
    expect(card).toEqual({
      family: "AV Script",
      latest: { id: "a", deliverableType: "AV Script V1", sentAt: new Date("2026-06-01T15:00:00Z"), links: [{ url: "https://f.io/x", label: "Frame", variableName: "frameReviewLink" }], body: "Client-safe body" },
      history: [{ id: "b", deliverableType: "AV Script V1", sentAt: new Date("2026-06-01T15:00:00Z"), links: [{ url: "https://f.io/x", label: "Frame", variableName: "frameReviewLink" }], body: "Client-safe body" }],
    });
    for (const e of [card.latest, ...card.history]) {
      expect(e).not.toHaveProperty("emailContent");
      expect(e).not.toHaveProperty("slackContent");
      expect(e).not.toHaveProperty("department");
      expect(e).not.toHaveProperty("feedbackWindows");
      expect(e).not.toHaveProperty("projectListId");
    }
  });
});

describe("toCardStatus", () => {
  it("omits the feedback task id and keeps the presentation fields", () => {
    const status: FeedbackStatus = {
      kind: "awaiting", dueMs: 1, dueLabel: "Tue, Jun 2", source: "clickup", dueIsEstimate: false,
    dueIsEndOfDay: true,
      state: "open", feedbackDeadlineTaskId: "T1", confirmedAt: null, confirmedByName: null,
    };
    const slim = toCardStatus(status);
    expect(slim).not.toHaveProperty("feedbackDeadlineTaskId");
    expect(slim).not.toHaveProperty("source");
    expect(slim).toEqual({ kind: "awaiting", dueLabel: "Tue, Jun 2", dueIsEstimate: false, state: "open", confirmedAt: null, confirmedByName: null });
    expect(toCardStatus(undefined)).toBeUndefined();
  });
});

describe("pickReviewLink", () => {
  const frame = { url: "https://f.io/a", label: "Frame", variableName: "frameReviewLink" };
  const loom = { url: "https://loom.com/b", label: "Loom", variableName: "loomReviewLink" };
  const drive = { url: "https://drive.google.com/c", label: "Drive", variableName: "googleDeliverableLink" };
  const plain = { url: "https://x.com", label: "Other", variableName: null };

  it("prefers Frame.io, then Loom, then the first link", () => {
    expect(pickReviewLink([drive, loom, frame])).toBe(frame);
    expect(pickReviewLink([drive, loom])).toBe(loom);
    expect(pickReviewLink([drive, plain])).toBe(drive);
    expect(pickReviewLink([plain])).toBe(plain);
  });

  it("returns null when there are no links", () => {
    expect(pickReviewLink([])).toBeNull();
  });
});

describe("badgePresentation", () => {
  const base = { dueLabel: "Tue, Jun 2", confirmedAt: null, confirmedByName: null };

  it("renders nothing for a status of none", () => {
    expect(badgePresentation({ ...base, kind: "none", dueIsEstimate: false, state: "open" })).toBeNull();
  });

  it("confirmed is green regardless of the date", () => {
    expect(badgePresentation({ ...base, kind: "confirmed", dueIsEstimate: false, state: "overdue" })).toEqual({ label: "Confirmed", tone: "green" });
  });

  it("a real deadline escalates: amber, then orange on the day, then red", () => {
    expect(badgePresentation({ ...base, kind: "awaiting", dueIsEstimate: false, state: "open" })).toEqual({ label: "Feedback due Tue, Jun 2", tone: "amber" });
    expect(badgePresentation({ ...base, kind: "awaiting", dueIsEstimate: false, state: "due-today" })).toEqual({ label: "Due today", tone: "orange" });
    expect(badgePresentation({ ...base, kind: "awaiting", dueIsEstimate: false, state: "overdue" })).toEqual({ label: "Overdue", tone: "red" });
  });

  it("an estimated date never turns orange or red; it stays a suggestion", () => {
    for (const state of ["open", "due-today", "overdue"] as const) {
      expect(badgePresentation({ ...base, kind: "awaiting", dueIsEstimate: true, state })).toEqual({ label: "Suggested by Tue, Jun 2", tone: "amber" });
    }
  });
});
