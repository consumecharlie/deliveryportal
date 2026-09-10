import { describe, it, expect } from "vitest";
import { decideFeedbackStatus, newestConfirmation, STALE_AFTER_MS } from "@/lib/portal-status";
import type { LiveFeedbackTask } from "@/lib/portal-live";

const SENT = new Date("2026-06-01T15:00:00Z");
const NOW = new Date("2026-06-02T15:00:00Z").getTime();

function task(over: Partial<LiveFeedbackTask> = {}): LiveFeedbackTask {
  return {
    taskId: "T1",
    name: "Feedback Deadline: AV Script V1",
    dueMs: Date.parse("2026-06-04T08:00:00Z"),
    isOpen: true,
    status: "waiting on client",
    awaitingClient: true,
    parentTaskId: null,
    deliverableType: "AV Script V1",
    ...over,
  };
}

function conf(over: { confirmedAt?: string; undoneAt?: string | null; confirmedByName?: string | null } = {}) {
  return {
    confirmedAt: new Date(over.confirmedAt ?? "2026-06-02T10:00:00Z"),
    undoneAt: over.undoneAt ? new Date(over.undoneAt) : null,
    confirmedByName: over.confirmedByName ?? null,
  };
}

describe("newestConfirmation", () => {
  it("picks the most recent row by confirmedAt regardless of input order", () => {
    const older = conf({ confirmedAt: "2026-06-02T10:00:00Z", undoneAt: "2026-06-02T11:00:00Z" });
    const newer = conf({ confirmedAt: "2026-06-02T12:00:00Z" });
    expect(newestConfirmation([older, newer])).toBe(newer);
    expect(newestConfirmation([newer, older])).toBe(newer);
    expect(newestConfirmation([])).toBeNull();
  });
});

describe("decideFeedbackStatus", () => {
  it("is awaiting with the live due date when the task is open and nothing is confirmed", () => {
    const s = decideFeedbackStatus({ task: task(), confirmation: null, sentAt: SENT, feedbackWindows: "48 Hours", nowMs: NOW });
    expect(s.kind).toBe("awaiting");
    expect(s.source).toBe("clickup");
    expect(s.dueIsEstimate).toBe(false);
    expect(s.feedbackDeadlineTaskId).toBe("T1");
    expect(s.state).toBe("open");
    expect(s.dueLabel).toBe("Thu, Jun 4");
  });

  it("a non-undone confirmation row counts as confirmed and carries who/when", () => {
    const s = decideFeedbackStatus({ task: task(), confirmation: conf({ confirmedByName: "Eira" }), sentAt: SENT, feedbackWindows: "", nowMs: NOW });
    expect(s.kind).toBe("confirmed");
    expect(s.confirmedByName).toBe("Eira");
    expect(s.confirmedAt?.toISOString()).toBe("2026-06-02T10:00:00.000Z");
  });

  it("an undone row reopens the request", () => {
    const s = decideFeedbackStatus({ task: task(), confirmation: conf({ undoneAt: "2026-06-02T11:00:00Z" }), sentAt: SENT, feedbackWindows: "", nowMs: NOW });
    expect(s.kind).toBe("awaiting");
    expect(s.confirmedAt).toBeNull();
    expect(s.confirmedByName).toBeNull();
  });

  it("undone then reconfirmed: the newest row wins", () => {
    const rows = [
      conf({ confirmedAt: "2026-06-02T10:00:00Z", undoneAt: "2026-06-02T11:00:00Z", confirmedByName: "Eira" }),
      conf({ confirmedAt: "2026-06-02T12:00:00Z", confirmedByName: "Sam" }),
    ];
    const s = decideFeedbackStatus({ task: task(), confirmation: newestConfirmation(rows), sentAt: SENT, feedbackWindows: "", nowMs: NOW });
    expect(s.kind).toBe("confirmed");
    expect(s.confirmedByName).toBe("Sam");
  });

  it("a closed task counts as confirmed even with no confirmation row (nothing to undo)", () => {
    const s = decideFeedbackStatus({ task: task({ isOpen: false }), confirmation: null, sentAt: SENT, feedbackWindows: "", nowMs: NOW });
    expect(s.kind).toBe("confirmed");
    expect(s.confirmedAt).toBeNull();
    expect(s.feedbackDeadlineTaskId).toBe("T1");
  });

  it("without a task: computed deadline, awaiting until 30 days after send, then none", () => {
    const before = decideFeedbackStatus({ task: null, confirmation: null, sentAt: SENT, feedbackWindows: "48 Hours", nowMs: SENT.getTime() + STALE_AFTER_MS });
    expect(before.kind).toBe("awaiting");
    expect(before.source).toBe("computed");
    expect(before.feedbackDeadlineTaskId).toBeNull();
    const after = decideFeedbackStatus({ task: null, confirmation: null, sentAt: SENT, feedbackWindows: "48 Hours", nowMs: SENT.getTime() + STALE_AFTER_MS + 1 });
    expect(after.kind).toBe("none");
  });

  it("the 30-day rule never downgrades a confirmed delivery, and a task keeps it awaiting", () => {
    const late = SENT.getTime() + STALE_AFTER_MS * 2;
    const confirmed = decideFeedbackStatus({ task: null, confirmation: conf(), sentAt: SENT, feedbackWindows: "", nowMs: late });
    expect(confirmed.kind).toBe("confirmed");
    const withTask = decideFeedbackStatus({ task: task(), confirmation: null, sentAt: SENT, feedbackWindows: "", nowMs: late });
    expect(withTask.kind).toBe("awaiting");
    expect(withTask.state).toBe("overdue");
  });

  it("flags the default window as an estimate; a snapshotted window is not", () => {
    const est = decideFeedbackStatus({ task: null, confirmation: null, sentAt: SENT, feedbackWindows: "", nowMs: NOW });
    expect(est.source).toBe("default");
    expect(est.dueIsEstimate).toBe(true);
    const real = decideFeedbackStatus({ task: null, confirmation: null, sentAt: SENT, feedbackWindows: "48 Hours", nowMs: NOW });
    expect(real.dueIsEstimate).toBe(false);
    const live = decideFeedbackStatus({ task: task(), confirmation: null, sentAt: SENT, feedbackWindows: "", nowMs: NOW });
    expect(live.dueIsEstimate).toBe(false);
  });

  it("includes the time in the label when the live due date has a real time", () => {
    // 2026-06-04T16:00Z is 12:00 PM EDT
    const s = decideFeedbackStatus({ task: task({ dueMs: Date.parse("2026-06-04T16:00:00Z") }), confirmation: null, sentAt: SENT, feedbackWindows: "", nowMs: NOW });
    expect(s.dueLabel).toBe("Thu, Jun 4, 12:00 PM ET");
  });
});
