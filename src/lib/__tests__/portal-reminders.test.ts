import { describe, it, expect } from "vitest";
import {
  classifyReminders,
  dueWordFor,
  greetingNameFromBody,
  buildReminderEmail,
  buildOverdueNudgeText,
  type ReminderCandidate,
} from "@/lib/portal-reminders";
import { holidaySet } from "@/lib/us-holidays";
import { dateOnlySentinelMs } from "@/lib/portal-deadline";

// September 2026: Fri Sep 4, Mon Sep 7 (Labor Day), Wed Sep 9, Thu Sep 10,
// Fri Sep 11, Mon Sep 14. A 9:00 AM ET run is 13:00Z.
const closures = holidaySet([2026]);
const at9amET = (date: string) => Date.parse(`${date}T13:00:00Z`);

function item(deliveryId: string, due: string, nowMs: number): ReminderCandidate {
  const dueMs = dateOnlySentinelMs(due);
  const state = due === new Date(nowMs).toISOString().slice(0, 10) ? "due-today" : dueMs < nowMs ? "overdue" : "open";
  return { deliveryId, dueMs, state };
}

describe("classifyReminders", () => {
  it("puts a deliverable due today in the today bucket", () => {
    const now = at9amET("2026-09-10");
    const out = classifyReminders([item("d1", "2026-09-10", now)], now, closures);
    expect(out).toEqual({ tomorrow: [], today: ["d1"], overdue: [] });
  });

  it("puts a deliverable due the next business day in the tomorrow bucket", () => {
    const now = at9amET("2026-09-10");
    const out = classifyReminders([item("d1", "2026-09-11", now)], now, closures);
    expect(out.tomorrow).toEqual(["d1"]);
    expect(out.today).toEqual([]);
  });

  it("on a Friday reminds for Monday deadlines, not Saturday ones", () => {
    const now = at9amET("2026-09-11");
    const out = classifyReminders(
      [item("mon", "2026-09-14", now), item("sat", "2026-09-12", now)],
      now,
      closures
    );
    expect(out.tomorrow).toEqual(["mon"]);
    expect(out.today).toEqual([]);
    expect(out.overdue).toEqual([]);
  });

  it("skips office closures when finding the next business day", () => {
    // Fri Sep 4: Labor Day is Mon Sep 7, so the next business day is Tue Sep 8.
    const now = at9amET("2026-09-04");
    const out = classifyReminders(
      [item("tue", "2026-09-08", now), item("hol", "2026-09-07", now)],
      now,
      closures
    );
    expect(out.tomorrow).toEqual(["tue"]);
  });

  it("ignores deadlines further out than the next business day", () => {
    const now = at9amET("2026-09-10");
    const out = classifyReminders([item("d1", "2026-09-15", now)], now, closures);
    expect(out).toEqual({ tomorrow: [], today: [], overdue: [] });
  });

  it("nudges on the first business day after the due date, then every 2 business days (1, 3, 5)", () => {
    const due = "2026-09-09"; // Wednesday
    const expectations: Array<[string, boolean]> = [
      ["2026-09-10", true], // 1 business day after
      ["2026-09-11", false], // 2
      ["2026-09-14", true], // 3
      ["2026-09-15", false], // 4
      ["2026-09-16", true], // 5
      ["2026-09-17", false], // 6
    ];
    for (const [day, expected] of expectations) {
      const now = at9amET(day);
      const out = classifyReminders([item("d1", due, now)], now, closures);
      expect(out.overdue, day).toEqual(expected ? ["d1"] : []);
    }
  });

  it("counts a weekend due date as overdue from the following Monday", () => {
    const now = at9amET("2026-09-14");
    const out = classifyReminders([item("d1", "2026-09-12", now)], now, closures);
    expect(out.overdue).toEqual(["d1"]);
  });

  it("only nudges items whose state is overdue", () => {
    const now = at9amET("2026-09-10");
    const stale = { ...item("d1", "2026-09-09", now), state: "open" as const };
    expect(classifyReminders([stale], now, closures).overdue).toEqual([]);
  });

  it("sends nothing on an office closure", () => {
    const now = at9amET("2026-09-07"); // Labor Day
    const out = classifyReminders(
      [item("today", "2026-09-07", now), item("tmrw", "2026-09-08", now), item("late", "2026-09-04", now)],
      now,
      closures
    );
    expect(out).toEqual({ tomorrow: [], today: [], overdue: [] });
  });

  it("sorts each bucket by due date then id for stable output", () => {
    const now = at9amET("2026-09-10");
    const out = classifyReminders([item("b", "2026-09-10", now), item("a", "2026-09-10", now)], now, closures);
    expect(out.today).toEqual(["a", "b"]);
  });
});

