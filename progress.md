# Progress Log

## 2026-06-24 / 2026-06-25 — DB outage, migration to Consume Charlie, and lost-send recovery

### TL;DR
The portal's DB-backed tabs (Sent/Drafts/Scheduled/Analytics) went blank because the
database it ran on — in a **personal free Neon org** — hit the free tier's 100
compute-hour/month quota. We unblocked it, **migrated the database to the Consume
Charlie org**, **recovered 5 client sends** that went out during the outage but were
never logged, fixed the underlying compute burn, and cut production over to the new
database with zero data loss.

Production: `delivery.consume-media.com`

---

### What happened (diagnosis)
- **Symptom:** Dashboard worked, but Sent / Drafts / Scheduled / Analytics were blank.
- **Why that split:** Dashboard reads ClickUp; the other tabs read Neon Postgres. So the
  break was isolated to the database.
- **Root cause (initially misdiagnosed):** the portal's database was **not** in the
  Vercel-managed "Consume Charlie" Neon org — it was in Michael's **personal free Neon
  org** (`org-green-grass`, project "Project Delivery Portal" / `weathered-pine-55788330`,
  endpoint `ep-mute-mud-aio0ub0c`). The every-minute `scheduled-sends` cron burned through
  the free tier's **100 compute-hours/project/month** around June 19, hard-stopping compute
  with "exceeded the compute time quota."
- A brief Scale upgrade of the Consume Charlie org didn't help (wrong org) and was reverted
  to Launch. The real unblock was upgrading the **personal org** to Launch (usage-based, no
  hard quota).

### Compute-burn fixes (root cause of the burn)
Every-minute crons + visibility-unaware client polling kept databases awake 24/7 so Neon
never auto-suspended:
- **Deliverable portal** `scheduled-sends` cron: `* * * * *` → `*/5` → later `*/15`.
- **Sales portal** `jobs/cron`: `* * * * *` → `*/5` → later `*/15`; also rewritten to
  **drain the whole ready queue per tick** (bounded) so the lower frequency doesn't hurt
  burst throughput.
- **Time portal** (consume-media-insights): scorecard `AutoRefresh` + Header sync-status
  poll now **pause when `document.hidden`** (embedded scorecards left open in ClickUp docs
  were polling round the clock).

### Database migration (free personal org → Consume Charlie)
Neon does not allow transferring a project *into* a Vercel-managed org, so it was a copy:
- **New DB:** `neon-delivery-latika` (project `calm-wildflower-66716640`, endpoint
  `ep-fragrant-morning-adxtolii`) in the **Consume Charlie** org, region `aws-us-east-1`
  ("Washington, D.C." in Vercel = same region as everything else).
- Created schema with `prisma db push`, copied all rows with a Prisma script (handled the
  `Delivery` self-FK via null-then-restore), set autosuspend to the Launch max (5 min).
- Repointed prod `POSTGRES_URL` (Vercel) and local `.env.local` to the new DB.
- Cut over via an empty-commit redeploy; ran a final straggler diff (0 drift) and verified
  the live Sent tab reads the new database.

**Row counts migrated (old → new, all verified equal):**
Delivery 122 · DeliveryLink 146 · Draft 51 · TemplateVersion 128 · AllowedSender 6.

### Lost-send recovery (Jun 22–24)
The send flow calls n8n **before** the (graceful) DB log write, so during the outage the
emails/Slack went out but the `Delivery` rows were lost. Recovered from n8n execution
history (workflow "Sub Workflow: Email and Slack" `FIDejOggbPPWppIB`) + ClickUp:
1. VitalEdge — Virtual Testimonials — **Post Script V2** (email)
2. Care Logistics — Animated Brand Anthem — **Storyboards V2** (email)
3. Georgia Farm Bureau — GFB 2026 Commercials — **Edit V1** (email)
4. Georgia Farm Bureau — GFB 2026 Commercials — **Potential Master** (email)
5. Stack Overflow — Leaders of Code Podcast — **LoC Edit V1** (Slack)

