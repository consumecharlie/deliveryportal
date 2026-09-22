import { describe, it, expect } from "vitest";
import { decideFeedbackStatus, newestConfirmation } from "@/lib/portal-status";
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

  it("ClickUp decides: only 'waiting on client' is awaiting, any other open status is not", () => {
    const notReady = task({ status: "not ready", awaitingClient: false });
    const s = decideFeedbackStatus({ task: notReady, confirmation: null, sentAt: SENT, feedbackWindows: "48 Hours", nowMs: NOW });
    expect(s.kind).toBe("none");
    // The task is still open, so this is not a confirmation either.
    expect(s.confirmedAt).toBeNull();
    expect(s.feedbackDeadlineTaskId).toBe("T1");
  });

  it("no paired task at all is never an action item, however fresh the delivery", () => {
    // The real shape: a "Final Deliverables" send whose list has no matching
    // feedback task. A known window used to make this a firm deadline.
    const fresh = decideFeedbackStatus({ task: null, confirmation: null, sentAt: SENT, feedbackWindows: "24 Hours", nowMs: SENT.getTime() + 3_600_000 });
    expect(fresh.kind).toBe("none");
    expect(fresh.feedbackDeadlineTaskId).toBeNull();
    const old = decideFeedbackStatus({ task: null, confirmation: null, sentAt: SENT, feedbackWindows: "48 Hours", nowMs: SENT.getTime() + 90 * 86_400_000 });
    expect(old.kind).toBe("none");
  });

  it("a confirmation row still reads as confirmed with no task, and an undo cannot resurrect one", () => {
    const confirmed = decideFeedbackStatus({ task: null, confirmation: conf(), sentAt: SENT, feedbackWindows: "", nowMs: NOW });
    expect(confirmed.kind).toBe("confirmed");
    const undone = decideFeedbackStatus({ task: null, confirmation: conf({ undoneAt: "2026-06-02T11:00:00Z" }), sentAt: SENT, feedbackWindows: "", nowMs: NOW });
    expect(undone.kind).toBe("none");
    // An undo with a task ClickUp reopened does go back to awaiting.
    const reopened = decideFeedbackStatus({ task: task(), confirmation: conf({ undoneAt: "2026-06-02T11:00:00Z" }), sentAt: SENT, feedbackWindows: "", nowMs: NOW });
    expect(reopened.kind).toBe("awaiting");
  });

  it("a deadline we worked out ourselves is always an estimate, a ClickUp one never is", () => {
    // Awaiting with no due date on the task: the window fills in, as a suggestion.
    const noDue = decideFeedbackStatus({ task: task({ dueMs: null }), confirmation: null, sentAt: SENT, feedbackWindows: "48 Hours", nowMs: NOW });
    expect(noDue.kind).toBe("awaiting");
    expect(noDue.source).toBe("computed");
    expect(noDue.dueIsEstimate).toBe(true);
    const defaulted = decideFeedbackStatus({ task: task({ dueMs: null }), confirmation: null, sentAt: SENT, feedbackWindows: "", nowMs: NOW });
    expect(defaulted.source).toBe("default");
    expect(defaulted.dueIsEstimate).toBe(true);
    const live = decideFeedbackStatus({ task: task(), confirmation: null, sentAt: SENT, feedbackWindows: "", nowMs: NOW });
    expect(live.source).toBe("clickup");
    expect(live.dueIsEstimate).toBe(false);
  });

  it("includes the time in the label when the live due date has a real time", () => {
    // 2026-06-04T16:00Z is 12:00 PM EDT
    const s = decideFeedbackStatus({ task: task({ dueMs: Date.parse("2026-06-04T16:00:00Z") }), confirmation: null, sentAt: SENT, feedbackWindows: "", nowMs: NOW });
    expect(s.dueLabel).toBe("Thu, Jun 4, 12:00 PM ET");
  });

  it("dueIsEndOfDay follows whether the deadline carries a time of day", () => {
    // A ClickUp date-only due date (the 08:00 UTC sentinel) is end of day.
    const sentinel = decideFeedbackStatus({ task: task(), confirmation: null, sentAt: SENT, feedbackWindows: "", nowMs: NOW });
    expect(sentinel.source).toBe("clickup");
    expect(sentinel.dueIsEndOfDay).toBe(true);

    // A real ClickUp time is not.
    const timed = decideFeedbackStatus({ task: task({ dueMs: Date.parse("2026-06-04T16:00:00Z") }), confirmation: null, sentAt: SENT, feedbackWindows: "", nowMs: NOW });
    expect(timed.dueIsEndOfDay).toBe(false);

    // Computed from the feedback window, and the default window: both end of day.
    const computed = decideFeedbackStatus({ task: null, confirmation: null, sentAt: SENT, feedbackWindows: "2 Business Days", nowMs: NOW });
    expect(computed.source).toBe("computed");
    expect(computed.dueIsEndOfDay).toBe(true);
    const fallback = decideFeedbackStatus({ task: null, confirmation: null, sentAt: SENT, feedbackWindows: "", nowMs: NOW });
    expect(fallback.source).toBe("default");
    expect(fallback.dueIsEndOfDay).toBe(true);
  });
});
