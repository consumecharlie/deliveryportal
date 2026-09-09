# Deliverable Portal — Development Guide

## Quick Start

```bash
npm install
npx prisma generate
npx prisma db push    # first time only
npm run dev
```

All environment variables are configured in `.env.local`. See README.md for the full list.

## Architecture Overview

This is a Next.js 16 App Router project (React 19, TypeScript, Tailwind CSS 4, Shadcn/ui). It serves as a delivery management portal for Consume Media, sitting on top of ClickUp, Slack, and n8n.

### Key Patterns

**ClickUp as source of truth** — Projects, tasks, templates, contacts, and deliverable types all come from the ClickUp API. The portal reads/writes ClickUp custom fields directly. The API client is in `src/lib/clickup.ts` with field ID constants in `src/lib/custom-field-ids.ts`.

**Prisma + Neon PostgreSQL** — Used for delivery logs, drafts, and template version history. Uses the driver adapter pattern (`@prisma/adapter-pg`). DB failures are graceful — the app works without a database, just without persistence features.

**TipTap rich text** — The shared `RichTextEditor` component (`src/components/shared/rich-text-editor.tsx`) handles all rich text across the app. It converts between markdown and HTML internally via `markdownToHtml()` and `htmlToMarkdown()`. For ClickUp compatibility, there's also a Quill Delta converter in `src/lib/markdown-to-quill.ts`.

**Unified email/Slack rendering** — Both email and Slack previews use the same TipTap component. The only difference is how contacts appear: email uses plain names, Slack uses `<@userId>` tokens. Slack mrkdwn conversion (`convertToSlackFormat()`) happens at send time only, not during preview.

### Mention System (Critical Path)

The @mention system preserves Slack user IDs through the entire pipeline:

```
Template merge: contact → <@U05AC4CFK62>           (Slack token in markdown)
Preview prep:   <@U05AC4CFK62> → @[emily.gardiner](U05AC4CFK62)  (TipTap mention syntax)
markdownToHtml: @[label](id) → <span data-type="mention" ...>    (TipTap DOM node)
TipTap editing: user sees styled blue chip with @emily.gardiner
htmlToMarkdown: mention span → @[emily.gardiner](U05AC4CFK62)    (back to mention syntax)
Send time:      @[emily.gardiner](U05AC4CFK62) → <@U05AC4CFK62>  (Slack API format)
```

TipTap's Mention extension (v3.20.0) adds the `@` prefix in `renderHTML` and `renderText` automatically. Do NOT add a CSS `::before { content: "@" }` rule — it causes double `@@`.

Mention chip styling uses `!important` to override Tailwind v4 CSS layers (see `globals.css`).

### Send Flow

1. Write form fields to ClickUp custom fields
2. Sync paired feedback deadline task's deliverable type
3. Calculate dynamic task counts from sibling tasks
4. Convert Slack markdown to mrkdwn via `convertToSlackFormat()`
5. Call n8n webhook with complete payload
6. Mark ClickUp task as "complete"
7. Log delivery to PostgreSQL
8. Delete draft

### Template Variables

Two patterns in delivery snippet templates:
- `[variableName]` — simple replacement
- `[Link Text | variableName]` — hyperlink. Standalone bullet links get project name prefix; inline links don't

### Editing a delivery (edit-the-template model)

"Edit Message" edits the per-delivery **template** (with `[tokens]`), not a frozen snapshot of the merged output. `mergedContent` is recomputed over `displayTemplate = editedSnippet ?? defaultTemplate` on every render, so review links / scope keep flowing into the message even after you've edited it. `editedSnippet`/`editedSubject` are per-delivery only (persisted in drafts, never written back to the shared template). A delivery is email **XOR** Slack (`showEmail`/`showSlack` are mutually exclusive), so one edited body feeds the active channel. The server uses the client-computed `mergedContent` (`formState.editedX ?? mergedContent`), so edits reach send/schedule without extra server merge.