For each: core fields from the n8n payload; client/project/deliverable-type/department from
ClickUp; `DeliveryLink` rows reconstructed from the sent content (6 links total).
`wasEdited` set false (unknowable from payload).

### Plan / autosuspend notes (both orgs on **Launch**)
- Launch only allows enable/disable scale-to-zero (fixed **5 min**); custom 60s autosuspend
  is **Scale-only** and auto-reverts to 300s on downgrade.
- Because of that, a cron firing every ≤5 min keeps the DB awake 24/7. Moving the crons to
  **every 15 min** lets the databases idle and suspend between ticks (~⅓ uptime vs ~always).
  Tradeoff: scheduled sends fire within ~15 min (not ~5); "send now" is unaffected.

### Commits
| Repo | Commit | Change |
|---|---|---|
| deliverable-portal | `4993058` | scheduled-sends cron → `*/5` |
| deliverable-portal | `7c4dea1` | redeploy to pick up new `POSTGRES_URL` (cutover) |
| deliverable-portal | `929581e` | scheduled-sends cron → `*/15` |
| sales-portal | `fc206f0` | jobs/cron → `*/5` + drain whole queue per tick |
| sales-portal | `b1ae5ca` | jobs/cron → `*/15` |
| consume-media-insights | `dda74ea` | client polling pauses when tab hidden |

### Remaining cleanup (manual, no rush)
- [ ] Keep the **old free-org DB** ("Project Delivery Portal" / `weathered-pine`) a few days
      as a safety net, then **delete** it (deletion is the only irreversible step).
- [ ] Drop the **"Michael" Neon org back to Free** (safe to do anytime; data is plan-independent).
- [ ] Delete the temporary secret files from Dropzone: `neon.rtf`, `postgres_URL.rtf`,
      `new_postgres_URL.txt`.
- [ ] In a few days, check the Neon **Usage** tab to confirm the lower compute baseline.

---

## 2026-06-26 — Business-hours keep-warm (cold-start fix)

### TL;DR
After the migration, the first portal load each morning was very slow. Diagnosed as an
**expected Neon scale-to-zero cold start** (Launch plan suspends compute after 5 min idle;
only the `*/15` cron touched the DB overnight). The DB itself is healthy — warm queries
~20ms, connect ~150ms, 127 Delivery rows. Added a **business-hours keep-warm ping** so the
compute stays awake when people actually use the portal, and still idles cheaply overnight.

### Change
- New route `src/app/api/cron/keep-warm/route.ts`: CRON_SECRET-authed; runs `SELECT 1` only
  during **8am–7pm ET on weekdays** (DST-safe via `Intl`/`America/New_York`); off-hours it
  returns immediately **without touching the DB** so Neon can still scale to zero.
- `vercel.json`: added `{ "/api/cron/keep-warm": "*/4 * * * *" }`. Every 4 min beats the
  5-min autosuspend, so the compute never suspends inside the business-hours window.
- Net effect: fast loads during the workday (~$10/mo est. compute), idle overnight/weekends.

---

## 2026-06-26 — Scope dropdowns now reflect ClickUp options (no code change to add options)

### Problem
New options added to the **Revision Rounds** and **Feedback Windows** dropdown
custom fields in ClickUp weren't showing in the portal — and the selected value
rendered **blank**. Root cause: those two selects used **hardcoded** option arrays
(`1,2` and `Same day/24 Hours/48 Hours`) in `scope-section.tsx`. A `Select` shows
blank when its current value isn't among its options, so a task set to a new option
(e.g. revision "3") had nothing to match. The merge preview still showed the right
value because it reads the task's raw field value, not the constrained option list.

### Fix
Sourced the options live from ClickUp's field definitions, same pattern Department
and Deliverable Type already use:
- `extractDropdownOptions(fields, fieldId)` in `clickup.ts` — returns the field's
  `type_config.options` as `{value,label}` keyed by option name, in ClickUp order.
