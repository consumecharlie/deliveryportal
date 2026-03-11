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

## Known Issues / Pending Items

- `FLEX_LINK` custom field ID is still empty in `custom-field-ids.ts`
- `N8N_PORTAL_WEBHOOK_URL` needs to be configured for the send flow to work end-to-end
- Verify Slack bot has all required scopes after token configuration
- Production deployment to Vercel not yet done
