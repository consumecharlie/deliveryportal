# Project Communications Audit — Design

**Date:** 2026-08-05
**Status:** Approved (brainstorming) → ready for implementation plan

## Problem

Projects keep going out half-configured, and the breakage only surfaces at send
time (or after). Real cases:
- **Goldie**: Slack channel + contact Slack user IDs were set in ClickUp, but the
  **n8n bot wasn't in the channel**, so it couldn't post.
- **KeyBank**: two Primary contacts, only one got the email (since fixed).
- Recurring: the **Slack delivery channel ID is simply not filled in** on projects
  that are Slack clients.

We want a cross-project audit console that **detects** these config gaps and, where
safe, **fixes** them in one click — especially "which client Slack channels do /
don't have the bot in them."

## Decisions (from brainstorming)

- **Shape: a cross-project audit page** (birds-eye, find half-configured projects
  before they bite), not a per-project inline panel (that can come later).
- **Fix-it: hybrid** — one-click where genuinely safe (bot self-join of public
  channels; trigger the existing user-ID sync), guided/deep-link for everything
  that lives in ClickUp or needs a human.
- **Mode is inferred from contacts, not set explicitly:**
  - contacts have email, **no Slack handles** → **Email client**
  - any contact has a **Slack handle** → **Slack client** (the signal), which then
    *requires* a Slack delivery channel + Slack user IDs + the bot in the channel.
- **Serve model: Approach 1** — on-demand scan cached in Neon, instant open, a
  **Re-scan** button, and per-project re-scan after a fix. No new cron.

## Confirmed feasibility (live-tested)

- **Slack bot detection works.** The portal's `SLACK_BOT_TOKEN` **is** the n8n app
  (`auth.test` → user `n8n`, team Consume Media). Even though the bot is "added"
  as an app/integration, Slack treats its bot user as a channel member, so
  `conversations.info(channelId).is_member` is accurate (tested: `#avoxi-consume`
  → in, `#general` → not in). The workspace has ~1,012 channels and the bot is in
  ~25 — so the audit must check only the **channels configured on projects**, not
  the whole workspace.
- **Bot self-join** works for **public** channels (`conversations.join`); **private
  / external-shared** channels (most client channels) require a human `/invite` —
  the bot cannot add itself.
- **"Find Slack ID" workflow** (`h8e33InXoUk2ExaR`) is active, runs every 6h +
  manual trigger, **no webhook**. To fire on demand we add a Webhook trigger node
  (~2-min n8n edit or via the n8n API during build), then POST to it.

## Architecture & data flow

- **Audit engine** `src/lib/comms-audit.ts` (pure): given a project's resolved
  config (contacts, slackChannelId, projectPlanLink, deliverable-type/template)
  plus Slack membership for its channel, returns typed `AuditIssue[]`. No I/O →
  fully unit-testable.
- **Scan**: iterate active projects (reuse folder/list enumeration + the sibling
  resolution already in `/api/projects/[listId]/detail`), fetch Slack
  `conversations.info` per configured channel, run the engine, write results to a
  Neon `AuditResult` cache. Each project scans independently.
- **Read**: the page reads the cached `AuditResult` (instant). `POST
  /api/audit/scan` runs a full sweep; `POST /api/audit/scan?listId=…` re-scans one
  project (used after a fix).

## The check engine (mode-aware)

Derive mode per project, then check only what matters:

**Email client** (emails, no Slack handles)
- every non-Log contact has a valid email

**Slack client** (any contact has a Slack handle)
- Slack **delivery channel is set**  *(most common gap)*
- **n8n bot is in that channel** (`conversations.info` → is_member; info error on a
  private channel also means "can't see it")
- every Slack contact has its **Slack user ID** filled (handle present, ID blank →
  per-contact flag)

**Both modes**
- at least one contact
- at least one **Primary** contact (and surface when there are multiple, since that
  changed send behavior)
- **project plan link** present
- **deliverable-type → template** mapping exists

Each `AuditIssue` = `{ type, severity: 'blocker'|'warning', message, fix }`.

## Audit page UI (`/audit`, new nav item)

- Table: one row per project — client / project, a status pill (✓ Healthy /
  "2 blockers · 1 warning"), derived mode, and the channel's bot status.
- Expand a row → its issues, each with a **Fix** control.
- Top: "Only projects with issues" filter, last-scan timestamp, **Re-scan**.
- (Nav label/route "Audit" is a placeholder — trivially renamable.)

## Fix actions

| Issue | Fix |
|---|---|
| Bot not in **public** channel | **Join** — `conversations.join`, one click |
| Bot not in **private/external** channel | show channel + copyable `/invite @n8n` |
| Missing channel ID / contact / role / plan link | **Open in ClickUp** deep-link to the task/field |
| Missing Slack user IDs | **Run Slack user-ID sync** → POST to the Find Slack ID webhook, then re-scan |

Fix APIs: `POST /api/audit/fix/join-channel` (channelId), `POST
/api/audit/fix/sync-user-ids`. Each returns success/failure and triggers a
single-project re-scan.

## Error handling

- Per-project isolation: a ClickUp/Slack failure marks that row "couldn't check,"
  never breaks the page.
- DB down → page shows "no scan yet — run one"; scan still works, just can't cache.
- Fix actions surface success/failure via toast and re-scan to confirm.

## Testing

- **Unit (real coverage)** on the pure engine: mode inference (email vs Slack);
  each check fires/doesn't per mode; handle-without-user-ID; bot-not-in-channel;
  no-Primary vs multiple-Primary; missing plan link / template; severity mapping.
- **Lighter**: scan aggregation, page render, fix-action wiring.

## Out of scope (v1 / YAGNI)

- Per-project inline health panel in the editor (phase 2).
- Auto-writing ClickUp fields (channel IDs, contacts) from the portal.
- Validating that plan links actually resolve (presence check only for v1).
- Auditing archived/inactive projects.