**Merged (add-on) deliveries:** `buildCombinedTemplate()` assembles primary + transition + add-on into one editable template, namespacing the add-on's per-project tokens with an `addon:` prefix (e.g. `[Final Cut | addon:googleDeliverableLink]`) so the two projects' same-named variables don't collide. Contact tokens are shared and **not** namespaced. `mergeCombinedTemplate()` resolves primary tokens from primary fields and `addon:` tokens from add-on fields. Same-project merges name the deliverable type in the transition (not the project name) and dedupe the shared project-plan link. The older `mergeAddonDelivery()` (merge-then-stitch) is `@deprecated` — retained for reference/tests only.

### Client Portal

One bookmarkable link per client: `/portal/<token>`. A project view is a deep link under the same token: `/portal/<token>/<listId>`. Tokens are 24 random bytes as base64url (32 chars, `src/lib/portal-token.ts`), stored in `PortalAccess` with one active row per `clientFolderId`; "Rotate" in Settings revokes the old row and creates a new one in a single transaction (`createOrRotateAccess`). Revoked tokens 404 immediately.

**Public carve-out and the scoping rule.** `src/middleware.ts` and `AppShell` skip auth for exactly `/portal`, `/portal/*`, `/api/portal`, `/api/portal/*` (and `/api/cron/*`, which verify `CRON_SECRET` themselves). Every handler under those paths MUST start with `resolveAccess(token)` and MUST scope every query by that row's `clientFolderId` (`loadPortal` does this). A list id or delivery id in a URL or body is only ever a filter inside the token's folder, never authority. Nothing under `/api/settings/*` is public.

**Tables.** `PortalAccess` (token per client folder, `revokedAt`), `ProjectChannel` (internal Slack channel per project list, `autoMatched`, `confirmedBy`), `FeedbackConfirmation` (one row per "All feedback is in" press, `undoneAt` set on undo; newest row per delivery wins), `PortalView` (append-only open log per access and per delivery), `PortalReminder` (idempotency log keyed `deliveryId + kind + sentOn` Eastern date), `PortalMessage` (reach-out form notes, persisted before Slack). `Delivery.feedbackWindows` is snapshotted at send time for the fallback deadline.

**Page model (redesign).** `loadPortalPage(access, focusListId?)` in `portal-data.ts` reads every delivery for the client plus the newest confirmations and the live per-list payload, then hands them to the pure `buildPortalPage` (`src/lib/portal-page.ts`), which returns `PortalPageModel` (`portal-page-model.ts`, the contract with the UI). Deliverables are keyed by `Delivery.parentTaskId` plus a variant stem (`deliverableKey` in `portal-labels.ts`): "Video Edit01" and "Snippets Edit01" under one parent are separate rows, "Edit V1" / "Edit V2" / "Final Deliverables" stack as versions; rows without a parent, or whose parent is only a phase word (`PHASE_ONLY_WORDS`: post-production, pre-production, production, design, editing, animation, post, pre, and spelling variants), fall back to `family:<type family>` and take the share task label as their title. A project is `completed` only when its ClickUp list is archived; a list with every share task closed stays in progress ("next deliverable not scheduled yet") because lists keep gaining share tasks. Attention lists real deadlines before estimates; an archived project's deliverables are always review state `none` and never appear there. Feedback tasks pair to a delivery through `pairFeedbackTask` (`portal-live.ts`), under the delivery's parent: 1. same type; 2. same type minus version markers; 3. most identity tokens shared between the share task variant and the feedback task name (`deliverableIdentityTokens` / `nameTokens` in `portal-labels.ts`: "Video" vs "Snippets", generic words and version markers dropped); 4. the parent's only feedback task; 5. shared version markers between the types ("LoC Edit V2" vs "Edit V2"), else an open task; then the list-wide type map. Ties: open first, then the soonest due date on or after the send date. Several episodes share the type "Edit V1" and their feedback tasks are typed "LoC ...", so the type alone never suffices. `parentTaskId`/`parentTaskName`/`shareTaskName` are written at send time by `resolveShareIdentity` (`delivery-identity.ts`) and were backfilled with `scripts/backfill-delivery-parents.ts`. Labels come from `portal-labels.ts` (`deliverableTitle` strips department prefixes, `variantLabel` strips "Share ... with Client"; links are labelled by their anchor text in the sent message via `extractLinkTexts` + `cleanLinkText`, typed by `linkKind` with a host `linkHint`; review wording is `reviewLabel` by state and `reviewMode`, "approval" when the paired task name says Approval or the type says Final). A focused list narrows `projects` and `attention` but `counts` stay client-wide. The header logo is `ClientPreference.logoUrl`, surfaced as `clientLogoUrl`. Logos are uploaded from Settings > Client portal links to Vercel Blob (store `deliverable-portal-assets`, env `BLOB_READ_WRITE_TOKEN`) with the client-upload handshake at `POST /api/settings/client-logo` (`src/lib/client-logo.ts` rules: png/jpg/svg/webp, 2 MB, key `client-logos/<clientFolderId>.<ext>`, public, no random suffix, `?v=<ms>` cache-buster), then stored through `PATCH /api/settings/portal-access` (which also clears or accepts a pasted https URL); `clientDomain` is the first usable recipient domain scanning deliveries newest first (primary, then cc; ours and personal mailboxes skipped; `deriveClientDomain`), falling back to the most common Project Contact domain across the client's in-progress lists, then completed ones (`contactDomains` in the live payload, `pickContactDomain`).

