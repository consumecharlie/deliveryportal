import { describe, expect, it } from "vitest";
import {
  actionTitle,
  countdownText,
  reviewWindowProgress,
  dueTimeLabel,
  dueUrgency,
  easternDayDiff,
  endOfEasternDay,
  looksEndOfDay,
} from "@/components/portal/due";

/** The 08:00 UTC sentinel we write for a date-only Eastern deadline. */
const dateOnly = (iso: string) => Date.parse(`${iso}T08:00:00.000Z`);
/** A wall-clock Eastern instant during daylight time (UTC-4). */
const easternEDT = (iso: string, hhmm: string) => Date.parse(`${iso}T${hhmm}:00.000-04:00`);

describe("looksEndOfDay", () => {
  it("recognises the date-only sentinel", () => {
    expect(looksEndOfDay(dateOnly("2026-09-15"))).toBe(true);
  });
  it("leaves a real time alone", () => {
    expect(looksEndOfDay(easternEDT("2026-09-15", "16:00"))).toBe(false);
  });
});

describe("endOfEasternDay", () => {
  it("lands on 11:59 PM Eastern, not UTC", () => {
    const end = endOfEasternDay(dateOnly("2026-09-15"));
    expect(new Date(end).toISOString()).toBe("2026-09-16T03:59:59.999Z");
  });
  it("holds across the autumn DST change", () => {
    // 2026-11-01 is the fall-back day: Eastern is UTC-5 by the end of it.
    expect(new Date(endOfEasternDay(dateOnly("2026-11-02"))).toISOString()).toBe("2026-11-03T04:59:59.999Z");
  });
});

describe("easternDayDiff", () => {
  it("counts calendar days, not elapsed hours", () => {
    // 11pm Eastern to 1am Eastern the next day is two hours but one day.
    expect(easternDayDiff(easternEDT("2026-09-15", "23:00"), easternEDT("2026-09-16", "01:00"))).toBe(1);
  });
});

describe("countdownText", () => {
  const due = dateOnly("2026-09-15");
  const base = { dueMs: due, endOfDay: true, isEstimate: false };

  it("counts whole days out", () => {
    expect(countdownText({ ...base, nowMs: easternEDT("2026-09-11", "09:00") })).toBe("4 days left");
  });
  it("names tomorrow", () => {
    expect(countdownText({ ...base, nowMs: easternEDT("2026-09-14", "09:00") })).toBe("Due tomorrow");
  });
  it("counts hours to 11:59 PM Eastern on the day", () => {
    expect(countdownText({ ...base, nowMs: easternEDT("2026-09-15", "17:00") })).toBe("7 hours left");
  });
  it("falls back to minutes in the last hour", () => {
    expect(countdownText({ ...base, nowMs: easternEDT("2026-09-15", "23:30") })).toBe("30 minutes left");
    expect(countdownText({ ...base, nowMs: easternEDT("2026-09-15", "23:05") })).toBe("55 minutes left");
  });
  it("counts days late once the day has passed", () => {
    expect(countdownText({ ...base, nowMs: easternEDT("2026-09-16", "09:00") })).toBe("1 day late");
    expect(countdownText({ ...base, nowMs: easternEDT("2026-09-19", "09:00") })).toBe("4 days late");
  });
  it("counts hours late for a timed deadline on the same day", () => {
    const timed = { dueMs: easternEDT("2026-09-15", "14:00"), endOfDay: false, isEstimate: false };
    expect(countdownText({ ...timed, nowMs: easternEDT("2026-09-15", "17:00") })).toBe("3 hours late");
  });
  it("never counts down an estimate", () => {
    expect(countdownText({ ...base, isEstimate: true, nowMs: easternEDT("2026-09-11", "09:00") })).toBe("Suggested date");
    expect(countdownText({ ...base, isEstimate: true, nowMs: easternEDT("2026-09-19", "09:00") })).toBe(
      "Suggested date has passed"
    );
  });
});

