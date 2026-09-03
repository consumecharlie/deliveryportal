import { describe, it, expect } from "vitest";
import { resolveDeadline, deadlineState } from "@/lib/portal-deadline";

describe("resolveDeadline", () => {
  it("prefers the live ClickUp due date", () => {
    const r = resolveDeadline({ liveDueMs: 1_800_000_000_000, sentAt: new Date("2026-06-01T15:00:00Z"), feedbackWindows: "48 Hours" });
    expect(r).toEqual({ dueMs: 1_800_000_000_000, source: "clickup" });
  });

  it("computes send date + window business days (Eastern) when no task", () => {
    // Fri Jun 5 2026 3pm ET + 48 Hours (2 business days) -> Tue Jun 9, EOD sentinel 08:00 UTC
    const r = resolveDeadline({ liveDueMs: null, sentAt: new Date("2026-06-05T19:00:00Z"), feedbackWindows: "48 Hours" });
    expect(r.source).toBe("computed");
    expect(new Date(r.dueMs).toISOString()).toBe("2026-06-09T08:00:00.000Z");
  });

  it("falls back to 2 business days, flagged as default, when the window is unknown", () => {
    const r = resolveDeadline({ liveDueMs: null, sentAt: new Date("2026-06-01T15:00:00Z"), feedbackWindows: "" });
    expect(r.source).toBe("default");
    expect(new Date(r.dueMs).toISOString()).toBe("2026-06-03T08:00:00.000Z");
  });

  it("skips office holidays: Fri May 22 + 48 Hours lands after Memorial Day", () => {
    // Mon May 25 2026 is Memorial Day, so 2 business days -> Wed May 27.
    const r = resolveDeadline({ liveDueMs: null, sentAt: new Date("2026-05-22T19:00:00Z"), feedbackWindows: "48 Hours" });
    expect(new Date(r.dueMs).toISOString()).toBe("2026-05-27T08:00:00.000Z");
  });

  it("counts from the Eastern send date, not the UTC one", () => {
    // 02:30Z on Sat Jun 6 is still Fri Jun 5 evening in New York -> Tue Jun 9.
    const r = resolveDeadline({ liveDueMs: null, sentAt: new Date("2026-06-06T02:30:00Z"), feedbackWindows: "48 Hours" });
    expect(new Date(r.dueMs).toISOString()).toBe("2026-06-09T08:00:00.000Z");
  });

  it("treats Flexible as a default window, not a computed one", () => {
    const r = resolveDeadline({ liveDueMs: null, sentAt: new Date("2026-06-01T15:00:00Z"), feedbackWindows: "Flexible" });
    expect(r.source).toBe("default");
    expect(new Date(r.dueMs).toISOString()).toBe("2026-06-03T08:00:00.000Z");
  });
});

describe("deadlineState", () => {
  const due = Date.parse("2026-06-09T08:00:00Z");
  it("open before, due-today on the day, overdue after (Eastern days)", () => {
    expect(deadlineState(due, Date.parse("2026-06-08T12:00:00Z"))).toBe("open");
    expect(deadlineState(due, Date.parse("2026-06-09T20:00:00Z"))).toBe("due-today");
    expect(deadlineState(due, Date.parse("2026-06-10T12:00:00Z"))).toBe("overdue");
  });

  it("a timed due date later the same Eastern day is due-today, not open", () => {
    const dueAt6pmEt = Date.parse("2026-06-09T22:00:00Z");
    expect(deadlineState(dueAt6pmEt, Date.parse("2026-06-09T12:00:00Z"))).toBe("due-today");
  });
});
