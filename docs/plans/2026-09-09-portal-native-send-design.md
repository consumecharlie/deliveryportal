# Portal-Native Send: Design

Date: 2026-09-09
Status: design, gated on confirming the Google OAuth consent screen type

## Goal

Move the delivery send path out of n8n and into the portal, so that the people
who send deliveries can see when their connection is broken and fix it
themselves, without routing every failure through one administrator.

## Why (the actual problem)

On 2026-09-09 Tony's Gmail OAuth credential expired. Two client deliveries
(Woodward Academy Sep 2, Shepard NGAUS Sep 9) logged as Sent with the ClickUp
task marked complete while no draft was ever created. Woodward sat undelivered
for a week. Full incident: [[reference_deliverable_portal_n8n_send]].

The silent-failure half is now fixed (n8n draft nodes are `stopWorkflow`, the
webhook responds `lastNode`, the portal records `Delivery.n8nStatus`). What is
NOT fixable in the current shape is the support loop:

1. Tony notices no draft and cannot tell why
2. He reports it to Michael, who investigates
3. The fix lives in n8n, which Tony has no account in
4. Michael reconnects it and reports back

Observability can be bolted onto n8n. **Self-service cannot**, as long as the
credentials live in a system the users have no access to. That is a structural
property of where the credentials sit, not a bug to patch.

**The unlock:** the portal already has a per-user Google OAuth relationship.
`src/lib/auth.ts` runs NextAuth with GoogleProvider restricted to
`@consume-media.com`. Tony already signs in with the exact account whose Gmail we
want to draft into. The "sign into Google" screen is the login he already uses;
it needs a broader scope and the refresh token kept.

## The gate

**Google OAuth consent screen type** (Cloud project `310995579064`):

- **Internal**: `gmail.compose` needs no verification. Proceed.
- **External**: adding a restricted Gmail scope triggers Google verification and
  possibly a CASA security assessment. Weeks and real cost. The remedy is
  usually switching the project to Internal, which should be available since the
  Workspace org owns it and sign-in is already domain-restricted.

Nothing in the Gmail half should start before this is confirmed. The Slack half
is unaffected and can proceed regardless.

## What n8n actually does today

Workflow `FIDejOggbPPWppIB`. Stripped down: markdown to HTML, a Switch on
`sender_email`, one Gmail draft call, one Slack post call. The portal already
does every hard part (merge, token resolution, Slack mrkdwn conversion, ClickUp
writes, delivery logging). This is roughly a hundred lines of glue, not a system.

## Decisions

| Question | Decision |
|---|---|
| Scope | Both Gmail and Slack. The expensive part is the OAuth plumbing and it is shared; building it twice is waste. |
| Cutover | n8n stays the DEFAULT pipeline. The portal path is opt-in per send until proven. |
| Client-visible change | None. The switchover must be imperceptible; enforced by golden-file tests, not by inspection. |
| Slack identity | Per-user Slack OAuth, so messages still post as the person. NOT the bot token. |
| Draft or send | A real per-delivery choice, defaulting to draft (today's behavior). |
| Scheduled sends | Force send-now. A scheduled draft nobody opens is a silent no-op. |
| Failure handling | Fail loudly. NO silent fallback to n8n: that is the exact failure mode just removed. |
| Send-as | Preserved. Draft-as-anyone stays open; send-now-as-someone-else is gated. |

## Architecture

### 1. Connections (the shared OAuth layer)

New `Connection` table keyed by (userEmail, provider):

```
userEmail    String
provider     "google" | "slack"
accessToken  String   // encrypted at rest
refreshToken String?  // encrypted at rest; Slack user tokens rarely rotate
expiresAt    DateTime?
scopes       String
status       "connected" | "needs_reconnect" | "revoked"
lastCheckedAt DateTime?
lastError    String?
@@id([userEmail, provider])
```

- **Google**: authorization-code flow with `access_type=offline` and
  `prompt=consent` to guarantee a refresh token, scope `gmail.compose` (covers
  BOTH `drafts.create` and `messages.send`, so one scope serves both behaviors).
  Kept separate from the NextAuth sign-in flow so a normal login never
  re-prompts for Gmail access.
- **Slack**: `oauth/v2/authorize` with `user_scope=chat:write`; the code exchange
  returns `authed_user.access_token` (`xoxp-`). Posting with that token posts as
  the person, matching today. No Slack app review is required for an app used in
  its own workspace. Needs `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` added; the
  portal currently has only `SLACK_BOT_TOKEN`.
- Token rotation stays OFF for Slack (the default), so Slack tokens effectively
  do not expire. Gmail is the fragile one.

**Settings > Connections**: each user sees their own Google and Slack status with
Connect / Reconnect. A `needs_reconnect` state raises a banner portal-wide.

### 2. Email HTML fidelity (the imperceptibility requirement)

**Do NOT reuse `src/lib/markdown-html.ts`.** It is built for TipTap ingestion and
its output differs from what clients receive today. Measured against the real
HTML from execution 11127:

| | n8n (what clients see today) | portal `markdownToHtml` |
|---|---|---|
| `##` heading | `<h3 id="...">` | `<h2>` |
| List item | `<li>text</li>` | `<li><p>text</p></li>` |
| Between blocks | nothing | `<p></p>` |
| `&` | `&amp;` | raw `&` |

The `<p>` inside `<li>` and the empty paragraphs are visible in most email
clients (extra vertical spacing), and headings would jump a size.

`headerLevelStart`, auto-generated header ids and `&amp;` escaping are
**Showdown** behaviors, which is what n8n's Markdown node uses. So the portal
gets a dedicated email renderer (`src/lib/email-html.ts`) using Showdown with
`headerLevelStart: 2`, mirroring the n8n node exactly.

**Acceptance test, not a vibe check:** capture `email_content` + `htmlEmail`
pairs from real n8n executions as golden files and assert the renderer
reproduces them byte for byte.

### 3. Send execution

`src/lib/send/` with one interface and two implementations:

```
sendDelivery(payload, { pipeline: "n8n" | "portal" }) -> SendOutcome
```

- `n8n`: today's webhook call, unchanged.
- `portal`: render HTML, then Gmail `drafts.create` or `messages.send` as the
  sender, and/or Slack `chat.postMessage` with the sender's user token.

Both return the same `SendOutcome`, which already maps onto the
`interpretN8nResponse` / `Delivery.n8nStatus` work so the Sent tab reports both
paths identically. The Sent tab can then distinguish **Drafted** from **Sent**,
which it currently cannot (it says "Sent" for what is only ever a draft).

### 4. Send-as

Mechanically identical to today: the Switch routes on `sender_email` to that
person's credential and the draft lands in THEIR mailbox (evidenced by the Sep 3
CallRail delivery: `sentBy=sadjr@`, `senderEmail=tony@`). The portal does the
same with that person's stored token. Only the storage location changes.