describe("dueUrgency", () => {
  const due = dateOnly("2026-09-15");
  const at = (iso: string, hhmm: string) => ({ dueMs: due, endOfDay: true, isEstimate: false, nowMs: easternEDT(iso, hhmm) });

  it("is calm at a distance", () => expect(dueUrgency(at("2026-09-11", "09:00"))).toBe("calm"));
  it("warms up the day before", () => expect(dueUrgency(at("2026-09-14", "09:00"))).toBe("soon"));
  it("stays warm on the day", () => expect(dueUrgency(at("2026-09-15", "23:00"))).toBe("soon"));
  it("turns past once the day ends", () => expect(dueUrgency(at("2026-09-16", "00:30"))).toBe("past"));
  it("keeps an estimate soft even when overdue", () => {
    expect(dueUrgency({ ...at("2026-09-19", "09:00"), isEstimate: true })).toBe("estimate");
  });
});

describe("dueTimeLabel", () => {
  it("says EOD for a whole day", () => expect(dueTimeLabel(dateOnly("2026-09-15"), true)).toBe("EOD"));
  it("shows a set time in Eastern", () => expect(dueTimeLabel(easternEDT("2026-09-15", "16:00"), false)).toBe("4:00 PM"));
});

describe("reviewWindowProgress", () => {
  const start = dateOnly("2026-09-05");
  const due = dateOnly("2026-09-15");
  const base = { windowStartMs: start, dueMs: due, endOfDay: true };

  it("counts days through the window", () => {
    const p = reviewWindowProgress({ ...base, nowMs: easternEDT("2026-09-11", "09:00") });
    expect(p).toMatchObject({ total: 10, elapsed: 6, pct: 60, closed: false, label: "6 of 10 days" });
  });
  it("counts the day we sent it as day one", () => {
    expect(reviewWindowProgress({ ...base, nowMs: easternEDT("2026-09-05", "09:00") })).toMatchObject({
      elapsed: 1,
      pct: 10,
    });
  });
  it("fills and closes once the deadline passes", () => {
    const p = reviewWindowProgress({ ...base, nowMs: easternEDT("2026-09-19", "09:00") });
    expect(p).toMatchObject({ elapsed: 10, pct: 100, closed: true, label: "Window closed" });
  });
  it("holds a date-only window open all through its last day", () => {
    // The deadline arrives as the 08:00 UTC sentinel: the window must not
    // read as closed mid-morning on the day it is due.
    const morning = reviewWindowProgress({ ...base, nowMs: easternEDT("2026-09-15", "10:00") });
    expect(morning).toMatchObject({ elapsed: 10, pct: 100, closed: false, label: "10 of 10 days" });
    expect(reviewWindowProgress({ ...base, nowMs: easternEDT("2026-09-15", "23:00") })?.closed).toBe(false);
    expect(reviewWindowProgress({ ...base, nowMs: easternEDT("2026-09-16", "00:30") })?.closed).toBe(true);
  });
  it("floors a same-day window at one day", () => {
    const sameDay = { ...base, windowStartMs: due };
    expect(reviewWindowProgress({ ...sameDay, nowMs: easternEDT("2026-09-15", "10:00") })).toMatchObject({
      total: 1,
      elapsed: 1,
      pct: 100,
      label: "1 of 1 day",
    });
  });
  it("gives up when the numbers make no sense", () => {
    expect(reviewWindowProgress({ ...base, windowStartMs: null, nowMs: due })).toBeNull();
    // a start in the future
    expect(reviewWindowProgress({ ...base, nowMs: easternEDT("2026-09-01", "09:00") })).toBeNull();
  });
});

describe("actionTitle", () => {
  it("keeps the longer of two nested labels", () => {
    expect(actionTitle("Post Script AV", "Post Script AV V2")).toEqual({ main: "Post Script AV V2", secondary: null });
  });
  it("keeps both when they differ", () => {
    expect(actionTitle("Spinoff Details", "(3) 15s Spinoff (4:5)")).toEqual({
      main: "Spinoff Details",
      secondary: "(3) 15s Spinoff (4:5)",
    });
  });
  it("handles a missing variant", () => {
    expect(actionTitle("Graphics V2", null)).toEqual({ main: "Graphics V2", secondary: null });
  });
});
