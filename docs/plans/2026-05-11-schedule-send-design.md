# Schedule Send — Design

**Date:** 2026-05-11
**Status:** Approved, ready for implementation plan

## Problem

Today the portal can only send a delivery immediately. The team wants to:
1. Defer a ready-now delivery to the right business hour (e.g. ready at 6pm but client prefers post-5pm sends to land the next morning).
2. Batch-prep tomorrow's deliveries today and come back later to drop links in before they auto-fire.

## Goals

- A team member can schedule any delivery to fire at a future time, anchored to Eastern.
- A scheduled delivery is fully editable until it fires.
- If a scheduled delivery is incomplete at fire time, it bounces back to Drafts and the sender is Slack-DM'd.
- A proactive reminder fires 30 minutes before scheduled time if the delivery is still incomplete.

## Non-goals

- Bulk actions on scheduled items (multi-select reschedule/cancel).
- Scheduling test sends (test sends remain immediate-only).
- TZ-aware picker (fixed to Eastern).
- Recurring schedules.
- Calendar/week view of the Scheduled queue.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Storage | Extend the existing `Draft` model with `scheduledFor`, `scheduleStatus`, `lastReminderAt` | A scheduled item is structurally a draft with a planned send time; sharing storage means cancel-to-draft is a one-column update and there is no duplicated form payload. |
| Trigger mechanism | Vercel Cron, runs every minute on Vercel Pro | Self-contained in the portal; no n8n changes; cheap on Pro plan. |
| Where it lives | New `/scheduled` page + sidebar item (between Drafts and Sent) | User explicitly preferred a dedicated tab over an in-Drafts filter chip. |
| Sidebar icon | `/icons/on-button.svg` (brand-asset On Button) | User selected during brainstorming. |
| Time picker | Quick presets ("Tomorrow 9am ET", "Monday 9am ET", "In 1 hour") + date/time picker rounding to 5-minute increments | Covers business-hours use case in two clicks while supporting precise scheduling. |
| Timezone | Fixed to Eastern Time | Consume Media's office TZ; clients in other zones are a manual mental conversion. |
| Pre-fire ops | Edit content, reschedule, cancel-to-Drafts | All approved during brainstorming. Outright delete (no draft retained) deliberately excluded. |
| Incomplete at fire time | Move back to Drafts, do NOT send, Slack-DM the sender | User chose "bounce" over "block scheduling until complete" to preserve the batching workflow. |
| Reminder | Slack DM to sender 30 minutes before fire time if incomplete | Best chance for the user to drop a link in before the bounce. |
| Sent path | Existing send flow runs from the cron — produces a normal `Delivery` row | No new shape downstream. |

## Architecture

### Data model

Extend the existing `Draft` model:

```prisma
model Draft {
  id              String   @id @default(cuid())
  taskId          String   @unique
  formData        Json
  savedBy         String
  savedAt         DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // New columns (all nullable; existing drafts get NULL):
  scheduledFor    DateTime?
  scheduleStatus  String?       // "scheduled" | "firing" | null (null = regular draft)
  lastReminderAt  DateTime?

  @@index([taskId])
  @@index([scheduledFor])       // for the cron's due-soon and reminder queries
}
```

States:
- **Draft** — `scheduledFor IS NULL` and `scheduleStatus IS NULL`.
- **Scheduled** — `scheduledFor IS NOT NULL` and `scheduleStatus = "scheduled"`.
- **Firing** — `scheduleStatus = "firing"` while the cron is mid-send (race-condition guard).
- After successful fire: the draft is deleted (existing Send flow already does this) and a `Delivery` row exists.
- After bounce: `scheduledFor`, `scheduleStatus`, `lastReminderAt` all set back to NULL; the row remains as a regular draft.

### Trigger: Vercel Cron

`vercel.json` (new file or extension) adds:

```json
{
  "crons": [
    { "path": "/api/cron/scheduled-sends", "schedule": "* * * * *" }
  ]
}
```

`/api/cron/scheduled-sends` is protected by Vercel's automatic `Authorization: Bearer <CRON_SECRET>` header check (`CRON_SECRET` env var). The route runs three passes per tick:

1. **Reminder pass.** Find drafts where `scheduledFor` is between (now + 25min) and (now + 35min) AND `scheduleStatus = "scheduled"` AND `lastReminderAt IS NULL` AND completeness check fails. For each: Slack-DM the sender, set `lastReminderAt = now`.

2. **Fire pass.** Find drafts where `scheduledFor <= now` AND `scheduleStatus = "scheduled"`. For each:
   - Atomically mark `scheduleStatus = "firing"` (avoids double-firing if a cron tick overruns).
   - Re-check completeness. If incomplete → clear scheduling fields and Slack-DM ("Didn't fire — back in Drafts"). If complete → run the existing send flow (call into the same logic `/api/tasks/[taskId]/send` uses) → existing send-side cleanup deletes the draft and creates the `Delivery` row.

3. **Stale pass.** Items where `scheduledFor <= now - 30 minutes` AND `scheduleStatus IN ("scheduled", "firing")` — same as a bounce, regardless of completeness. Avoids surprise late-sends from a long cron outage.

### Completeness check

The existing send flow (`src/app/api/tasks/[taskId]/send/route.ts`) already validates that all required fields are present before n8n is hit. We extract that validation into a pure helper `isFormComplete(formData)` in `src/lib/schedule-send.ts` and use it from both the cron and an `isComplete` field on the Scheduled list row.

### Sender resolution & Slack DMs