describe("dueWordFor", () => {
  it("says today and tomorrow for calendar-adjacent deadlines", () => {
    const now = at9amET("2026-09-10");
    expect(dueWordFor("today", dateOnlySentinelMs("2026-09-10"), now)).toBe("today");
    expect(dueWordFor("tomorrow", dateOnlySentinelMs("2026-09-11"), now)).toBe("tomorrow");
  });

  it("names the weekday when the next business day is not calendar tomorrow", () => {
    const now = at9amET("2026-09-11");
    expect(dueWordFor("tomorrow", dateOnlySentinelMs("2026-09-14"), now)).toBe("on Monday");
  });
});

describe("greetingNameFromBody", () => {
  it("reads the name from a merged greeting on the first line", () => {
    expect(greetingNameFromBody("Hello, Klaudia!")).toBe("Klaudia");
    expect(greetingNameFromBody("Hi Whitney and team,")).toBe("Whitney");
    expect(greetingNameFromBody("Hey Dana.\n\nHere is the cut.")).toBe("Dana");
  });

  it("skips leading blank lines and light markdown", () => {
    expect(greetingNameFromBody("\n\n**Hi Dana,**\nbody")).toBe("Dana");
  });

  it("returns null without a greeting, a capitalised name, or any body", () => {
    expect(greetingNameFromBody("Quick update")).toBeNull();
    expect(greetingNameFromBody("hi there,")).toBeNull();
    expect(greetingNameFromBody("Hi Team,")).toBeNull();
    expect(greetingNameFromBody("Hello Everyone!")).toBeNull();
    expect(greetingNameFromBody("")).toBeNull();
    expect(greetingNameFromBody("   \n  ")).toBeNull();
  });
});

describe("buildReminderEmail", () => {
  const base = {
    projectName: "Spring <Launch>",
    deliverableType: "Rough Cut V1",
    dueLabel: "Mon, Sep 14",
    portalUrl: "https://portal.example.com/portal/tok/list-1",
  };

  it("builds a friendly subject, html, and text for a tomorrow reminder", () => {
    const out = buildReminderEmail({ ...base, kind: "tomorrow", dueWord: "on Monday", primaryFirstName: "Dana" });
    expect(out.subject).toBe("Reminder: feedback on Rough Cut V1 is due on Monday");
    expect(out.text).toContain("Hi Dana,");
    expect(out.text).toContain("Rough Cut V1");
    expect(out.text).toContain("Mon, Sep 14");
    expect(out.text).toContain(base.portalUrl);
    expect(out.html).toContain(`href="${base.portalUrl}"`);
    expect(out.html).toContain("Spring &lt;Launch&gt;");
  });

  it("defaults the due word from the kind and greets without a name", () => {
    const out = buildReminderEmail({ ...base, kind: "today" });
    expect(out.subject).toBe("Reminder: feedback on Rough Cut V1 is due today");
    expect(out.text).toContain("Hi there,");
  });

  it("never uses em dashes", () => {
    const out = buildReminderEmail({ ...base, kind: "today" });
    for (const s of [out.subject, out.html, out.text]) expect(s).not.toContain("—");
  });
});

describe("buildOverdueNudgeText", () => {
  it("escapes every client-supplied field and links the portal", () => {
    const text = buildOverdueNudgeText({
      clientName: "Acme & Co",
      projectName: "Spring <Launch>",
      deliverableType: "Rough Cut V1",
      dueLabel: "Wed, Sep 9",
      portalUrl: "https://portal.example.com/portal/tok",
    });
    expect(text).toBe(
      ":hourglass: Acme &amp; Co has not confirmed feedback on Rough Cut V1 (Spring &lt;Launch&gt;). Due Wed, Sep 9. <https://portal.example.com/portal/tok|Open client portal>"
    );
  });
});
