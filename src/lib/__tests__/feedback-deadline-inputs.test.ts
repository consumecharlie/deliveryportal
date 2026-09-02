import { describe, it, expect } from "vitest";
import {
  etDateToDateOnlyMs,
  etInputsToMs,
  deadlineMsToInputs,
  formatFeedbackDeadline,
} from "@/lib/feedback-deadline";

describe("etDateToDateOnlyMs", () => {
  it("builds the 08:00 UTC sentinel ClickUp normalizes to", () => {
    expect(etDateToDateOnlyMs("2026-09-04")).toBe(Date.UTC(2026, 8, 4, 8, 0, 0));
  });

  it("keeps the message on 'EOD' with no time label", () => {
    const { formattedDate, timeLabel } = formatFeedbackDeadline(etDateToDateOnlyMs("2026-09-04"));
    expect(formattedDate).toBe("Fri, Sep 4");
    expect(timeLabel).toBe("");
  });

  it("does not drift a day, the way naive UTC midnight would", () => {
    // Date.UTC(2026, 8, 4) is Sep 3 8pm Eastern; ClickUp files that as Sep 3.
    expect(deadlineMsToInputs(etDateToDateOnlyMs("2026-09-04")).date).toBe("2026-09-04");
    expect(deadlineMsToInputs(Date.UTC(2026, 8, 4)).date).toBe("2026-09-03");
  });
});

describe("etInputsToMs", () => {
  it("converts an Eastern wall time during EDT", () => {
    expect(etInputsToMs("2026-09-04", "12:00")).toBe(Date.UTC(2026, 8, 4, 16, 0)); // UTC-4
  });

  it("converts an Eastern wall time during EST", () => {
    expect(etInputsToMs("2026-01-15", "12:00")).toBe(Date.UTC(2026, 0, 15, 17, 0)); // UTC-5
  });

  it("falls back to the date-only sentinel with no time", () => {
    expect(etInputsToMs("2026-09-04", "")).toBe(etDateToDateOnlyMs("2026-09-04"));
  });

  it("round-trips through deadlineMsToInputs", () => {
    for (const [date, time] of [
      ["2026-09-04", "12:00"],
      ["2026-01-15", "09:30"],
      ["2026-03-08", "14:00"], // US DST spring-forward day
      ["2026-11-01", "14:00"], // US DST fall-back day
    ]) {
      expect(deadlineMsToInputs(etInputsToMs(date, time))).toEqual({ date, time });
    }
  });
});
