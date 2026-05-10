# Allowed Senders Settings Page — Design

**Date:** 2026-05-10
**Status:** Approved, ready for implementation plan

## Problem

The portal's "From" dropdown on a delivery only shows ClickUp workspace members whose lowercased username appears in a hardcoded `ALLOWED_SENDERS` set in `src/app/api/templates/field-options/route.ts`. Adding or removing a sender requires a code change and a Vercel deploy. We want a UI to manage this list directly.

## Goals

- Manage the sender allowlist from the portal — no code change, no redeploy.
- Changes take effect immediately for everyone using the portal.
- Keep the friction low: any signed-in `@consume-media.com` user can edit.

## Non-goals

- Verifying that an added user actually has n8n credentials configured. We surface a warning; the user is responsible for configuring n8n.
- A general-purpose settings shell with multiple sections. Senders is the only section for now.
- An admin role / per-user permissions.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Storage | Neon Postgres via Prisma (new `AllowedSender` model) | Already the project's persistence layer; edits take effect without redeploy. |
| Access control | Any signed-in `@consume-media.com` user | Existing domain-restricted Google sign-in is enough; no admin gate. |
| Add UX | Pick from ClickUp workspace members (combobox) | Avoids typos; matches today's `SenderSelect` pattern. |
| Identifier | ClickUp numeric user ID | Stable across ClickUp username changes. |
| n8n credentials | Warning banner, no enforcement | Honest about the constraint; nothing in this app can verify n8n state anyway. |
| Scope | Single page `/settings` | YAGNI — extend when there's a real second setting. |

## Architecture

### New surfaces

- `prisma/schema.prisma` — add `AllowedSender` model.
- `src/app/settings/page.tsx` — the UI.
- `src/app/api/settings/senders/route.ts` — `GET` (list) + `POST` (add).
- `src/app/api/settings/senders/[clickupUserId]/route.ts` — `DELETE`.
- `src/components/layout/sidebar.tsx` — append a "Settings" nav item.
- `src/app/api/templates/field-options/route.ts` — replace hardcoded set with DB query.
- `scripts/seed-allowed-senders.ts` — one-shot seed of current 5 users.

### Data model

```prisma
model AllowedSender {
  clickupUserId Int      @id
  addedBy       String
  addedAt       DateTime @default(now())

  @@index([addedAt])
}
```

No `username` or `email` columns — display data comes from ClickUp on every page load. Removing a sender is `DELETE` by primary key.

### UI

Single-column page at `/settings`:

- **Header**: "Settings" / "Manage who can be selected as the sender on a delivery."
- **Inline alert**: *"Senders also need n8n credentials configured. Adding someone here without n8n credentials will cause their sends to fail."*
- **Allowed senders list**: card list, one row per sender — avatar, username, email, "added by / on" metadata, an "X" remove button.
- **Add button** (top-right of the list): opens a popover combobox using the same `Command` / `CommandInput` pattern as `SenderSelect`. Lists workspace members not currently allowed. Click to add.

Confirmations:
- Add — none, one-click.
- Remove — `AlertDialog` confirmation.

### State management

- `useQuery(["settings", "allowed-senders"])` — list of allowed sender IDs (and joined ClickUp display data, computed on the server for convenience).
- `useQuery(["settings", "workspace-members"])` — full ClickUp workspace member list, used by the picker.
- `useMutation` for add/remove. On success, invalidate **both** `["settings", "allowed-senders"]` and `["field-options-senders"]` so an open delivery form picks up the change without a reload.

### Data flow

**Add sender**
```
combobox onSelect(member) → POST /api/settings/senders { clickupUserId }
                          → prisma.allowedSender.create
                          → invalidate allowed-senders + field-options-senders
```

**Remove sender**
```
AlertDialog confirm → DELETE /api/settings/senders/:clickupUserId
                   → prisma.allowedSender.delete
                   → invalidate allowed-senders + field-options-senders
```

**Render delivery "From" dropdown** (the existing `field-options` endpoint):
```
GET /api/templates/field-options
  → fetch ClickUp workspace members
  → prisma.allowedSender.findMany() → Set<clickupUserId>
  → filter members by ID membership
  → return as before
```

## Error handling

- **Duplicate add** → Prisma `P2002` unique violation → 409 → client toast "Already added".
- **ClickUp API failure on settings page** → show inline error in the "Add" picker; existing rows remain editable (remove path needs no ClickUp call).
- **DB failure on `field-options`** → return `sender: []`. Empty dropdown surfaces the failure rather than silently allowing every workspace member through.
- **DB failure on settings page** → toast error, keep last successful data on screen via React Query cache.
- **No auth on the settings API beyond the existing session check** — anyone signed in can edit.

## Testing

- Vitest unit test for the filter helper extracted from `field-options/route.ts`: takes `(workspaceMembers, allowedIds)`, returns filtered list. Covers: empty allowlist, member no longer in workspace, normal case.
- Manual on a Vercel preview:
  - Add yourself → see the "From" dropdown update immediately on a delivery page (with QueryClient invalidation).
  - Remove yourself → see it disappear.
  - Add a duplicate → toast says "Already added", row count unchanged.

## Migration

One-shot script `scripts/seed-allowed-senders.ts`:
1. Hits ClickUp `/team` to resolve the current 5 hardcoded usernames to IDs.
2. Inserts rows with `addedBy = "seed"`.
3. After the script runs in production, delete the hardcoded `ALLOWED_SENDERS` set from `field-options/route.ts`.

## Open questions

None — all design decisions resolved during brainstorming on 2026-05-10.
