# Project Setup: Configure-from-Channel — Design

**Date:** 2026-08-05
**Status:** Approved (brainstorming) → ready for implementation plan
**Builds on:** the Communications Audit (`docs/plans/2026-08-05-comms-audit-design.md`)

## Problem

The team manually maintains every project's comms config in ClickUp: contact
**names**, **emails**, Slack **handles** (so the n8n "Find Slack ID" workflow can
derive user IDs), and the Slack **delivery channel ID**. It's slow and error-prone
— half-configured projects surface as delivery failures (Goldie's bot-not-in-
channel, KeyBank's contacts, missing channel IDs).

## Key insight (feasibility-validated)

The project's **Slack channel is a complete directory of the client's people.**
For a channel the bot is in, `conversations.members` + `users.info` returns every
member's **name, email, and Slack user ID** — including the **external Slack
Connect (client) users** (validated: `#iterable-consume` → Dana Lapinel →
`dana.lapinel@iterable.com` / `U0AAAASPNCE`, plus Nick/Priya/Gray at `@iterable.com`).

So we can derive contacts directly from the channel instead of hand-typing them.
Notes from testing:
- `users.lookupByEmail` is a **dead end** — it searches our workspace, and client
  contacts are external (returns `users_not_found`). `users.info` on a channel
  member works because they're visible via the shared channel.
- **Un-joined channels are visible**: client channels are public (even the Slack
  Connect ones), so `conversations.list` returns them even when the bot isn't a
  member (~71 un-joined client-ish channels found). Confirming one **joins the bot**.
  Only genuinely **private** channels the bot isn't in are invisible (Slack limit)
  → guided "invite `@n8n` and re-scan" fallback.
- ClickUp writes are supported: `createTask(listId, {name, custom_fields})` creates
  a Project Contact task; `updateTaskCustomField` fills fields.

## Decisions (from brainstorming)

- **Interaction: review-and-confirm** (not fully automatic) — it's a bulk ClickUp
  write and roles need human judgment.
- **Auto-filter to external (client) members** — Consume Media + the bot dropped.
- **Channel: auto-suggest + confirm**, including un-joined channels; confirm sets
  the channel ID and joins the bot. Search as fallback.
- **Home: the tab is renamed `Audit` → `Project Setup`.** It holds two functions:
  the existing **Health** audit, and the new **Configure from channel** wizard.
- **Role default: Standard** (promote to Primary manually).
- **Handle field + n8n workflow become obsolete** — we write the user ID directly;
  the workflow is left running, just unused.

## Architecture / flow

`Project Setup` tab → each Slack project row has **Configure from channel** →
a 3-step wizard:

1. **Channel** — ranked suggestions (name-token similarity to client + overlap
   with the project's existing contacts among members), member preview, "not
   joined" badge. Confirm → write channel ID to ClickUp + join/invite the bot.
2. **People** — pull channel members, keep **external** only, match each against
   existing project contacts (email-first, then name) → labeled create/update.
   Check who's a contact; set role (default Standard).
3. **Apply** — summary ("create N, update M"), then write to ClickUp; re-scan the
   project so its Health row updates.

## Components

- **`src/lib/channel-suggest.ts`** (pure, tested): `rankChannels(client, contacts,
  channels)` → scored candidates (name-token similarity + member overlap).
- **`src/lib/channel-people.ts`** (pure, tested): `matchMembersToContacts(members,
  existingContacts)` → `{ create[], update[] }` (email-first, name fallback, dedupe);
  `isExternalMember(user, ourTeamId)`.
- **Slack** (`slack-audit.ts` add): `listChannelPeople(channelId)` →
  members → `users.info` → `{ name, email, userId, isExternal }[]`.
- **APIs:**
  - `GET /api/setup/channels/suggest?listId=` → ranked candidates + preview.
  - `GET /api/setup/channel-people?channelId=&listId=` → external members matched
    to existing contacts.
  - `POST /api/setup/apply` → `{ listId, channelId, join, contacts:[{action, taskId?,
    name, email, userId, role}] }` → sets channel + joins bot + creates/updates
    contacts → re-scans → returns a per-item result.
- **UI:** rename nav `Audit`→`Project Setup` (`sidebar.tsx`); `Project Setup` page
  with Health (existing audit table) + the wizard modal; `configure-wizard.tsx`.

## ClickUp writes

- New contact → `createTask(listId, { name: "Project Contact", custom_fields: [
  PROJECT_TASK_TYPE=Project Contact, CONTACT_FIRST_NAME, CONTACT_EMAIL,
  SLACK_USER_ID, CONTACT_ROLE ]})`.
- Existing contact → `updateTaskCustomField` for missing email / user ID.
- Channel → write `SLACK_DELIVERY_CHANNEL_ID`; bot join via `conversations.join`.

## Error handling

- Nothing writes before **Apply**; the wizard is a pure review surface.
- Per-item write isolation in Apply — one contact failing is reported, doesn't
  abort the batch. Slack/ClickUp calls batched for rate limits.
- Re-scan after Apply confirms the result; failures surface via toast + the item
  result list.
- Private-channel-not-joined → guided `/invite @n8n` fallback (can't enumerate).

## Testing

- **Unit (real):** channel ranking (name-token similarity, member overlap,
  tie-breaks); external-member filter; member↔contact matcher (email-first, name
  fallback, no duplicates, unmatched→create); role default.
- **Lighter:** wizard step flow, Apply result aggregation.

## Out of scope (v1 / YAGNI)

- Email-only clients with no Slack presence (no channel to derive from — stays
  manual for the email field).
- Deleting/deactivating the n8n workflow (left running, unused).
- Writing Slack handles (obsolete; user ID written directly).
- Fuzzy name-matching beyond simple normalization + email-first (ambiguous matches
  are shown for manual confirm rather than auto-applied).
