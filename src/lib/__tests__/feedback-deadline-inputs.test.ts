import { describe, it, expect } from "vitest";
import {
  etDateToDateOnlyMs,
  etInputsToMs,
  deadlineMsToInputs,
  formatFeedbackDeadline,
  resolveDraftDeadlineInputs,
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

describe("resolveDraftDeadlineInputs", () => {
  const detected = { date: "2026-09-08", time: "" };

  it("ignores a draft's empty date so a now-detectable deadline wins", () => {
    // The real case: task 86akand3t had a Sep 8 deadline but its draft stored
    // "", blanking the field on every resume.
    expect(resolveDraftDeadlineInputs({ date: "", time: "" }, detected)).toEqual(detected);
  });

  it("ignores a missing date the same way", () => {
    expect(resolveDraftDeadlineInputs({}, detected)).toEqual(detected);
    expect(resolveDraftDeadlineInputs({ date: null }, detected)).toEqual(detected);
  });

  it("keeps a deliberately chosen date", () => {
    expect(resolveDraftDeadlineInputs({ date: "2026-09-10", time: "14:00" }, detected)).toEqual({
      date: "2026-09-10",
      time: "14:00",
    });
  });

  it("round-trips an explicitly cleared time alongside a set date", () => {
    expect(
      resolveDraftDeadlineInputs({ date: "2026-09-10", time: "" }, { date: "2026-09-08", time: "09:00" })
    ).toEqual({ date: "2026-09-10", time: "" });
  });

  it("stays blank when nothing was detected either", () => {
    // "Final Delivery" tasks legitimately have no deadline sibling.
    expect(resolveDraftDeadlineInputs({ date: "", time: "" }, { date: "", time: "" })).toEqual({
      date: "",
      time: "",
    });
  });
});
