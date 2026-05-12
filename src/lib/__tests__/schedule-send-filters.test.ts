import { describe, it, expect } from "vitest";
import {
  findDueDrafts,
  findStaleDrafts,
  type SchedulableDraft,
} from "../schedule-send";

const minutesFromNow = (mins: number) =>
  new Date(Date.now() + mins * 60_000);

const baseDraft: SchedulableDraft = {
  id: "d1",
  taskId: "t1",
  savedBy: "user@x.com",
  scheduledFor: null,
  scheduleStatus: null,
  scheduledPayload: null,
};

describe("findDueDrafts", () => {
  it("returns drafts whose scheduledFor is now or in the past and status is scheduled", () => {
    const drafts: SchedulableDraft[] = [
      { ...baseDraft, id: "due", scheduledFor: minutesFromNow(-1), scheduleStatus: "scheduled" },
      { ...baseDraft, id: "future", scheduledFor: minutesFromNow(10), scheduleStatus: "scheduled" },
      { ...baseDraft, id: "firing", scheduledFor: minutesFromNow(-1), scheduleStatus: "firing" },
      { ...baseDraft, id: "no-schedule", scheduledFor: null, scheduleStatus: null },
    ];
    expect(findDueDrafts(drafts, new Date()).map((d) => d.id)).toEqual(["due"]);
  });

  it("returns an empty array when nothing is due", () => {
    const drafts: SchedulableDraft[] = [
      { ...baseDraft, id: "future", scheduledFor: minutesFromNow(10), scheduleStatus: "scheduled" },
    ];
    expect(findDueDrafts(drafts, new Date())).toEqual([]);
  });
});

describe("findStaleDrafts", () => {
  it("returns drafts more than 30 min past their scheduledFor that are still scheduled or firing", () => {
    const drafts: SchedulableDraft[] = [
      { ...baseDraft, id: "fresh-due", scheduledFor: minutesFromNow(-5), scheduleStatus: "scheduled" },
      { ...baseDraft, id: "stale-scheduled", scheduledFor: minutesFromNow(-45), scheduleStatus: "scheduled" },
      { ...baseDraft, id: "stale-firing", scheduledFor: minutesFromNow(-45), scheduleStatus: "firing" },
      { ...baseDraft, id: "no-schedule", scheduledFor: null, scheduleStatus: null },
    ];
    expect(findStaleDrafts(drafts, new Date()).map((d) => d.id).sort()).toEqual([
      "stale-firing",
      "stale-scheduled",
    ]);
  });
});
