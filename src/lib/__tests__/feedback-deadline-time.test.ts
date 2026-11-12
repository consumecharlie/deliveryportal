import { describe, it, expect } from "vitest";
import {
  formatFeedbackDeadline,
  deadlineMsToInputs,
  etDateToDateOnlyMs,
  etInputsToMs,
  isDateOnlyMs,
} from "@/lib/feedback-deadline";
import { mergeTemplate } from "@/lib/template-merge";

// ClickUp stores a date-only due date at 4:00 AM Eastern (08:00 UTC in August); a real
// time is any other UTC time-of-day.
const DATE_ONLY_MS = Date.UTC(2026, 7, 4, 8, 0, 0); // Aug 4, 08:00 UTC
const NOON_ET_MS = Date.UTC(2026, 7, 4, 16, 0, 0); // Aug 4, 16:00 UTC = 12:00 PM EDT

describe("formatFeedbackDeadline", () => {
  it("returns no time for a date-only (08:00 UTC) deadline", () => {
    const { formattedDate, timeLabel } = formatFeedbackDeadline(DATE_ONLY_MS);
    expect(formattedDate).toBe("Tue, Aug 4");
    expect(timeLabel).toBe("");
  });

  it("surfaces the ET time for a deadline with a real time", () => {
    const { formattedDate, timeLabel } = formatFeedbackDeadline(NOON_ET_MS);
    expect(formattedDate).toBe("Tue, Aug 4");
    expect(timeLabel).toBe("12:00 PM ET");
  });

  it("handles null/empty", () => {
    expect(formatFeedbackDeadline(null)).toEqual({
      formattedDate: "",
      timeLabel: "",
    });
  });
});

const TEMPLATE = [
  "## Scope & Timeline Reminders",
  "- **Revision Rounds:** [revisionRounds]",
  "- **Feedback Windows:** [feedbackWindows]",
  "- **Feedback Deadline:** EOD [nextFeedbackDeadline]",
  "- Additional revisions beyond the included revision rounds will require a scope adjustment.",
].join("\n");

function baseVars(overrides: Record<string, unknown> = {}) {
  return {
    contacts: [{ name: "Jane Doe", role: "Primary" as const }],
    projectName: "AODocs Product Demo",
    versionNotes: "",
    revisionRounds: "2 of 3",
    feedbackWindows: "48 Hours",
    nextFeedbackDeadline: "Tue, Aug 4",
    ...overrides,
  };
}

describe("timed feedback deadline in merge", () => {
  it("shows the time and drops EOD when a time is set", () => {
    const { emailContent } = mergeTemplate(
      TEMPLATE,
      "subj",
      baseVars({ feedbackDeadlineTime: "12:00 PM ET" })
    );
    expect(emailContent).toContain(
      "**Feedback Deadline:** Tue, Aug 4 by 12:00 PM ET"
    );
    expect(emailContent).not.toContain("EOD Tue, Aug 4");
  });

  it("keeps EOD date-only when no time is set", () => {
    const { emailContent } = mergeTemplate(TEMPLATE, "subj", baseVars());
    expect(emailContent).toContain("**Feedback Deadline:** EOD Tue, Aug 4");
    expect(emailContent).not.toContain(" by ");
  });

  it("applies to the Slack version too", () => {
    const { slackContent } = mergeTemplate(
      TEMPLATE,
      "subj",
      baseVars({ feedbackDeadlineTime: "12:00 PM ET" })
    );
    expect(slackContent).toContain("Tue, Aug 4 by 12:00 PM ET");
  });

  it("defers to Flexible wording when the window is Flexible", () => {
    const { emailContent } = mergeTemplate(
      TEMPLATE,
      "subj",
      baseVars({ feedbackWindows: "Flexible", feedbackDeadlineTime: "12:00 PM ET" })
    );
    // Flexible transform owns the line; no "by <time>" appended.
    expect(emailContent).toContain("aiming for");
    expect(emailContent).not.toContain("by 12:00 PM ET");
  });

  it("defers to the rushed notice when rushed", () => {
    const { emailContent } = mergeTemplate(
      TEMPLATE,
      "subj",
      baseVars({ rushedProject: true, feedbackDeadlineTime: "12:00 PM ET" })
    );
    expect(emailContent).toContain("URGENT");
    expect(emailContent).not.toContain("Tue, Aug 4 by 12:00 PM ET");
  });
});

// Standard time: ClickUp's date-only sentinel is 4:00 AM Eastern, which is
// 09:00 UTC once the clocks go back. A fixed 08:00 UTC check read these as a
// real "4:00 AM ET" deadline (CallRail 5C Energy, 2026-11-12).
describe("date-only sentinel in standard time", () => {
  const WINTER_DATE_ONLY_MS = 1794819600000; // live ClickUp value: Nov 16 2026, 09:00 UTC

  it("formats a winter date-only deadline with no time", () => {
    expect(formatFeedbackDeadline(WINTER_DATE_ONLY_MS)).toEqual({
      formattedDate: "Mon, Nov 16",
      timeLabel: "",
    });
  });

  it("prefills a winter date-only deadline with an empty time", () => {
    expect(deadlineMsToInputs(WINTER_DATE_ONLY_MS)).toEqual({ date: "2026-11-16", time: "" });
  });

  it("builds the sentinel ClickUp stores on both sides of the clock change", () => {
    expect(etDateToDateOnlyMs("2026-11-16")).toBe(WINTER_DATE_ONLY_MS);
    expect(etDateToDateOnlyMs("2026-08-04")).toBe(Date.UTC(2026, 7, 4, 8, 0, 0));
    expect(etInputsToMs("2026-11-16", "")).toBe(WINTER_DATE_ONLY_MS);
  });

  it("still shows a real winter time", () => {
    // 2:00 PM EST = 19:00 UTC
    expect(formatFeedbackDeadline(Date.UTC(2026, 10, 16, 19, 0, 0)).timeLabel).toBe("2:00 PM ET");
    expect(isDateOnlyMs(Date.UTC(2026, 10, 16, 19, 0, 0))).toBe(false);
    // 4:30 AM is not the sentinel
    expect(isDateOnlyMs(WINTER_DATE_ONLY_MS + 30 * 60_000)).toBe(false);
  });

  it("keeps recognising the legacy fixed 08:00 UTC value", () => {
    expect(isDateOnlyMs(Date.UTC(2026, 10, 16, 8, 0, 0))).toBe(true);
  });
});
