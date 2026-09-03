# Client Portal: Design

Date: 2026-09-03
Status: requirements gathered, design drafted, open questions pending Michael

## Goal

Give every client one bookmarkable link where they can see every deliverable
we have ever shared with them, jump to the review links, see when feedback is
due, and confirm that all feedback is in. Kill message sprawl: today each
deliverable is its own email, links get buried, and clients cannot find old
ones.

Long-term the delivery email shrinks to "we added X to your portal, click here"
and the full delivery snippet lives in the portal. Phase 1 is additive: the
full email/Slack delivery still goes out and the portal mirrors it.

## Decision: build inside the deliverable portal

Same Next.js app, same Neon database, new client-facing route surface. Reasons:

- Every send already writes a `Delivery` row (client, project, deliverable
  type, merged snippet body, sender) plus `DeliveryLink` rows per link. That
  is 80% of the portal's data.
- The send route is the natural publish point. No second database, no sync.
- ClickUp, Slack, and n8n clients are already wired.

Costs to manage:

- The app is internal-only today. `src/middleware.ts` gates everything behind
  Google OAuth. The client routes need a tightly scoped public carve-out.
- Client pages need their own layout, branding, and no internal nav.
- Optionally map a second domain (e.g. a `consume-media.com` subdomain) to the
  same Vercel project so the client-facing URL feels separate.

## Decisions from requirements (2026-09-03)

| Topic | Decision |
|---|---|
| Access | Bare unguessable link per client and per project. No login for now. |
| Scope | Client = ClickUp client folder. Two views: whole-client portal (all projects, full history) and single-project portal. Both shareable. |
| Client eligibility | Assume every client can use it. No per-client opt-in gate in v1. |
| History | Everything in the `Delivery` table since 2026-03-21. No ClickUp seeding in v1 (see Seeding). |
| Links | Every link on the delivery appears, not just a primary. |
| Grouping | Project, then deliverable, with a version-history dropdown (Frame.io style). Latest version is the card; older versions behind the toggle. |
| Resends | A resend replaces its original in the client view. Original stays in the DB and internal analytics. |
| Snippet mirror | Render the email-style body. For Slack sends, strip mention tokens to plain names. Snippets will evolve to drop the greeting once the short notification carries the client's name. |
| Feedback deadline | Live from ClickUp (the paired Feedback Deadline task). Fallback when no task exists: send date + feedback window in business days. The deadline is never blank. |
| Action items | Dashboard panel listing deliverables awaiting the client's feedback, each with a confirm button that clears it. |
| Confirmation | Anyone with the link can confirm. Undo is allowed but must warn that it extends the feedback window and delays the timeline. |
| Confirmation side effects | Mark the ClickUp Feedback Deadline task complete, comment on it tagging the PM team, post to the project's Slack channel. |
| Slack channel | Always the project's internal channel (#client-project), never the connected client channel. Found by crawling Slack and matching the ClickUp list name, confirmed once by a PM, stored per project. A missing delivery channel ID means an email client. |
| Overdue | Portal shows overdue state. We get a Slack nudge. Client gets reminder emails before the deadline (cron). |
| Short notification message | Phase 2. Editable template: backlog. |
| Direct feedback | Out of scope. Instead a "reach out" form styled like a chat box that posts to the project Slack channel or emails us. |
| Internal visibility | Internal portal shows client-portal state: confirmed by whom, when, and open/view tracking. |

## What the codebase tells us

Facts gathered 2026-09-03 that shape the build:

- `Delivery` has 259 rows since 2026-03-21 across 52 project lists and 36
  clients. 149 were Slack sends, 3 are resends.
- `Delivery.clientFolderId` and `DeliveryLink.clientFolderId` are **empty on
  every row**. `clientName` and `projectListId` are always populated. Client
  grouping must derive folder IDs from ClickUp (list to folder) and backfill.
- The feedback deadline is **not persisted** on `Delivery`. It is a merge
  variable resolved at send time. Live-from-ClickUp is therefore the only way
  to get it without a schema change, and matches the decision above.
- `feedback-conflict.ts` already has `windowBusinessDays()` with US holiday
  awareness. The fallback deadline is send date plus that many business days.
- The `Slack Weekly Status Channel ID` field on the Slack Channel task is
  **never** a posting destination (Michael, 2026-09-03). The internal project
  channel must be found by crawling the Slack workspace. Feasibility test on
  the 52 known lists, matching ClickUp project name tokens against
  non-shared channel names: 47 confident, 4 ambiguous (NextGen TL projects
  and Stack Overflow ones where the channel carries the full client name),
  1 unmatched (Iterable Brand Campaign, likely private or archived). The bot
  is a member of none of the internal channels, so posting requires joining
  (`joinChannel()` in `slack-audit.ts` already exists; private channels need
  an invite).
- ClickUp project lists follow a stable pattern per deliverable:
  - "Share <Deliverable> with Client" task, Project Task Type 11, holds the
    review link fields, and its `date_closed` is the send date.
  - "Confirm <Deliverable> Feedback Received" task, Project Task Type 12
    (Feedback Deadline), status `waiting on client` while open, `complete`
    once feedback is in. Its due date is the feedback deadline.
  This pairing is the action-item lifecycle, and it exists for pre-portal
  projects too.
- `DeliveryLink.linkType` is `standard` (from a template variable such as
  `frameReviewLink`, `googleDeliverableLink`, `flexLink`, `loomReviewLink`,
  `animaticReviewLink`) or `extra` (free-labelled).
