import { describe, it, expect } from "vitest";
import {
  describeFeedbackConflict,
  evaluateFeedbackConflict,
  windowBusinessDays,
  windowLabelForDays,
} from "@/lib/feedback-conflict";

// ClickUp stores date-only due dates at 08:00 UTC (see feedback-deadline.ts).
const dateOnly = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 8, 0, 0);

describe("windowBusinessDays", () => {
  it.each([
    ["Same day", 0],
    ["24 Hours", 1],
    ["48 Hours", 2],
    ["72 Hours", 3],
    ["48 hours", 2],
    ["  48 Hours  ", 2],
    ["2 business days", 2],
    ["3 days", 3],
  ])("maps %s to %i business days", (label, expected) => {
    expect(windowBusinessDays(label as string)).toBe(expected);
  });

  it.each(["Flexible", "flexible", "", "   ", "12 Hours", "ASAP", "whenever"])(
    "returns null for %s rather than guessing",
    (label) => {
      expect(windowBusinessDays(label)).toBeNull();
    }
  );
});

describe("windowLabelForDays", () => {
  const options = [
    { value: "Same day", label: "Same day" },
    { value: "24 Hours", label: "24 Hours" },
    { value: "48 Hours", label: "48 Hours" },
  ];

  it("finds the option matching a day count", () => {
    expect(windowLabelForDays(1, options)).toBe("24 Hours");
    expect(windowLabelForDays(0, options)).toBe("Same day");
  });

  it("returns null when no option fits, since we cannot create one", () => {
    expect(windowLabelForDays(5, options)).toBeNull();
    expect(windowLabelForDays(null, options)).toBeNull();
    expect(windowLabelForDays(1, [])).toBeNull();
  });
});

describe("evaluateFeedbackConflict", () => {
  it("reproduces the KeyBank incident as a one-day shortfall", () => {
    // Storyboards V2, delivery due Wed Sep 2 2026, window said 48 Hours,
    // feedback deadline was Thu Sep 3. The client got 24 hours, not 48.
    const result = evaluateFeedbackConflict({
      feedbackWindows: "48 Hours",
      anchorMs: dateOnly(2026, 9, 2),
      deadlineDate: "2026-09-03",
    });
    expect(result.status).toBe("conflict");
    expect(result.anchorDate).toBe("2026-09-02");
    expect(result.expectedDate).toBe("2026-09-04");
    expect(result.actualDate).toBe("2026-09-03");
    expect(result.deltaDays).toBe(-1);
    expect(result.actualWindowDays).toBe(1); // what the client actually got
  });

  it("accepts the corrected window the PM applied", () => {
    const result = evaluateFeedbackConflict({
      feedbackWindows: "24 Hours",
      anchorMs: dateOnly(2026, 9, 2),
      deadlineDate: "2026-09-03",
    });
    expect(result.status).toBe("ok");
    expect(result.deltaDays).toBe(0);
  });

  it("flags a deadline that is later than promised too", () => {
    const result = evaluateFeedbackConflict({
      feedbackWindows: "24 Hours",
      anchorMs: dateOnly(2026, 9, 2),
      deadlineDate: "2026-09-04",
    });
    expect(result.status).toBe("conflict");
    expect(result.deltaDays).toBe(1);
  });

  it("counts business days, not calendar days, across a weekend", () => {
    // Thu Sep 10 + 48 Hours = Mon Sep 14, not Sat Sep 12.
    const result = evaluateFeedbackConflict({
      feedbackWindows: "48 Hours",
      anchorMs: dateOnly(2026, 9, 10),
      deadlineDate: "2026-09-14",
    });
    expect(result.status).toBe("ok");
    expect(result.expectedDate).toBe("2026-09-14");
  });

  it("skips Labor Day", () => {
    // Fri Sep 4 + 24 Hours lands on Mon Sep 7 (Labor Day) -> Tue Sep 8.
    const result = evaluateFeedbackConflict({
      feedbackWindows: "24 Hours",
      anchorMs: dateOnly(2026, 9, 4),
      deadlineDate: "2026-09-08",
    });
    expect(result.status).toBe("ok");
    expect(result.expectedDate).toBe("2026-09-08");
  });

  it("honours a one-off company closure", () => {
    const result = evaluateFeedbackConflict({
      feedbackWindows: "24 Hours",
      anchorMs: dateOnly(2026, 3, 16), // Mon Mar 16
      deadlineDate: "2026-03-18",
      extraClosures: ["2026-03-17"],
    });
    expect(result.status).toBe("ok");
  });

  it("rolls a weekend anchor forward before counting", () => {
    // Sat Sep 5 delivery, 24 Hours: counting starts Mon Sep 7, which is Labor
    // Day, so the first working day is Tue Sep 8 and the deadline is Wed Sep 9.
    const result = evaluateFeedbackConflict({
      feedbackWindows: "24 Hours",
      anchorMs: dateOnly(2026, 9, 5),
      deadlineDate: "2026-09-09",
    });
    expect(result.status).toBe("ok");
    expect(result.anchorDate).toBe("2026-09-05");
    expect(result.expectedDate).toBe("2026-09-09");
  });

  it("compares dates only, ignoring a real time-of-day on the deadline", () => {
    const result = evaluateFeedbackConflict({
      feedbackWindows: "48 Hours",
      anchorMs: Date.UTC(2026, 8, 2, 20, 0, 0), // Sep 2, 4pm ET, a timed due date
      deadlineDate: "2026-09-04",
    });
    expect(result.status).toBe("ok");
    expect(result.anchorDate).toBe("2026-09-02");
  });

  it("stays silent on Flexible, which promises no window", () => {
    const result = evaluateFeedbackConflict({
      feedbackWindows: "Flexible",
      anchorMs: dateOnly(2026, 9, 2),
      deadlineDate: "2026-09-30",
    });
    expect(result.status).toBe("unknown");
    expect(result.windowDays).toBeNull();
  });

  it.each(["", "ASAP", "12 Hours"])("stays silent on the unrecognized label %s", (label) => {
    expect(
      evaluateFeedbackConflict({
        feedbackWindows: label,
        anchorMs: dateOnly(2026, 9, 2),
        deadlineDate: "2026-09-03",
      }).status
    ).toBe("unknown");
  });

  it("stays silent when there is no deadline to compare", () => {
    const result = evaluateFeedbackConflict({
      feedbackWindows: "48 Hours",
      anchorMs: dateOnly(2026, 9, 2),
      deadlineDate: "",
    });
    expect(result.status).toBe("unknown");
  });

  it("falls back to the send moment when the task has no due date", () => {
    // Ad-hoc deliveries have no Delivery Deadline task at all.
    const result = evaluateFeedbackConflict({
      feedbackWindows: "48 Hours",
      anchorMs: null,
      nowMs: Date.UTC(2026, 8, 2, 19, 19, 0), // Sep 2, 3:19pm ET
      deadlineDate: "2026-09-03",
    });
    expect(result.status).toBe("conflict");
    expect(result.anchorFallback).toBe(true);
    expect(result.anchorDate).toBe("2026-09-02");
    expect(result.expectedDate).toBe("2026-09-04");
  });

  it("stays silent when it has no anchor at all", () => {
    expect(
      evaluateFeedbackConflict({ feedbackWindows: "48 Hours", deadlineDate: "2026-09-03" }).status
    ).toBe("unknown");
  });

  it("reports actualWindowDays as null when the deadline lands on a weekend", () => {
    const result = evaluateFeedbackConflict({
      feedbackWindows: "48 Hours",
      anchorMs: dateOnly(2026, 9, 2),
      deadlineDate: "2026-09-05", // Saturday
    });
    expect(result.status).toBe("conflict");
    expect(result.actualWindowDays).toBeNull();
  });
});

