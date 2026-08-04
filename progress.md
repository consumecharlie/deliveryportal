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

---

## 2026-06-30 — Dashboard: Vercel Data Cache (persistent across cold starts)

Replaced the per-instance module-level cache on `/api/tasks` with the **Vercel
Data Cache** via `unstable_cache` (5-min revalidate, tag `dashboard-tasks`).
Persists the mapped task list at Vercel's infra level, so it survives serverless
cold starts — the ~15s ClickUp pull now happens rarely instead of on every cold
load, and stale-while-revalidate refreshes in the background. **No Neon
involvement** (dashboard stays Neon-free → no compute-burn surface), no cron.

Tradeoffs accepted (chosen to "see how it feels" first):
- Cache resets on each deploy → first dashboard load after a deploy pays the
  full ClickUp fetch. Mostly stings during active dev, not normal team use.
- Up to 5-min staleness; best-effort (can evict early).
- `?refresh=1` on `/api/tasks` bypasses the cache and pulls fresh on demand
  (manual escape hatch; no UI button yet).
- Next 16's `revalidateTag` now needs a cache-profile arg (new `'use cache'`
  model), so the refresh path just calls the fetch directly instead.

Fallback if the deploy-reset proves annoying: demand-driven Neon-backed cache
(survives deploys; negligible burn since keep-warm already holds Neon awake
during business hours).

**Status (2026-06-30):** Shipped and live. Parked here intentionally — Michael
will live with the Vercel Data Cache for a bit before deciding whether the
deploy-reset is annoying enough to warrant the Neon-backed fallback. No action
until he circles back.

---

## 2026-08-04 — Multiple Primary contacts: only one got the email

### Bug
When a ClickUp project has >1 contact set to **Primary** (e.g. KeyBank — Travis
+ another), only ONE received the email. Root cause was portal-side, not n8n:
`delivery-form.tsx` derived the "To" with `contacts.find(c => role==="Primary")`
— the FIRST primary only — and the CC filter *excluded* all primaries. So a
second primary landed in neither To nor CC and was dropped before n8n saw it.

### Fix
Address the "To" to ALL primaries:
- `primaryContacts = contacts.filter(role==="Primary")`, then
  `displayToEmail = editedToEmail ?? primaryContacts.map(email).join(", ")`.
- CC unchanged (non-primary, non-log) — no duplication.
Removed now-dead `primaryContact`/`postToSlack` locals (every consumer already
used `showSlack`).