**Live deadlines and roadmap.** `src/lib/portal-live.ts` reads the Feedback Deadline tasks (Project Task Type 12) and the Delivery Deadline share tasks (type 11, closed included, parent names fetched once per distinct parent) per list through `getListTasksByDropdownField`, plus the list's due date and archived flag via `getList`, and caches the `LivePayload` (`{ version, feedback, feedbackByParent, milestones, wrapsUpMs, archived, contactDomains }`) in `DashboardCache` under `portal:fd:<listId>` for 5 minutes. Bump `LIVE_PAYLOAD_VERSION` when the shape changes; older rows are treated as misses. Stale-while-revalidate (a stale row is served and refreshed after the response via `after()`), misses fetched 4 at a time. Confirm and undo call `invalidateLiveFeedback(listId)`. When no task exists the deadline is send date plus the feedback window in Eastern business days (`src/lib/portal-deadline.ts`), labelled as an estimate when the window was blank or Flexible; 30 days after send with no task the card stops asking.

**Confirmation side effects, in order** (`src/lib/portal-confirm.ts`): 1. write the `FeedbackConfirmation` row under `SELECT ... FOR UPDATE` on the delivery (409 if one is already active); 2. ClickUp: set the Feedback Deadline task to `complete`, comment mentioning the Project Management user group members (`USER_GROUPS.PROJECT_MANAGEMENT`, fallback `PM_FALLBACK_USERS`); 3. Slack: post to the project's internal channel, else DM the delivery's sender; 4. store `slackChannelId`/`slackMessageTs` so undo replies in-thread. Steps 2 and 3 are best effort; the row is the source of truth. Undo reopens the task (`waiting on client`) and fails with 502 if that call fails, so the portal never shows "awaiting" while ClickUp says complete.

**Channel resolution** (`src/lib/project-channel.ts`): a `ProjectChannel` row wins; otherwise crawl `listVisibleChannels()`, rank non-shared channels by project-name token coverage (`project-channel-rank.ts`), and use the top match only when it is confident. Only the confirm flow persists an auto-match (`persist: true`); admin reads never write. Never post internal notes to the Slack Weekly Status Channel ID field or to any Slack Connect (`is_shared`/`is_ext_shared`) channel; the settings PUT rejects shared channels. The bot needs `channels:join` to self-join public channels; private ones need a manual invite.

**Reminders.** `/api/cron/portal-reminders` runs weekdays 13:00 UTC (`vercel.json`), emails clients whose feedback is due tomorrow or today through `N8N_PORTAL_REMINDER_WEBHOOK_URL` (skipped with a log line until set), and nudges the internal channel on business days 1, 3 and 5 after an unconfirmed deadline. `?dryRun=1` reports without sending. Idempotent per Eastern date via `PortalReminder`.

