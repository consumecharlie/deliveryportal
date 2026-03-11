# Deliverable Portal

Internal project management dashboard for **Consume Media**, built on top of the ClickUp API. The portal provides a streamlined interface for managing video production deliverables, client communications, and delivery snippet templates.

## Tech Stack

- **Framework**: Next.js 16 (App Router, React 19)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4 + Shadcn UI components (new-york style)
- **Auth**: NextAuth.js with Google OAuth (restricted to `@consume-media.com`)
- **Database**: PostgreSQL via Neon (Prisma 7 ORM, driver adapter pattern)
- **Data source**: ClickUp API (projects, tasks, templates, contacts)
- **Rich text**: TipTap v3.20.0 editor with @mention support (tippy.js for autocomplete)
- **Integrations**: Slack Web API (channels, members, @mentions), n8n (workflow automation via webhook)
- **Charts**: Recharts for analytics visualizations

## Getting Started

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Push schema to database (first time only)
npx prisma db push

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

Create a `.env.local` file in the project root:

| Variable | Description | Required |
|---|---|---|
| `CLICKUP_API_TOKEN` | ClickUp personal API token | Yes |
| `CLICKUP_WORKSPACE_ID` | ClickUp workspace ID | Yes |
| `SLACK_BOT_TOKEN` | Slack bot OAuth token (`xoxb-...`) — needs `channels:read`, `users:read`, `chat:write` scopes | Yes |
| `N8N_API_URL` | n8n cloud instance URL | Yes |
| `N8N_API_KEY` | n8n API key for workflow triggers | Yes |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | For auth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | For auth |
| `NEXTAUTH_SECRET` | Random secret for NextAuth session encryption | For auth |
| `NEXTAUTH_URL` | App URL (e.g. `http://localhost:3000`) | For auth |
| `POSTGRES_URL` | PostgreSQL connection string (Neon) | For DB features |

When `GOOGLE_CLIENT_ID` is not set, auth middleware is disabled for local development. When `POSTGRES_URL` is not set, DB-dependent features (drafts, sent log, analytics, template versions) gracefully degrade.

## Key Pages

| Route | Description |
|---|---|
| `/` | Dashboard with time-bucket task cards (Today, This Week, Upcoming, Overdue, Unscheduled), assignee filter, drafts tab, sent deliveries tab |
| `/projects` | Project list with filtering and search |
| `/projects/[listId]` | Single project detail with delivery history and links |
| `/deliverable/[taskId]` | Delivery form with editable recipients, sender dropdown, delivery mode toggle (Email / Slack), live preview with edit mode |
| `/templates` | Delivery snippet templates grouped by family with completeness indicators |
| `/templates/[taskId]` | Template editor with TipTap WYSIWYG, variable chips, version history |
| `/templates/new` | Create a new template |
| `/analytics` | Delivery analytics with charts, leaderboard, and activity feed |
| `/auth/signin` | Google OAuth sign-in |

## Architecture

```
Browser (React) → Next.js API Routes → ClickUp API (read/write task fields)
                                     → n8n Webhook (on Send — delivers payload)
                                     → Slack API (channel list, member list)
                                     → PostgreSQL (delivery log, drafts, template versions)
```

### Unified Rendering Pipeline

Both email and Slack previews share the same rendering pipeline. The key distinction is how contacts are formatted:

1. **Template merge** (`template-merge.ts`) produces two markdown strings: `emailContent` (contact first names) and `slackContent` (`<@userId>` mention tokens)
2. **Preview rendering** — both pass through the same `RichTextEditor` (TipTap). Slack content is preprocessed by `prepareSlackMarkdownForPreview()` which converts `<@userId>` → `@[displayName](userId)` (TipTap mention syntax)
3. **Edit round-trip** — TipTap's Mention extension preserves user IDs through editing. `htmlToMarkdown` serializes mentions back to `@[label](userId)`
4. **Send time** — `convertToSlackFormat()` converts the markdown to Slack mrkdwn: `@[label](userId)` → `<@userId>`, `**bold**` → `*bold*`, `[text](url)` → `<url|text>`, `- ` → `• `

### Send Flow

1. Writes all field data to ClickUp (links, version notes, scope, deliverable type)
2. Syncs paired feedback deadline task's deliverable type
3. Calculates dynamic task counts from sibling Delivery Deadline tasks
4. Calls the n8n webhook with complete pre-processed payload
5. Marks the ClickUp task status as "complete"
6. Logs the delivery to PostgreSQL
7. Deletes any saved draft for the task

## File Structure