A new helper `src/lib/slack-dm.ts` exposes `sendSlackDM(senderEmail, text)`:
1. Look up Slack user by email via `users.lookupByEmail` (bot needs `users:read.email`).
2. `conversations.open` with that user ID → DM channel ID.
3. `chat.postMessage` to that channel.
4. On failure: log a warning, do not throw. The cron must remain robust.

Required Slack bot scopes (additions to existing): `users:read.email`, `im:write`, `chat:write` (already present).

DM messages:
- **Reminder:** `:hourglass: Heads up — your scheduled send for <client> fires at <time ET> and is missing <field>. <link to /scheduled/[draftId]>`
- **Bounce:** `:warning: Your scheduled send for <client> didn't fire (<reason>). It's back in Drafts. <link to /drafts/[draftId]>`

### UI surfaces

**Sidebar.** New entry `{ href: "/scheduled", label: "Scheduled", icon: "/icons/on-button.svg" }`, between Drafts and Sent. Optional small count badge when > 0.

**Send bar — `<SplitButton>`.** A new split-button component in `src/components/delivery-form/send-bar.tsx`:
- Primary action (left half): "Send" (unchanged).
- Dropdown caret (right half): opens a menu with "Schedule send...".
- "Schedule send..." opens a popover with the schedule picker.

**Schedule picker popover.** New component `src/components/delivery-form/schedule-picker.tsx`:
- Three preset buttons: "Tomorrow 9am ET", "Monday 9am ET", "In 1 hour".
- Date input (HTML5 `type="date"`) + time input (HTML5 `type="time"`, `step="300"` for 5-min increments) — both labeled in ET.
- A live preview line: "Will send: Mon, May 12 at 9:00 AM ET".
- "Schedule" confirm button. Disabled if time is in the past.

**`/scheduled` page.** New route `src/app/scheduled/page.tsx`. Table-style list sorted by `scheduledFor ASC`. Columns:
- Client
- Project
- Deliverable type
- Scheduled for (formatted ET)
- Status badge (ready / incomplete)
- Edit (link → delivery form for that draft)
- Cancel (X with AlertDialog confirmation → DELETE-schedule API)

Reuse `/sent` table styling where possible.

**Delivery form — scheduled-mode banner.** When opening a draft that has `scheduledFor` set, show a sticky banner at the top of the form:
> "Scheduled for Mon, May 12 at 9:00 AM ET — [Reschedule] [Cancel schedule]"

The Send bar primary button changes label to "Save schedule" (saves edits, keeps the scheduled time). Its split dropdown gains a "Send now" option that fires immediately and clears the schedule.

### API surface

- `POST /api/drafts/[taskId]/schedule` — body: `{ scheduledFor: string }`. Validates the draft is complete enough to schedule (note: per the design, incomplete schedules are allowed; this validates only that the time is in the future and the user is signed in). Sets `scheduledFor`, `scheduleStatus = "scheduled"`. Returns 200.
- `DELETE /api/drafts/[taskId]/schedule` — clears scheduling fields. Returns 200.
- `PATCH /api/drafts/[taskId]/schedule` — body: `{ scheduledFor: string }`. Reschedule existing. Also clears `lastReminderAt`.
- `GET /api/scheduled` — list scheduled drafts with completeness flag, sorted by `scheduledFor ASC`.
- `POST /api/cron/scheduled-sends` — Vercel cron endpoint. Auth via `CRON_SECRET`.

### React Query keys

- `["scheduled", "list"]` — `/scheduled` page list.
- `["draft", taskId]` — single draft (already exists).

Invalidate `["scheduled", "list"]` after any schedule mutation. The Drafts list (`["drafts"]`, existing) is also invalidated after a cancel-to-draft.

## Error handling

- **Schedule in the past** → 400 from the POST endpoint, toast in the UI.
- **Slack DM failure** → log + continue; do not throw from the cron.
- **Cron double-tick** → the `scheduleStatus = "firing"` atomic update prevents two ticks from sending the same item.
- **Cron outage > 30 min** → stale pass treats the item as a bounce.
- **Send flow fails inside the cron** → mark `scheduleStatus = null`, restore `scheduledFor = null`, log error, Slack DM the sender ("Send failed: <reason>; back in Drafts.").
- **Slack bot missing new scopes** → `users.lookupByEmail` returns an error; DM fallback logs `console.warn`. The bounce/send still happens; only the notification is missed.

## Testing

- Vitest unit tests for:
  - `isFormComplete(formData)` — covers each required field empty / present.
  - The cron's filter helpers (`findDueDrafts`, `findRemindableDrafts`, `findStaleDrafts`) — pure functions over a synthetic draft array.
- Manual end-to-end test plan on the Vercel deploy:
  1. Schedule a complete delivery for 6 minutes from now. Confirm fire at the right minute; confirm Delivery row created; confirm draft removed.
  2. Schedule an incomplete delivery 6 minutes out. Confirm bounce; confirm Slack DM received; confirm draft restored.
  3. Schedule an incomplete delivery 35 minutes out. Confirm reminder DM at T-30. Drop in the missing field. Confirm fire happens normally at T.
  4. Edit a scheduled item's content, save. Reschedule it. Cancel it back to drafts. Round trip.

## Migration

- `npx prisma db push` to add the three new columns (all nullable, safe).
- `vercel.json` cron config goes live on first deploy.
- New Slack bot scopes (`users:read.email`, `im:write`) must be added to the Slack app config in the Slack admin UI before the cron starts DMing — call this out in the implementation plan as a manual prerequisite.

## Open questions

None — all design decisions resolved during brainstorming on 2026-05-11.
