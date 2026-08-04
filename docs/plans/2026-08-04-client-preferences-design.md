# Client Preferences — Design

**Date:** 2026-08-04
**Status:** Approved (brainstorming) → ready for implementation plan

## Problem

Some clients have hard access constraints the delivery reviewer must respect.
The driving case: **KeyBank cannot open Google Docs/Drive links** — they need
files uploaded to their Box folder. Today the portal will happily send a
delivery whose review link is a Google Doc KeyBank can't access, which makes us
look inattentive. We want a way to flag per-client preferences that (a) remind
the reviewer of the constraint and (b) catch the specific mistake before it goes
out.

## Decisions (from brainstorming)

- **Level: Inform + guardrail** (not full automation). Warn prominently and
  soft-check the link; the human still does the Box upload.
- **Rule shape: predefined restriction toggles + Advanced custom-domain list.**
  Checkboxes for common cases (v1 seeds just "Google Docs/Drive"); an Advanced
  disclosure reveals a free-form blocked-domain list for oddball clients.
- **Guardrail strictness: soft override.** Warn but allow "Send anyway" — never
  a hard block (avoids false-positive / legitimate-exception dead ends).
- **Optional destination link** per client (e.g. the Box folder URL), surfaced
  as a clickable button in the warning so the reviewer has a one-click path.
- **Storage: Neon/Prisma table + admin Settings UI** (Approach 1), mirroring the
  existing `AllowedSender` pattern. Source of truth in Neon (as with drafts,
  allowed senders, template history) — no ClickUp round-trips, self-service, no
  deploy to onboard a client.
- **Warning placement: two touch points** — a persistent banner at the very top
  of the editor, AND a re-prompt pop-up when the user clicks Send/Schedule.

## Data model

New Prisma model, keyed by ClickUp `folderId` (the client):

```
model ClientPreference {
  clientFolderId       String   @id      // ClickUp folder = the client
  clientName           String            // cached for display
  enabled              Boolean  @default(true)
  warningMessage       String            // free-form, shown in editor + send pop-up
  destinationLink      String?           // optional Box folder URL (the button)
  restrictions         String[]          // predefined toggle keys, e.g. ["google"]
  customBlockedDomains String[]          // Advanced list, e.g. ["wetransfer.com"]
  updatedBy            String
  updatedAt            DateTime @updatedAt
}
```

**Restrictions are stored as keys, not one column each.** A code-side map
resolves a key to domains:

```
RESTRICTION_DOMAINS = {
  google: ["docs.google.com", "drive.google.com"],
  // future: dropbox: ["dropbox.com"], ...
}
```

Effective blocklist for a client = domains from `restrictions` ∪
`customBlockedDomains`. Adding a predefined checkbox later = one map entry + one
UI checkbox, **no schema migration**.

v1 predefined set: **Google Docs/Drive** only.

## Components & data flow

### Management (Settings page)
- New `ClientPreferencesSection` beside `AllowedSendersSection`, same
  admin-guarded CRUD pattern.
- Fields: client picker, Enabled toggle, warning message (textarea), optional
  destination link, predefined restriction checkboxes, **Advanced** disclosure
  → custom-domain list.
- APIs:
  - `/api/client-preferences` — GET (list), PUT (upsert by folderId), DELETE.
  - `/api/clients` — small helper returning `{ folderId, name }[]` (ClickUp
    folders in the Projects space) to populate the client picker.

### Editor
- The task-detail response (`/api/tasks/[taskId]`) already returns `folderId`;
  fold the matching `ClientPreference` into that response (one round-trip, no
  loading flash).
- **Persistent banner** at the top of the editor when a preference is present +
  enabled + has a message: the message, plus an **Open [Client]'s folder →**
  button when `destinationLink` is set.

### Send / Schedule guardrail (soft)
- On Send and Schedule, for a flagged (enabled) client:
  1. Always show a confirm dialog re-stating the warning message (+ destination
     button).
  2. Collect all review-link URLs (standard link fields + extra links); if any
     matches the client's effective blocklist, escalate the dialog with a
     pointed callout naming the offending link.
  3. Buttons: **Send anyway** / **Go back**. Override proceeds.
- Runs at *schedule* time too, since a cron-fired scheduled send has no human to
  warn later.
- Applies identically to email and Slack deliveries.

## Error handling

- Consistent with "works without the DB": if preferences can't load, the feature
  silently no-ops (no banner, no guardrail). It **never blocks a send.**
- No preference row for a client = normal behavior.
- `warningMessage` required for a row to matter; `destinationLink`,
  `restrictions`, `customBlockedDomains` all optional.

## Testing

- **Unit (real coverage):**
  - Domain matcher: Google Docs/Drive match, subdomain handling, custom-domain
    match, non-match, disabled preference → no block, empty blocklist → no block.
  - Restrictions→domains resolver (keys ∪ custom domains).
- **Lighter:** banner renders when a preference is present; send-confirm fires
  for a flagged client and escalates when a blocked link is present.

## Rollout

- Additive Neon migration for the `ClientPreference` table (low risk). Run
  against the DB as part of shipping.
- Seed KeyBank as the first entry (message + Box destination link + Google
  restriction) once the UI is live, or via a one-off script.

## Out of scope (v1 / YAGNI)

- Auto-filling or transforming the review link (Level C automation).
- Per-restriction messages (one free-form message per client is enough).
- Server-side hard enforcement / "sent despite warning" audit logging (the
  soft-override click is a natural future hook if wanted).
- Warnings inside the *client-facing* delivery (warnings are internal only).
