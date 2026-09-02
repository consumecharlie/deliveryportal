# Feedback Window / Deadline Conflict Detection: Design

Date: 2026-09-02
Status: design approved, ClickUp write semantics validated, implementing

## Goal

Detect when a delivery's **Feedback Windows** value and its **Feedback Deadline**
date are logically inconsistent, surface it before the message goes to the
client, and give the sender a one-click way to resolve it in the direction that
is actually true (writing the correction back to ClickUp).

## Background: the incident

KeyBank KeyExpenseIQ Hype Demo, Storyboards V2, sent 2026-09-02 3:19 PM ET
(delivery `86ajdb5fv`). The client message read:

```
Revision Rounds:   2 of 2
Feedback Windows:  48 Hours
Feedback Deadline: EOD Thu, Sep 3
```

Sep 2 to Sep 3 is one day, not two. Verified against ClickUp:

| Thing | Value |
|---|---|
| Delivery Deadline task "Share Graphics V2 with Client" | due **Wed, Sep 2** (date-only) |
| Paired Feedback Deadline task "Confirm Design Revisions Round 2 Feedback Received" (type Storyboards V2) | due **Thu, Sep 3** (date-only) |
| Feedback Windows field on the delivery task, at send time | **48 Hours** |

The PM corrected the field to 24 Hours after the fact, which confirms the
deadline was the truth and the window was wrong. Ruled out as causes:

- **Not a template problem.** All 95 templates in the DELIVERY_SNIPPETS list
  were swept: zero hardcode an hours value, 67 use the `[feedbackWindows]`
  token (Storyboards V2 among them).
- **Not portal/ClickUp drift.** The form's value matched the ClickUp field at
  send time. (The send route does not write Feedback Windows back to ClickUp,
  so drift is *possible*, but it is not what happened here.)

The two values simply have no relationship in the system. Feedback Windows is a
dropdown custom field on the Delivery Deadline task. The Feedback Deadline is
the `due_date` of a *separate sibling task*, matched by shared parent + matching
deliverable type (`src/app/api/tasks/[taskId]/route.ts:118-168`). Nothing has
ever compared them.

## Decisions

| Question | Decision |
|---|---|
| What does the window count from? | The **Delivery Deadline task's `due_date`**, not the send moment. A late send does not by itself create a conflict. |
| Calendar rule | **Business days.** 48 Hours = 2 business days. Weekends skipped. |
| Holidays | Skipped too, from an office-closure list in the repo (not all US federal holidays). |
| ClickUp write-back | Both directions write, but moving the deadline requires an explicit confirm showing the exact task and date change. |
| Normal send path | **Unchanged.** ClickUp is written only when someone clicks a resolve button. No new writes on every send. |
| Enforcement | Inline warning in the Scope section, plus a confirm step on Send if unresolved. Never a hard block. |

## The rule

```
anchor   = Delivery Deadline task due_date   (Eastern calendar date)
days     = businessDaysForWindow(feedbackWindows)
expected = addBusinessDays(anchor, days)     (skipping weekends + holidays)
actual   = the deadline that will appear in the message
conflict = expected calendar date !== actual calendar date
```

Comparison is **calendar date only**, in Eastern. A deadline with a real
time-of-day still compares on its date, since the window is expressed in whole
days and the message says "EOD" for date-only deadlines anyway.

**Window label to business days.** Options are pulled live from ClickUp, so the
mapping parses rather than enumerates:

| Label | Days | Notes |
|---|---|---|
| `Same day` | 0 | deadline is the delivery date itself |
| `24 Hours` | 1 | |
| `48 Hours` | 2 | |
| `<n> Hours` | `n / 24` | generic, covers 72 Hours etc. |
| `Flexible` | n/a | check is skipped, there is no promised window. Already special-cased in `applyFlexibleFeedback()` |
| anything else / empty | n/a | status `unknown`, no warning |

Never guess. An unrecognized label produces `unknown` and stays silent rather
than flagging a false conflict.