Verified the n8n side needs no change: workflow `FIDejOggbPPWppIB` ("Sub
Workflow: Email and Slack") Gmail nodes map `sendTo: {{ $json.primary_email }}`
/ `ccList: {{ $json.cc_emails }}`, and the Gmail node accepts a comma-separated
`sendTo`. (Inspected via the n8n REST API — the n8n MCP server is currently
broken with a missing `ssrf-protection` module.) The greeting already addresses
everyone (`formatContacts*` include all non-Log contacts).

Build + 169 tests green. Needs a live multi-primary test send to confirm.

---

## 2026-08-04 — Feedback deadline time now shows in the snippet

### Question / finding
"If a feedback deadline has a time on the due date, does it show in the snippet?"
No — the formatter used `toLocaleDateString` (date only, and no timezone → UTC).
Also learned ClickUp's v2 API (our token) never returns the `due_date_time`
flag, only the raw `due_date`. But probing all 214 feedback deadlines live: 204
sit at exactly 08:00:00 UTC (ClickUp's date-only sentinel → renders 3–4am ET),
and the rest are real times (e.g. task 86ajn3fj2 = 16:00 UTC = 12:00 PM ET). So
"has a real time" = due timestamp is NOT at 08:00 UTC.

### Change
- `src/lib/feedback-deadline.ts` — `formatFeedbackDeadline(dueMs)` returns
  `{ formattedDate, timeLabel }`, all in Eastern time. `timeLabel` is "" for the
  08:00-UTC date-only sentinel, else e.g. "12:00 PM ET". (Also fixes the latent
  no-timezone bug — dates now render in ET, not the Vercel UTC server tz.)
- Both routes that build the deadline (`/api/tasks/[taskId]`, projects `detail`)
  use it; `FeedbackDeadline` type gains `timeLabel`.
- `template-merge.ts` — new `injectTimedFeedbackDeadline` transform (mirrors the
  flexible/rushed ones): when a real time is set and the delivery isn't
  rushed/flexible, rewrites "EOD <date>" → "<date> by <time>" (drops the
  contradictory "EOD"). Wired into email, Slack, and add-on merges;
  `feedbackDeadlineTime` threaded through `MergeVariables` from the form.

Wording chosen by Michael: "Feedback Deadline: Tue, Aug 4 by 12:00 PM ET"
(date-only unchanged: "EOD Tue, Aug 4"). Covered by
`feedback-deadline-time.test.ts` (8 cases). 177 tests green.

Note: relies on the 08:00-UTC date-only sentinel (empirically 204/214). If
ClickUp changes that default, the detection would need revisiting.

---

## 2026-08-04 — Client Preferences feature (shipped)

Per-client access-constraint flags (driving case: KeyBank can't open Google
Docs). Design + plan: `docs/plans/2026-08-04-client-preferences-{design,}.md`.

Built via subagent-driven execution (8 tasks, TDD, per-task review):
- **`ClientPreference` Neon table** keyed by ClickUp folderId (additive `db push`
  applied to prod). Restrictions stored as keys → domains via a code-side map
  (`RESTRICTION_OPTIONS`, v1 = Google Docs/Drive) unioned with per-client custom
  domains. Adding a predefined restriction = one map entry, no migration.
- **`src/lib/client-preferences.ts`** (pure, tested): `resolveBlockedDomains`,
  `findBlockedLinks`, `collectReviewLinkUrls`.
- **Admin CRUD** at `/api/settings/client-preferences` (+ `[folderId]` DELETE) and
  `/api/settings/clients` (folder picker). Managed in a new **Settings → Client
  Preferences** section (mirrors Allowed Senders).
- **Editor**: matching preference folded into `/api/tasks/[taskId]`; persistent
  warning **banner** at the top of the delivery editor.
- **Send/Schedule guardrail**: soft re-prompt dialog for flagged clients
  (gates `handleSend`/`handleSchedule` — covers both Send-button branches +
  scheduling), escalating with a callout when a review link matches a blocked
  domain. Soft override ("Send anyway"/"Go back"); never hard-blocks.
- **DB-safe**: every preference read degrades to null/no-op if the DB is down;
  sends are never blocked. Neon-touch is demand-driven (no new cron).

189 tests green, build clean. **Follow-up:** seed KeyBank in the live Settings
UI (message + Box destination link + Google restriction) after deploy.

### 2026-08-04 follow-ups
- **Banner restyle:** bright `#DBEF00` background + black high-contrast text; title
  uses a colon, not an em dash.
- **Field relabel:** optional `deliverableLinkLabel` on `ClientPreference` (pushed
  to prod). When set, the review-links section shows it instead of "Google
  Deliverable Link" for that client (e.g. "Box Link" for KeyBank), on both the
  primary and add-on link fields. Editable in Settings. Field label only — the
  link value/behavior is unchanged.
- **Inline link warning:** a blocked-domain review link now flags the instant it's
  entered (red border + inline note "<Client> can't open this link...") on the
  standard, flexible, and extra link fields, driven by the same detection as the
  send-time guardrail. So the mistake is caught at input, not only at Send.

### 2026-08-04 fixes (client-prefs polish + cache)
- **Guardrail ordering:** the client-preference blocker now fires on the Send/
  Schedule click, *before* the Send Delivery confirm (was gating the send action
  so it appeared after). No-lint confirm converted to a controlled dialog.
- **Em dashes:** removed from the guardrail dialog title and the Settings relabel
  helper text.
- **Editor staleness:** the delivery editor now loads fresh ClickUp data on every
  open (staleTime 0 + refetchOnMount always; window-focus refetch disabled so it
  can't clobber a mid-edit form). Fixes stale template/field data (e.g. a link
  field showing an old "Frame.io Review Link" label).
- **Still open:** dashboard `/api/tasks` Vercel Data Cache (5-min + resets each
  deploy) causes slow cold loads, amplified by many deploys in a dev session.
  Candidate: swap to demand-driven Neon-backed cache (survives deploys). Pending
  Michael's call.

### 2026-08-04 — Dashboard now on a Neon-backed cache (resolved the open item)
Replaced the Vercel Data Cache on `/api/tasks` with a `DashboardCache` Postgres
table (pushed to prod), stale-while-revalidate:
- Serves the cached list instantly; refreshes in the background via `after()`
  when older than 5 min. **Survives deploys** — no more repeated ~15s cold loads
  after each push (the key pain during dev sessions).
- Demand-driven (no cron); falls back to a live ClickUp fetch if Neon is down.
  `?refresh=1` forces fresh. Verified the Json upsert/read round-trip against
  live Neon.