**Rendering.** Portal bodies go through `renderPortalBody` (`src/lib/portal-render.ts`): mention tokens replaced, HTML escaped, then `markdownToHtml`, then links limited to http/https/mailto. That is the only path into `dangerouslySetInnerHTML` on portal pages. The portal layout sets `noindex` and `referrer: no-referrer` so tokens do not leak to review tools.

## Common Tasks

### Adding a new ClickUp custom field
1. Find the field ID in ClickUp (task detail → field → copy ID)
2. Add it to `src/lib/custom-field-ids.ts`
3. Extract it in the relevant API route (usually `src/app/api/tasks/[taskId]/route.ts`)
4. Add it to the TypeScript types in `src/lib/types.ts`

### Adding a new template variable
1. Add the variable to `MergeVariables` interface in `src/lib/template-merge.ts`
2. Add to the `replacements` dictionary in `mergeTemplate()`
3. Add to the variable reference sidebar in the template editor

### Modifying mention chip appearance
- Styles are in `src/app/globals.css` under the `.tiptap .mention` selector
- The dual selector `.tiptap .mention, .tiptap span[data-type="mention"]` is needed for specificity
- Use `!important` on colors to beat Tailwind v4 layers

### Debugging Slack integration
- Check `SLACK_BOT_TOKEN` is set and not just whitespace (API routes trim it)
- Bot needs scopes: `channels:read`, `users:read`, `chat:write`
- Channels endpoint: `/api/slack/channels` (5min cache)
- Members endpoint: `/api/slack/members`
- If "No channels found" — likely a token or scope issue

## Important Files

| File | Role |
|---|---|
| `src/lib/template-merge.ts` | Template merge engine + `convertToSlackFormat()` |
| `src/components/shared/rich-text-editor.tsx` | TipTap editor with markdown↔HTML + mention support |
| `src/components/delivery-form/preview-panel.tsx` | Unified email/Slack preview + `prepareSlackMarkdownForPreview()` |
| `src/components/delivery-form/delivery-form.tsx` | Main form orchestrator (delivery mode, mentions, state) |
| `src/app/api/tasks/[taskId]/send/route.ts` | Send flow (Slack conversion, n8n webhook, ClickUp updates) |
| `src/lib/clickup.ts` | ClickUp API client |
| `src/lib/custom-field-ids.ts` | All ClickUp field/space/list ID constants |
| `src/lib/markdown-to-quill.ts` | Quill Delta ↔ Markdown (for ClickUp rich text) |
| `src/app/globals.css` | TipTap styles, mention chip styles, theme variables |
| `src/lib/portal-data.ts` | Portal read path: token -> timeline, live status, action items (all scoped by clientFolderId) |
| `src/lib/portal-confirm.ts` | Confirm / undo orchestration (row lock, ClickUp, Slack, thread reply) |
| `src/lib/portal-live.ts` | Cached live Feedback Deadline state per list (`portal:fd:<listId>`) |
| `src/lib/portal-page.ts`, `portal-page-model.ts`, `portal-labels.ts` | Pure page-model builder for the redesigned portal, its contract, and client-facing label helpers |
| `src/lib/portal-timeline.ts`, `portal-status.ts`, `portal-deadline.ts`, `portal-view-model.ts` | Pure grouping, status, deadline and view-model logic |
| `src/lib/project-channel.ts`, `project-channel-rank.ts` | Internal Slack channel resolution and ranking |
| `src/lib/portal-reminders.ts`, `src/app/api/cron/portal-reminders/route.ts` | Reminder classification and cron |
| `src/app/api/portal/[token]/*` | Public portal API (confirm, undo, message, view) |

## Known Issues / Pending Items

- `FLEX_LINK` custom field ID is still empty in `custom-field-ids.ts`
- `N8N_PORTAL_WEBHOOK_URL` needs to be configured for the send flow to work end-to-end
- Verify Slack bot has all required scopes after token configuration
- Production deployment to Vercel not yet done
- `N8N_PORTAL_REMINDER_WEBHOOK_URL` is not yet configured; reminder emails are skipped until the n8n workflow exists. The Slack bot needs the `channels:join` scope (or a manual invite) before confirmations reach internal project channels.