**Anchor edge cases.**
- If the anchor itself lands on a weekend or holiday, roll it forward to the
  next business day *before* counting.
- If the Delivery Deadline task has no due date (or ad-hoc deliveries, which
  have no task at all), fall back to the send moment as the anchor and word the
  warning accordingly.

**Office-closure holidays** (`src/lib/us-holidays.ts`). These are **computed,
never stored**, so the list can never go stale and no one has to top it up each
year. Every one of the closure days is rule-derivable:

| Day | Rule |
|---|---|
| New Year's Day | Jan 1, with observance shift |
| Memorial Day | last Monday of May |
| Independence Day | Jul 4, with observance shift |
| Labor Day | first Monday of September |
| Thanksgiving | 4th Thursday of November |
| Day after Thanksgiving | Thanksgiving + 1 |
| Christmas Day | Dec 25, with observance shift |

Observance shift is the federal rule: a fixed-date holiday landing on Saturday
is observed the Friday before, on Sunday the Monday after.

Two edges that are easy to get wrong and are covered by tests:

- **New Year's crosses the year boundary.** When Jan 1 falls on a Saturday it is
  observed on Dec 31 of the *previous* year, so `officeHolidays(2028)` must not
  contain 2027-12-31 while `officeHolidays(2027)` must. Only dates that actually
  fall inside the requested year are kept.
- **Lookups span years.** `holidaySet()` unions the year before and after the
  one being asked about, so a closure sitting just across a boundary is never
  missed regardless of where the anchor date falls.

Verified against real-world dates for 2025, 2026, 2027 and 2028, and spot-checked
far out (2033 Christmas falls Sunday and rolls to Dec 26; 2040 New Year's falls
Sunday and rolls to Jan 2).

Worth noting the real case this covers: a Fri Sep 4 delivery with a 24 hour
window lands on Mon Sep 7, Labor Day, and rolls to Tue Sep 8.

**Company-specific closures** (a winter break, an all-hands day) are the only
thing rules cannot derive. The engine takes an optional `extraClosures: string[]`
that defaults to `[]`, so those stay opt-in data rather than maintenance. If that
ever becomes a routine need, the natural source is a shared Google Calendar read
on a schedule, but v1 does not build it.

**Direction matters.** The result carries a signed `deltaDays`:
- `actual < expected` (the KeyBank case): the client got **less** time than the
  message promised. This is the damaging direction and gets the firmer wording.
- `actual > expected`: the client got more time than promised. Still
  inconsistent, still flagged, softer wording.

## UX

Inline in the Scope section, directly under the two controls, appearing the
moment the values disagree:

```
Scope
  Revision Rounds [2 v]        Feedback Windows [48 Hours v]

  /!\  48 Hours does not match the Thu, Sep 3 deadline.
       Delivery was due Wed, Sep 2, so a 48 hour window ends Fri, Sep 4.
       The client is being told 48 hours but given 24.

       [ Window is right, move deadline to Fri, Sep 4 ]
       [ Deadline is right, set window to 24 Hours ]
       [ Send as-is ]
```

Both resolve buttons update the form immediately, so the live preview reflects
the truth before anything is sent.

If it is still unresolved at Send, the send bar interrupts once with the same
summary and the same three choices. It never hard-blocks: rush jobs and
client-requested extensions are legitimate, and "Send as-is" is always
available.

## Write-back

**"Deadline is right, set window to N"** writes the dropdown on the Delivery
Deadline task. Low risk. Uses `resolveDropdownOptionId()` since ClickUp
dropdowns read as orderindex but write as option UUID.

**"Window is right, move deadline to <date>"** moves the sibling Feedback
Deadline task's `due_date`. This shifts a real project date, so it goes behind a
confirm that names the exact task:

```
Move feedback deadline?

  Confirm Design Revisions Round 2 Feedback Received
  Thu, Sep 3   ->   Fri, Sep 4

  This changes the due date in ClickUp.

  [Cancel]  [Move deadline]
```