Improvements:
- Adding a sender stops requiring n8n surgery (today: a Gmail node, a credential
  and a Switch branch, which is why there are exactly six and an "ART Draft"
  catch-all). After: the person clicks Connect once.
- The sender dropdown shows connection health, so a dead credential is visible
  at selection time rather than after a silent failure.
- `AllowedSender` continues to curate who can be sent as.

**New capability to gate:** today every email is a draft, so the mailbox owner
always reviews before anything leaves. Send-as combined with send-now would let
mail leave Tony's account without Tony touching it. Draft-as-anyone stays open;
send-now is restricted to yourself unless explicitly permitted.

### 5. Pipeline toggle and rollout

A per-send pipeline choice, default `n8n`, orthogonal to the existing Test Mode:

| Test Mode | Pipeline | Use |
|---|---|---|
| on | portal | first tests: draft to `TEST_EMAIL`, no ClickUp or DB writes |
| off | portal | real sends once golden tests pass, volunteers first |
| off | n8n | the default until the portal path is proven |

The toggle only appears when the sender has a live connection for the channel.

## Security and trust

Storing refresh tokens means the portal can act as any connected user. This is
already true of n8n today; it is relocated, not new. Worth stating plainly
because it becomes more visible in your own app. Mitigations already present:
`AllowedSender` curation, and `Delivery` recording `sentBy` and `senderEmail`
separately so who-sent-as-whom is auditable. Tokens are encrypted at rest and
never leave the server.

## Testing

- Golden-file tests: renderer output vs real n8n `htmlEmail` for a spread of
  real deliveries (bullets, bold, links, headers, emoji, mentions).
- Unit: token refresh (valid, expired, revoked), status transitions.
- Unit: draft vs send routing; scheduled sends forcing send-now.
- Unit: send-as permission gating.
- The existing 330-test suite must stay green.
- Live: test-mode portal send per person before any client traffic.

## Files (anticipated)

| File | Role |
|---|---|
| `prisma/schema.prisma` | `Connection` model (migration) |
| `src/lib/connections.ts` | token storage, refresh, status |
| `src/app/api/connections/google/*` | OAuth start + callback |
| `src/app/api/connections/slack/*` | OAuth start + callback |
| `src/lib/email-html.ts` | Showdown renderer matching n8n |
| `src/lib/send/index.ts` | `sendDelivery` interface |
| `src/lib/send/n8n.ts` | existing webhook path |
| `src/lib/send/portal.ts` | Gmail + Slack direct |
| `src/app/settings/connections/page.tsx` | per-user connection UI |
| `src/components/delivery-form/send-bar.tsx` | pipeline toggle, draft/send choice |

## Rollout

1. Confirm the consent screen type (gate).
2. Connections layer + Settings UI. No send behavior changes. Safe to ship.
3. Email renderer + golden tests. Still no behavior change.
4. Portal pipeline behind the toggle, default off.
5. Test-mode sends, then real sends by volunteers.
6. Flip the default once clean, keeping n8n switchable.
7. Retire the n8n send path.

## Out of scope

- The n8n workflow's other consumers (it is also called by other workflows via
  `When Executed by Another Workflow`; those are unaffected and keep working).
- Changing message content, templates or the merge engine.