- `/api/tasks/[taskId]` now returns `revisionRoundOptions` / `feedbackWindowOptions`
  (added to the `TaskDetail` type).
- `ScopeSection` and the add-on inline selects consume those options; hardcoded lists
  remain only as a fallback if the API returns none. `withCurrentValue()` also guards
  against ever rendering a real value as blank.

**Result:** adding/renaming a dropdown option in ClickUp now appears in the portal
automatically — no code change. (ClickUp task fetch isn't cached, so it's immediate.)

---

## 2026-06-26 — Flexible feedback windows reframe the deadline line

### Problem
When Feedback Windows = "Flexible", the snippet still rendered a hard
"**Feedback Deadline:** EOD <date>", which contradicts the flexibility.

### Fix
`injectFlexibleFeedbackNotice()` in `template-merge.ts` (mirrors the existing
`injectRushedNotice` pattern): when `feedbackWindows` is "Flexible" (and the
project isn't Rushed), it rewrites the deadline bullet to:

> **Feedback Deadline:** We're aiming for ~<date> to stay aligned with the
> project plan, but this can flex with your team's timeline.

Wired into email, Slack, and the add-on combined merge. Rushed projects keep
their fixed-deadline alert (rushed wins, since a rushed project isn't flexible).
The "Feedback Windows: Flexible" line is untouched. Covered by
`flexible-feedback.test.ts` (4 cases).

**Wording refinements (same day):**
- Dropped the em dash for a period, per house style (no em dashes in client copy).
- Dropped the leading "Flexible." prefix — the Feedback Windows bullet directly
  above already says "Flexible", so the deadline line starts at "We're aiming…".

---

## 2026-06-30 — Draft persistence gaps + dashboard 2-minute load

### 1. Draft toggles not persisting
`DeliveryFormState` never carried the Scope toggles or the channel choice, so
they were neither saved nor restored. Audited every `useState` in
`delivery-form.tsx`; three user options were missing from the draft round-trip:
- `repeatClient` (the reported one)
- `rushedProject` (same bug)
- `deliveryMode` (Email/Slack toggle — a manual override was lost on reload)

Added all three to the `DeliveryFormState` type, the saved `formState` object,
and the draft-load restore block (boolean toggles restored with a `typeof`
guard so an explicit `false` reloads and older drafts without the keys are
skipped). Everything else already round-tripped; the remaining state is
UI-only/derived (modals, lint, edit-mode, schedule, testMode) and correctly not
persisted.

### 2. Dashboard ~2-minute load
Root cause: `/api/tasks` fanned out one `/list/{id}/task` call per list across
the whole Projects space (~30 lists incl. non-deliverable lists like Billable
Hours/Fonts), deep-paginating with `subtasks=true`, then discarded everything
that wasn't a Delivery Deadline. Measured against live ClickUp:
- Old approach (space-wide, all tasks, subtasks): **~95s**, 2,216 tasks, 23 pages.
- New approach (Filtered Team Tasks, custom-field filter): **~15s**, 262 tasks, 3 pages.

`getSpaceTasksByDropdownField()` in `clickup.ts` queries ClickUp's Filtered Team
Tasks endpoint (`/team/{id}/task`) with a dropdown custom-field filter
(Project Task Type = Delivery Deadline) scoped to the Projects space. The
endpoint returns full task objects (folder/list names, status, assignees,
custom_fields, url), so it's a drop-in for the dashboard mapping. ~6× faster
cold; the existing 3-min in-memory cache makes warm loads instant.

Verified end-to-end against live ClickUp: 262 tasks, 0 missing client/project
names. Build + 169 tests green.

**Possible follow-up (not done):** 15s cold is still noticeable on a serverless
cold start (module cache is per-instance). A Neon-backed stale-while-revalidate
cache (optionally pre-warmed by the keep-warm cron) would make it feel instant.