```
src/
├── app/
│   ├── layout.tsx                          # Root layout with providers
│   ├── page.tsx                            # Dashboard (3 tabs)
│   ├── globals.css                         # Tailwind + Shadcn theme + TipTap + mention chip styles
│   ├── deliverable/[taskId]/
│   │   ├── page.tsx                        # Delivery form page
│   │   └── sent/page.tsx                   # Post-send confirmation
│   ├── templates/
│   │   ├── page.tsx                        # Template list (grouped by family)
│   │   ├── new/page.tsx                    # Create new template
│   │   └── [taskId]/page.tsx               # Template editor (with version history)
│   ├── projects/
│   │   ├── page.tsx                        # Projects browse (clients → projects)
│   │   └── [listId]/page.tsx              # Project detail (deliveries + links)
│   ├── analytics/
│   │   └── page.tsx                        # Analytics dashboard
│   ├── auth/
│   │   ├── signin/page.tsx                 # Google OAuth sign-in
│   │   ├── signout/page.tsx                # Sign-out confirmation
│   │   └── error/page.tsx                  # Auth error page
│   └── api/
│       ├── auth/[...nextauth]/route.ts     # NextAuth handler
│       ├── tasks/route.ts                  # List tasks
│       ├── tasks/[taskId]/route.ts         # Task detail + save draft
│       ├── tasks/[taskId]/send/route.ts    # Send delivery (converts Slack at send time)
│       ├── templates/route.ts              # List templates
│       ├── templates/[deliverableType]/route.ts  # Template by type
│       ├── templates/field-options/route.ts      # Sender list with avatars
│       ├── templates/edit/[taskId]/route.ts      # Edit template
│       ├── templates/create/route.ts       # Create new template
│       ├── templates/history/[taskId]/route.ts   # Template version history
│       ├── templates/restore/[taskId]/route.ts   # Restore template version
│       ├── deliverable-types/route.ts      # Deliverable type options
│       ├── drafts/route.ts                 # List drafts
│       ├── drafts/[taskId]/route.ts        # Draft CRUD
│       ├── deliveries/route.ts             # List deliveries
│       ├── deliveries/[id]/route.ts        # Delivery detail
│       ├── deliveries/[id]/status/route.ts # n8n execution status check
│       ├── projects/route.ts               # Projects by client
│       ├── projects/[listId]/links/route.ts     # Project delivery links
│       ├── analytics/route.ts              # Aggregated delivery analytics
│       ├── contacts/all/route.ts           # All project contacts with Slack IDs
│       ├── slack/channels/route.ts         # Slack channels (cached 5min)
│       └── slack/members/route.ts          # Slack workspace members
├── components/
│   ├── ui/                                 # Shadcn/ui primitives
│   ├── dashboard/
│   │   ├── task-table.tsx                  # Deliverables tab (date splitting + assignee filter)
│   │   ├── task-card.tsx                   # Time-bucket card
│   │   ├── assignee-filter.tsx             # Assignee dropdown with avatars
│   │   ├── drafts-table.tsx                # Drafts tab
│   │   ├── sent-table.tsx                  # Sent tab
│   │   └── department-badge.tsx            # Color-coded department badges
│   ├── templates/
│   │   ├── templates-grid.tsx              # Family card grid
│   │   ├── templates-family-card.tsx       # Family card with variants
│   │   └── template-variant-item.tsx       # Variant row with accordion
│   ├── delivery-form/
│   │   ├── delivery-form.tsx               # Main form orchestrator
│   │   ├── preview-panel.tsx               # Unified email/Slack preview (TipTap-based)
│   │   ├── review-links-section.tsx        # Template-aware link inputs
│   │   ├── scope-section.tsx               # Revision/feedback dropdowns
│   │   ├── version-notes-section.tsx       # TipTap editor with @mentions
│   │   ├── recipients-section.tsx          # Editable To/CC + From sender
│   │   ├── sender-select.tsx               # Sender dropdown with avatars
│   │   ├── slack-channel-section.tsx       # Slack channel picker (with error states)
│   │   └── send-bar.tsx                    # Save/Send bottom bar
│   └── shared/
│       ├── header.tsx                      # App header with nav
│       ├── providers.tsx                   # TanStack Query + theme provider
│       ├── searchable-select.tsx           # Reusable combobox
│       ├── rich-text-editor.tsx            # TipTap editor (markdown ↔ HTML, @mentions)
│       └── mention-list.tsx               # Mention suggestion dropdown
├── hooks/
│   └── use-auto-save.ts                    # 30s auto-save hook
├── lib/
│   ├── auth.ts                             # NextAuth config
│   ├── get-session-user.ts                 # Session user email utility
│   ├── clickup.ts                          # ClickUp API client
│   ├── custom-field-ids.ts                 # ClickUp field/space/list IDs
│   ├── db.ts                               # Prisma client singleton
│   ├── markdown-to-quill.ts                # Quill Delta ↔ Markdown (with emoji embeds)
│   ├── template-families.ts                # Family grouping + version ordering
│   ├── template-merge.ts                   # Merge engine + convertToSlackFormat()
│   ├── types.ts                            # TypeScript interfaces
│   └── utils.ts                            # cn() utility
├── middleware.ts                            # Auth middleware
└── prisma/
    └── schema.prisma                       # 4 models: Delivery, DeliveryLink, Draft, TemplateVersion
```

## Documentation

See [PROJECT_STATUS.md](./PROJECT_STATUS.md) for detailed documentation on every feature, implementation decisions, and the full development history.