- A Slack bot token is already in use (`src/lib/slack-dm.ts`), so
  confirmations can post directly without going through n8n.

## Seeding history: what ClickUp can and cannot give us

Michael's correction (2026-09-03): share tasks only started carrying review
link fields once the deliverable portal was in use. Census across the 52
project lists the portal knows about confirms it and shows a second gap:

| Completed "Share ... with Client" tasks | Count |
|---|---|
| Total | 703 |
| With review links (all of these are in the Delivery table) | 248 |
| Without links, closed before portal go-live (2026-03-21) | 166 |
| Without links, closed after go-live, not in the Delivery table | 289 |

So the portal holds roughly a third of completed share tasks. The other two
thirds have no links anywhere in ClickUp. Some of the post-go-live ones are
not client deliverables at all ("Share Travel Details", "Share Production
Schedule"), but many are real sends that bypassed the portal.

Consequences:

- Links for pre-portal (and bypassed) sends cannot be recovered from ClickUp.
  Possible sources are sent mail in Gmail and Frame.io, both messy. Not worth
  it for v1.
- Decision: no ClickUp timeline seeding in v1. The client portal is backfilled
  from the `Delivery` table only. A linkless timeline entry adds little for
  the client and would need its own explanation.
- Add an internal "attach links" action on any linkless entry so a PM can fill
  in the ones that matter on demand instead of a bulk recovery effort.
- Adoption matters more than backfill: a client portal is only as complete as
  the team's use of the deliverable portal. Worth surfacing bypassed share
  tasks internally (a "closed outside the portal" audit) so the gap stops
  growing.

Backfill work that remains: fill `clientFolderId` on every existing
`Delivery` and `DeliveryLink` row from ClickUp (list to folder), so client-level
grouping works from day one.

## Data model additions (proposed)

- `Delivery.clientFolderId` backfilled from ClickUp for all existing rows.
- `PortalAccess`: `id`, `scope` (`client` | `project`), `clientFolderId`,
  `projectListId?`, `token` (unguessable), `createdBy`, `createdAt`,
  `revokedAt?`. Tokens are revocable and re-issuable without touching data.
- `FeedbackConfirmation`: `id`, `deliveryId`, `feedbackDeadlineTaskId`,
  `confirmedAt`, `confirmedByName?`, `undoneAt?`, `slackMessageTs?`.
- `PortalView` (optional, for "has the client opened it"): `accessId`,
  `deliveryId?`, `viewedAt`, `userAgent`.

## Client-facing pages (proposed)

- `/p/[token]` client or project portal, decided by the access row's scope.
  - Dashboard: action items (awaiting feedback, with deadline and confirm
    button), upcoming deadlines, recent deliveries.
  - Deliverables: grouped by project then deliverable, latest version as the
    card, version dropdown for history. Each card: sent date, all links,
    scope reminders (revision rounds, feedback windows), snippet body.
  - Reach out: chat-styled form, posts to project Slack channel or emails.
- Own layout, Consume Media branding, no internal navigation, `noindex`.

## Middleware carve-out

Allow `/p/*` and `/api/portal/*` without a session. Every portal API route
must resolve the token to an access row first and scope every query to that
client folder or project list. Nothing under `/api/portal` may accept a raw
list or folder ID from the client.

## Confirmation flow

1. Client clicks "All feedback is in" on an action item.
2. Portal writes `FeedbackConfirmation`, then:
   - sets the ClickUp Feedback Deadline task to `complete`
   - comments on it tagging the PM team
   - posts to the project's Slack channel (delivery channel for Slack
     clients, mapped channel for email clients)
3. Undo: warns that undoing extends the feedback window. Reopens the ClickUp
   task, posts a follow-up Slack message, records `undoneAt`.

## Send-route hook (phase 1)

No change to what the client receives. The send route already writes the
`Delivery` row; the only addition is `clientFolderId`. Phase 2
swaps the full snippet for the short notification and the portal becomes the
canonical home of the body.

## Resolved 2026-09-03 (round 2)

- **Slack destination:** internal #client-project channel, always. Resolved
  by a Slack crawl: rank non-shared channels by name-token overlap with the
  project name plus client name, auto-select when confident, otherwise a PM
  picks from the top suggestions in the internal portal. Store the mapping
  in a new `ProjectChannel` table (`projectListId`, `channelId`,
  `channelName`, `confirmedBy`, `confirmedAt`). Join the bot on confirm.
  Reuses the ranking approach from the Configure-from-channel wizard.
- **PM tag on the ClickUp comment:** the "Project Management" user group
  (id `a69e7430-c3bd-45d7-95da-4ca97ebe1015`, currently Michael Rosenberg
  50799924 and Sadjr Williams 106025619). Resolve group membership at comment
  time and mention each member, so the tag follows the group if it changes.
  Also set `group_assignee` on the comment if the API accepts it; validate
  during implementation. Hardcoded fallback: the two user IDs above.
- **Navigation:** a project-level link opens that project, with a breadcrumb
  up to the client-level view.
- **Backfill:** from the `Delivery` table only. No ClickUp timeline seeding
  in v1. Still backfill `clientFolderId` from ClickUp for the existing rows.
- **Reminders:** addressed to the primary contact, all project contacts
  copied. Cadence: one business day before the deadline and the morning of.

## Open questions

1. Naming, to confirm with Michael: client-facing product name (default
   "Client Portal"), URL path (default `/portal/<token>`), and the
   confirmation button label (default "All feedback is in").