describe("describeFeedbackConflict", () => {
  const dateOnlyMs = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 8, 0, 0);

  it("words the KeyBank shortfall in plain terms", () => {
    const result = evaluateFeedbackConflict({
      feedbackWindows: "48 Hours",
      anchorMs: dateOnlyMs(2026, 9, 2),
      deadlineDate: "2026-09-03",
    });
    const copy = describeFeedbackConflict(result, "48 Hours");
    expect(copy).toEqual({
      headline: "48 Hours does not match the Thu, Sep 3 deadline.",
      detail: "Delivery was due Wed, Sep 2, so a 48 Hours window ends Fri, Sep 4.",
      consequence: "The client is being told 48 Hours but given 1 business day.",
    });
  });

  it("words the too-generous direction differently", () => {
    const result = evaluateFeedbackConflict({
      feedbackWindows: "24 Hours",
      anchorMs: dateOnlyMs(2026, 9, 2),
      deadlineDate: "2026-09-04",
    });
    expect(describeFeedbackConflict(result, "24 Hours")?.consequence).toBe(
      "The client is being given more time than the message promises."
    );
  });

  it("says it is counting from today when there is no delivery due date", () => {
    const result = evaluateFeedbackConflict({
      feedbackWindows: "48 Hours",
      anchorMs: null,
      nowMs: Date.UTC(2026, 8, 2, 19, 19, 0),
      deadlineDate: "2026-09-03",
    });
    expect(describeFeedbackConflict(result, "48 Hours")?.detail).toBe(
      "Counting from today (Wed, Sep 2), a 48 Hours window ends Fri, Sep 4."
    );
  });

  it("returns nothing when there is no conflict", () => {
    const ok = evaluateFeedbackConflict({
      feedbackWindows: "24 Hours",
      anchorMs: dateOnlyMs(2026, 9, 2),
      deadlineDate: "2026-09-03",
    });
    expect(describeFeedbackConflict(ok, "24 Hours")).toBeNull();
  });
});