Rules for the write:
- Write the **date-only sentinel (08:00 UTC)** so the message keeps saying
  "EOD" rather than flipping to "by 2:00 PM ET".
- If the existing deadline had a real time-of-day, preserve that time and move
  only the date.
- Only the Feedback Deadline task moves. The Delivery Deadline is never touched.
- Ad-hoc deliveries have no Feedback Deadline task, so this resolution only
  updates the form's manual deadline and says so.

Needs a new `updateTaskDueDate(taskId, dueDateMs, dueDateTime)` in
`src/lib/clickup.ts` (PUT `/task/{id}`, same endpoint `updateTaskStatus` already
uses).

**Live-validated 2026-09-02** on a throwaway list in the Templates space (created
and deleted during the test):

| Sent | `due_date_time` | Read back |
|---|---|---|
| `2026-09-04T00:00Z` (naive UTC midnight) | `false` | **`2026-09-03T08:00Z`, the wrong day** |
| `2026-09-04T08:00Z` | `false` | `2026-09-04T08:00Z`, unchanged |
| `2026-09-04T20:00Z` (4pm ET) | `true` | `2026-09-04T20:00Z`, unchanged |
| `2026-09-04T04:00Z` (ET midnight) | `false` | `2026-09-04T08:00Z`, normalized |

Conclusions:

- `due_date_time: false` normalizes to the 08:00 UTC date-only sentinel, keyed to
  the **Eastern** calendar date the timestamp falls on. That is exactly the
  sentinel `formatFeedbackDeadline()` reads, so "EOD" phrasing is preserved.
- **Never send naive UTC midnight.** It is the previous evening in Eastern and
  lands the deadline a day early. Always build the sentinel directly as
  `Date.UTC(y, m, d, 8, 0, 0)` from the Eastern calendar date.
- `due_date_time: true` preserves an exact timestamp, so a deadline that had a
  real time-of-day can keep it while only its date moves.
- The v2 API never returns `due_date_time`, confirming the existing note in
  `feedback-deadline.ts`. Writes are one-way; we cannot read back which mode a
  task is in, only infer it from the sentinel.

## Testing

Engine (`src/lib/__tests__/feedback-conflict.test.ts`), pure and fast:
- the KeyBank case reproduces as a conflict of -1 day
- each window label maps correctly, including generic `<n> Hours`
- `Flexible`, empty, and unrecognized labels return `unknown`, never a conflict
- weekend skip: Thu + 48 Hours = Mon
- holiday skip: Fri Sep 4 + 24 Hours = Tue Sep 8 (Labor Day rolled)
- holiday generation matches known dates for 2025-2028, and the Jan 1 / Dec 31
  year-boundary observance lands in the correct year
- anchor on a weekend rolls forward before counting
- deadline with a real time compares on date only
- both conflict directions, and the exact-match ok case
- no anchor available falls back to the send moment

Plus component coverage for the warning appearing/clearing and each resolve
button producing the right form state, and a live validation of the ClickUp
due-date write.

## Files (anticipated)

| File | Change |
|---|---|
| `src/lib/feedback-conflict.ts` | new, pure engine |
| `src/lib/us-holidays.ts` | new, computed office-closure rules + business-day helpers |
| `src/lib/clickup.ts` | add `updateTaskDueDate()` |
| `src/app/api/tasks/[taskId]/resolve-feedback-conflict/route.ts` | new, applies either resolution |
| `src/components/delivery-form/scope-section.tsx` | warning + resolve buttons |
| `src/components/delivery-form/delivery-form.tsx` | wire anchor/window/deadline state, dismissal |
| `src/components/delivery-form/send-bar.tsx` | unresolved-conflict confirm |

## Out of scope for v1

- The `/audit` Project Setup console sweeping all projects for mismatches.
  Deferred deliberately; the form-level catch covers the actual failure moment.
- Writing Feedback Windows / Revision Rounds back to ClickUp on every send.
  Considered and rejected: no drift was observed in the incident, and it adds
  writes to the send path for no proven gain.
