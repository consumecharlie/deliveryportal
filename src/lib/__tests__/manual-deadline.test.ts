import { describe, it, expect } from "vitest";
import {
  formatManualDeadline,
  deadlineMsToInputs,
  formatFeedbackDeadline,
} from "@/lib/feedback-deadline";

describe("formatManualDeadline", () => {
  it("returns empty for an empty date", () => {
    expect(formatManualDeadline("", "")).toEqual({ formattedDate: "", timeLabel: "" });
    expect(formatManualDeadline("", "14:30")).toEqual({ formattedDate: "", timeLabel: "" });
  });

  it("formats a date-only deadline (no time)", () => {
    const out = formatManualDeadline("2026-08-20", "");
    expect(out.formattedDate).toBe("Thu, Aug 20");
    expect(out.timeLabel).toBe("");
  });

  it("formats a timed deadline with an ET label", () => {
    expect(formatManualDeadline("2026-08-20", "14:30").timeLabel).toBe("2:30 PM ET");
    expect(formatManualDeadline("2026-12-01", "09:05").timeLabel).toBe("9:05 AM ET");
    expect(formatManualDeadline("2026-12-01", "00:00").timeLabel).toBe("12:00 AM ET");
  });

  it("does not shift the calendar date by timezone", () => {
    // Late-evening time must still report the same calendar day.
    expect(formatManualDeadline("2026-08-20", "23:30").formattedDate).toBe("Thu, Aug 20");
  });
});

describe("deadlineMsToInputs", () => {
  it("returns empty for null/invalid input", () => {
    expect(deadlineMsToInputs(null)).toEqual({ date: "", time: "" });
    expect(deadlineMsToInputs("")).toEqual({ date: "", time: "" });
  });

  it("treats the 08:00 UTC sentinel as date-only (no time)", () => {
    const ms = Date.UTC(2026, 7, 20, 8, 0, 0); // 2026-08-20T08:00:00Z
    expect(deadlineMsToInputs(ms)).toEqual({ date: "2026-08-20", time: "" });
  });

  it("extracts the Eastern-time wall clock for a real time", () => {
    const ms = Date.UTC(2026, 7, 20, 18, 30, 0); // 18:30Z = 14:30 EDT
    expect(deadlineMsToInputs(ms)).toEqual({ date: "2026-08-20", time: "14:30" });
  });
});

describe("round-trip stays consistent with formatFeedbackDeadline", () => {
  it("a detected timed deadline reformats identically via the manual path", () => {
    const ms = Date.UTC(2026, 7, 20, 18, 30, 0);
    const detected = formatFeedbackDeadline(ms);
    const { date, time } = deadlineMsToInputs(ms);
    expect(formatManualDeadline(date, time)).toEqual(detected);
  });
});
