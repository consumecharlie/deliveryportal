# Project Delivery Portal — Status Report

## Overview

The **Project Delivery Portal** is a web application for Consume Media that replaces manual ClickUp data entry with a polished form + live WYSIWYG preview for sending client deliverables. When a team member is ready to deliver work to a client, they open the portal, fill out the delivery form (review links, version notes, scope), preview the merged email/Slack message, and hit Send. The portal writes data back to ClickUp, triggers the existing n8n workflow via webhook, and marks the task complete.

**The old flow:** Manually enter review links and settings in ClickUp, change task status to trigger n8n.
**The new flow:** Use the portal's form + live preview, click Send, and the portal handles everything.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| Next.js 16 (App Router) | Framework (TypeScript) |
| Tailwind CSS + Shadcn/ui | Styling and UI components (new-york style) |
| TipTap + tippy.js | Rich text editing with @mention autocomplete for version notes and preview edit mode |
| TanStack Query | Data fetching, caching, polling |
| Prisma 7 + PostgreSQL | Database ORM (driver adapter pattern with `@prisma/adapter-pg`) |
| NextAuth.js + Google OAuth | Authentication (configured, credentials not yet set) |
| Slack Web API (`@slack/web-api`) | Channel/member listing (server-side) |
| Recharts | Analytics charts and data visualizations |
| Lucide React | Icons |
| Sonner | Toast notifications |

---

## Architecture

```
Browser (React) → Next.js API Routes → ClickUp API (read/write task fields)
                                     → n8n Webhook (on Send — delivers payload)
                                     → Slack API (channel list, member list)
                                     → PostgreSQL (delivery log, drafts, template versions)
```

**On Send, the portal:**
1. Writes all field data to ClickUp (links, version notes, scope, deliverable type)
2. Calculates dynamic task counts from sibling Delivery Deadline tasks in the same project
3. Calls the n8n webhook with a complete pre-processed payload (contacts, merged content, recipients, Slack channel, subject, sender, task counts)
4. n8n routes the payload to the "Email and Slack" sub-workflow
5. On n8n success, marks the ClickUp task status as "complete"
6. Logs the delivery to the portal's PostgreSQL database
7. Deletes any saved draft for the task

---

## Key Pages & Features

### 1. Dashboard (`/`)

Three-tab layout:

**Deliverables tab (default) — Time-Bucket Card Layout:**
- Fetches all "Delivery Deadline" tasks from the ClickUp Projects space that aren't complete/closed
- Tasks are split into **5 time-bucket cards**: Overdue (red accent), Today, This Week, Upcoming, and Unscheduled
- **Overdue card** only shows tasks that have an assignee assigned; unassigned overdue tasks fall into Unscheduled
- Each card shows a task count badge in the header
- **5-column grid layout** per card: Client/Project | Department | Deliverable/Type | Due Date | Assignee
- Columns use fixed pixel widths (`1fr 126px 1fr 64px 100px`) for consistent vertical alignment across all cards
- **Department badges** are fixed-width (`118px`) for visual consistency
- **Assignee column** shows avatar + first name only (left-aligned for avatar alignment)
- Overdue dates render in red (`text-destructive`)
- **Global assignee filter** — dropdown with profile pictures + full names, derived from unique assignees in the task list; filters all cards simultaneously
- Cards have `overflow-y-auto` with configurable max height for scrolling
- Click any task row → navigates to `/deliverable/{taskId}`

**Drafts tab:**
- Lists tasks where form data has been saved but not sent
- Shows: Task ID, Deliverable Type, Saved By, Last Saved timestamp
- "Resume" button reopens the delivery form with all saved data restored
- Any team member can pick up someone else's draft

**Sent tab:**
- Full history of every delivery sent through the portal (from PostgreSQL)
- Columns: Client, Project, Type, Department, Sender, Sent At, Recipients, Slack, Status
- Click a row → opens a detail dialog showing the full email content, subject, recipients, and links
- Search/filter by client, project, sender, date range

### 2. Delivery Form (`/deliverable/[taskId]`)

Two-column layout (60/40):

**Header:**
- Task header with project name, deliverable name, department badge, ClickUp link
- **Delivery mode toggle** — segmented control (Email | Slack) — mutually exclusive; auto-detects default based on whether ClickUp contacts have Slack user IDs
- Changing delivery mode conditionally shows/hides recipients section, Slack channel section, and preview tabs

**Left — Editor:**
- **Deliverable Type dropdown** — full searchable dropdown with all 133 ClickUp options; changing this live-switches the template
- **Review Links section** — only shows fields referenced in the active template (template-aware); **Flexible Link priority** — first "Add Review Link" click activates the Flex Link field (syncs to ClickUp), subsequent clicks add dynamic extra links
- **Scope section** — Revision Rounds and Feedback Windows dropdowns
- **Version Notes** — TipTap rich text editor with formatting toolbar (bold, italic, bullet list, numbered list, links, undo/redo) and **@mention support** (tiered autocomplete: project contacts → Slack workspace members)
- **Recipients section** — **editable** To, CC fields (Input fields) and **From sender dropdown** with profile pictures + full names (Command/Popover dropdown sourced from template senders list via `/api/templates/field-options`); defaults to template-matched sender but can be overridden
- **Slack Channel dropdown** — defaults to project's channel, overridable from Slack API list (shown when delivery mode includes Slack)

**Right — Live Preview (sticky):**
- Shows Email or Slack preview based on delivery mode selection (single-channel view)
- **Unified rendering pipeline** — both Email and Slack use the same `RichTextEditor` (TipTap) component. Slack content is preprocessed to convert `<@userId>` tokens into TipTap mention chips; no separate Slack HTML renderer
- **Preview Mode (default):** Read-only TipTap rendering of merged template with proper formatting (headers, bold, lists, emojis, mention chips), updates live as fields change
- **Edit Mode:** TipTap rich text editor with full toolbar and @mentions for both Email and Slack. "Reset to Template" reverts to auto-merged output. An "Edit Template" dropdown button allows opening the source template for editing
- Subject line displayed and editable above email preview
- Edited content is sent as-is in the webhook payload; original template is never modified

**Bottom bar:**
- "Save Draft" — writes fields to ClickUp + saves form state to portal DB
- "Send" — confirmation modal → write to ClickUp → call n8n webhook → mark complete → log delivery
- Bottom bar has scroll padding (`pb-28`) so content isn't hidden behind the sticky bar

**Auto-save:** Every 30 seconds while the form is open, the portal auto-saves to the database (no ClickUp write on auto-save, just local persistence). Draft is also saved on unmount.

**Draft restoration:** When opening the delivery form, any existing draft is loaded and all form fields are restored (including edited recipients, sender, and delivery mode).

### 3. Post-Send Success Page (`/deliverable/[taskId]/sent`)

After a successful send, the user is redirected to a confirmation page showing:
- Green checkmark success indicator
- Email summary: To, CC, From, Subject
- Slack posting confirmation (if applicable)
- ClickUp task status update confirmation
- Action buttons: Dashboard, View in ClickUp, View Sent Deliveries

### 4. Template Editor (`/templates`)

**Template List View — Grouped Grid Layout:**
- Templates are grouped by deliverable-type "family" (e.g., "AV Script V1", "AV Script V2", "AV Script Final" all appear under the "AV Script" card)
- Family extraction uses explicit overrides for complex groupings (Edit, Edit - Animated, Edit - Batch, Spinoffs, Spinoffs - Batch, Reformats, Additional Deliverables, Success Bundle) plus automatic suffix-stripping for standard V1/V2/V3/Final patterns
- Responsive grid: 1 column mobile, 2 columns tablet, 3 columns desktop
- Each family card shows the family name, variant count badge, and a list of variant items sorted in logical order (V1 + Loom → V1 → V2 → V3 → Potential Master → Final)
- **Completeness indicators** — green checkmark when a template has both subject line and body text; amber warning icon when either is missing
- **Accordion details** — click the chevron on any variant to expand inline details showing subject line, sender, and body preview (first 160 chars), plus an "Open Template" button
- Department filter tabs at the top with count badges (All, Project Management, Pre-Pro, Design, Post, etc.)
- "Create Template" button in the header

**Template Editor View (`/templates/[taskId]`):**
- Two-column layout: TipTap rich text editor + variable reference sidebar
- Subject line input with `[variable]` support
- **TipTap WYSIWYG editor** for the snippet body — supports bold, italic, bullet lists, numbered lists, links, undo/redo
- **Variable chips** — template variables like `[projectName]` render as styled inline chips in the editor; click-to-insert from the sidebar; chips are preserved through save/load round-trips
- **Quill Delta ↔ Markdown ↔ HTML conversion pipeline** — ClickUp stores rich text as Quill Delta format; the portal converts to markdown (for storage/merge) and to HTML (for TipTap editing), with full round-trip fidelity
- **Frame.io link handling** — special regex pre-processing prevents `[Frame.io | frameReviewLink]` from being corrupted into nested markdown link syntax during Quill Delta conversion
- **List round-trip fix** — TipTap requires `<li><p>content</p></li>` structure; the markdown-to-HTML converter wraps list item content in `<p>` tags for correct parsing
- Variable reference sidebar with all 16 template variables, click-to-insert, and tooltip descriptions
- Template info card (type, department, sender, task ID)
- Save writes changes back to ClickUp (as Quill Delta) and stores previous version in the portal's TemplateVersion table
- **Version History panel** — collapsible "History" button in the header; shows all previous versions with timestamps; click a version to preview its content; "Restore" button with confirmation dialog that auto-saves current state before reverting

**Create New Template (`/templates/new`):**
- Template name, deliverable type dropdown (full 133-option list), department dropdown
- Subject line input, snippet body textarea with variable reference sidebar
- Creates a new task in the ClickUp Delivery Snippets list
- Redirects to the template editor on success

### 5. Template Merge Engine (`lib/template-merge.ts`)

Handles two variable patterns:
- `[variableName]` — replaced with the variable's value
- `[Link Text | variableName]` — replaced with a hyperlink. Standalone bullet links are enriched with the project name; inline links are kept plain

Generates both email and Slack content from the same template, both as **standard markdown**. The key difference: `emailContent` uses plain contact first names, while `slackContent` uses `<@userId>` Slack mention tokens. Both are rendered identically by TipTap in the preview.

**Send-time Slack conversion** — `convertToSlackFormat()` (exported from this module) converts standard markdown to Slack mrkdwn format at send time only. This includes: mentions (`@[Name](userId)` → `<@userId>`), bold (`**text**` → `*text*`), links (`[text](url)` → `<url|text>`), bullets (`- ` → `• `), headers, and emoji shortcodes. The send route imports and calls this function before dispatching to n8n.

### 6. Projects (`/projects`)

**Projects Browse Page:**
- All projects grouped by client (ClickUp folder → list hierarchy)
- Searchable by client name or project name
- Click a project → opens the project detail page

**Project Detail Page (`/projects/[listId]`):**
- Summary stats cards: Deliveries Sent, Total Links Sent, Unique Links
- **All Links card** — de-duplicated list of every link sent for the project, with send counts and deliverable type badges
- **Delivery History table** — chronological list of all deliveries with date, type, department, subject, recipient, and link badges with direct open links

### 7. Analytics Dashboard (`/analytics`)

Full analytics page with period-selectable delivery statistics:
- **Period selector** — 30 days, 90 days, 12 months, or all time
- **5 stat cards** — Total Deliveries, Unique Clients, Unique Projects, Custom Edited count, Sent to Slack count
- **Deliveries Over Time** — Recharts AreaChart with weekly buckets showing delivery volume trends
- **By Department** — Recharts PieChart with custom legend showing delivery breakdown by department
- **Top Deliverable Types** — Recharts horizontal BarChart showing the 15 most-used deliverable types
- **Team Leaderboard** — Ranked list of senders with delivery counts and visual progress bars
- **Recent Activity** — Feed of the 20 most recent deliveries with department badges and relative timestamps
- All data sourced from the portal's PostgreSQL Delivery table via `/api/analytics`

### 8. Reusable Rich Text Editor (`components/shared/rich-text-editor.tsx`)

A shared TipTap-based rich text editor component used across the app:
- Formatting toolbar: bold, italic, bullet list, numbered list, links (with URL popover), undo/redo
- Markdown ↔ HTML bidirectional conversion for seamless integration with the markdown-based template system
- **Bullet/ordered list round-trip** — `markdownToHtml` wraps list item content in `<li><p>...</p></li>` (required by TipTap for correct parsing); `htmlToMarkdown` correctly extracts list item content back to `- ` and `1. ` prefix format
- External content sync (handles "Reset to Template" and draft restoration)
- Configurable: output format (markdown/html), toolbar visibility, placeholder, min height
- Focus ring styling consistent with Shadcn/ui form components
- **@mention support** — Optional TipTap Mention extension (v3.20.0) with tiered autocomplete dropdown (project contacts → Slack workspace members), rendered as Slack-blue styled chips in the editor
- Mention data round-trips through markdown as `@[Name](userId)` format, preserving Slack user IDs losslessly
- `markdownToHtml()` parses `@[label](id)` into TipTap mention span nodes; `htmlToMarkdown()` serializes them back
- TipTap's Mention extension renders the `@` prefix natively via `renderHTML`/`renderText` — no CSS `::before` needed

### 8b. Quill Delta ↔ Markdown Conversion (`lib/markdown-to-quill.ts`)

Handles bidirectional conversion between ClickUp's Quill Delta rich text format and the portal's markdown format:
- **`quillDeltaToMarkdown`** — Reads Quill Delta ops and produces markdown (bold, italic, headers, links, bullet/ordered lists)
- **`markdownToQuillDelta`** — Parses markdown and produces Quill Delta ops for writing back to ClickUp
- **Emoji embed support** — ClickUp stores emojis as non-string Quill Delta inserts (`{ insert: { emoji: "link" } }`). The converter maps 25+ ClickUp shortcodes (link, rotating_light, white_check_mark, envelope_with_arrow, etc.) to Unicode characters. Unknown shortcodes render as `:name:` fallback
- **Rich text preservation in API routes** — Both `api/tasks/[taskId]` and `api/templates/[deliverableType]` now prefer `value_richtext` (Quill Delta) over plain text `value` for template snippets, converting via `quillDeltaToMarkdown()` at the API layer so all consumers get properly formatted content
- **Frame.io link-in-brackets fix** — Pre-processing regex strips embedded markdown link syntax from variable brackets, preventing `[[Frame.io](http://frame.io/) | frameReviewLink]` from corrupting the template
- **Variable chip preservation** — `[Link Text | variableName]` brackets survive the full round-trip through Quill Delta ↔ markdown ↔ HTML ↔ TipTap

### 8d. Unified Preview Rendering (`preview-panel.tsx`)

Both email and Slack previews use the same `RichTextEditor` component (TipTap) in read-only mode. The markdown-to-HTML conversion happens inside `rich-text-editor.tsx` via `markdownToHtml()`, which handles headers, bold, italic, links, bullet/ordered lists, and mention chips.

**Slack mention preprocessing** — `prepareSlackMarkdownForPreview()` converts Slack `<@userId>` tokens into TipTap mention markdown (`@[displayName](userId)`) before passing to the editor. Display names prefer Slack handles (e.g. `emily.gardiner`) over full names.

**Lossless mention round-trip** — the full data flow preserves Slack user IDs through editing:
1. Template merge: contact → `<@U05AC4CFK62>`
2. Preview prep: `<@U05AC4CFK62>` → `@[emily.gardiner](U05AC4CFK62)`
3. `markdownToHtml`: `@[label](id)` → `<span data-type="mention" data-id="id" data-label="label">`
4. TipTap renders as styled mention chip (Slack blue, `#e8f0fe` background)
5. `htmlToMarkdown`: mention span → `@[label](id)`
6. Send-time `convertToSlackFormat`: `@[label](id)` → `<@id>`

### 8c. Template Family Grouping (`lib/template-families.ts`)

Utilities for organizing the 133 deliverable types into logical family groups:
- **`extractFamilyName()`** — Determines the family for a deliverable type; checks explicit overrides first, then strips known version suffixes (V1/V2/V3/Final/etc.)
- **`getVersionSortKey()`** — Returns a numeric sort key for ordering variants within a family
- **`extractVersionSuffix()`** — Extracts the human-readable variant label (e.g., "V1 + Loom", "Final Delivery")
- **`groupTemplatesByFamily()`** — Groups and sorts an array of templates into `TemplateFamily[]` for rendering
- **Explicit overrides** for non-standard groupings: Edit (V1/V2/V3 + Potential Master + Final Delivery), Edit - Animated, Edit - Batch, Spinoffs, Spinoffs - Batch, Reformats, Additional Deliverables (Baked Subs, Raw Footage, Raw Footage + Project Files), Success Bundle

### 9. Authentication & Session

- **Middleware** (`src/middleware.ts`) — Protects all routes; redirects unauthenticated users to sign-in. When `GOOGLE_CLIENT_ID` is not set, middleware is bypassed for development.
- **Sign-in page** (`/auth/signin`) — Google OAuth button with Consume Media branding and @consume-media.com restriction notice
- **Sign-out page** (`/auth/signout`) — Confirmation dialog before signing out
- **Error page** (`/auth/error`) — AccessDenied, Configuration, and generic error handling
- **Session-aware header** — Shows user avatar + name when authenticated, sign-in button otherwise
- **Session-aware API routes** — `getSessionUserEmail()` utility replaces hardcoded "portal-user" across all API routes (send, save draft, template edit)

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|---|---|---|---|
| `/api/tasks` | GET | List deliverable tasks from Projects space | Built |
| `/api/tasks/[taskId]` | GET | Full task detail + resolve siblings (contacts, deadline, Slack, plan) + template (with rich text + full sender profile) | Built |
| `/api/tasks/[taskId]` | PUT | Save draft — write fields to ClickUp + save to portal DB | Built |
| `/api/tasks/[taskId]/send` | POST | Write fields → sync deadline → calculate task counts → call n8n → mark complete → log delivery | Built |
| `/api/templates` | GET | List all delivery snippet templates | Built |
| `/api/templates/[deliverableType]` | GET | Fetch matching template by deliverable type (with rich text + full sender profile) | Built |
| `/api/templates/field-options` | GET | Template field options including sender list with profile pictures (for sender dropdown) | Built |
| `/api/templates/edit/[taskId]` | GET/PUT | Get or update a specific template (writes to ClickUp + saves version) | Built |
| `/api/templates/create` | POST | Create new delivery snippet task in ClickUp Delivery Snippets list | Built |
| `/api/templates/history/[taskId]` | GET | Get version history for a template (newest first, up to 50) | Built |
| `/api/templates/restore/[taskId]` | POST | Restore a template to a previous version (auto-saves current state first) | Built |
| `/api/deliverable-types` | GET | All deliverable type options from ClickUp field definition (30min server cache) | Built |
| `/api/drafts` | GET | List all saved drafts | Built |
| `/api/drafts/[taskId]` | GET/PUT/DELETE | Get, update, or delete a specific draft | Built |
| `/api/deliveries` | GET | List sent deliveries with search, filter, pagination | Built |
| `/api/deliveries/[id]` | GET | Full delivery detail with links | Built |
| `/api/projects` | GET | List all projects grouped by client (folder → list hierarchy) | Built |
| `/api/projects/[listId]/links` | GET | All links sent for a project across deliveries, grouped by delivery + flat de-duped list | Built |
| `/api/slack/channels` | GET | List Slack channels (cached 5min) | Built |
| `/api/slack/members` | GET | List Slack members for @mention autocomplete | Built |
| `/api/auth/[...nextauth]` | * | Google OAuth handler | Built |
| `/api/contacts/all` | GET | All project contacts with Slack IDs for @mention (10min cache, batch-fetched, de-duped) | Built |
| `/api/deliveries/[id]/status` | GET | Check n8n execution status — polls n8n API, updates delivery record | Built |
| `/api/analytics` | GET | Aggregated delivery stats (period-selectable: 30d/90d/12m/all) | Built |

---

## Database Schema (Prisma)

Four models in PostgreSQL:

**Delivery** — Record of every sent delivery
- taskId, projectName, clientName, deliverableType, department
- senderEmail, primaryEmail, ccEmails, slackChannel
- emailSubject, emailContent, slackContent
- wasEdited, sentBy, sentAt
- n8nExecutionId, n8nStatus
- projectListId, clientFolderId
- Related: DeliveryLink[]

**DeliveryLink** — Individual links associated with a delivery
- deliveryId → Delivery, url, label, linkType (standard/extra), variableName

**Draft** — Auto-saved delivery form state
- taskId (unique), formData (JSON), savedBy, savedAt, updatedAt

**TemplateVersion** — Template edit history
- templateTaskId, templateName, snippet, subjectLine
- deliverableType, department, sender, editedBy, editedAt, changeNote

---

## ClickUp Integration

**Workspaces and Spaces:**
- Projects Space: `90030181746` — all deliverables, contacts, project data
- Templates Space: `90100159712` — delivery snippet templates only
- Delivery Snippets List: `901312119609`

**20+ mapped custom field IDs** in `lib/custom-field-ids.ts` covering:
- Department, Deliverable Type, Project Task Type
- Google Link, Frame.io Link, Loom Link, Animatic Link, Flex Link
- Version Notes, Revision Rounds, Feedback Windows
- Contact First Name, Contact Email, Contact Role
- Slack Delivery Channel ID, Slack User ID, Slack Handle
- Project Plan Link, Video Name

**ClickUp API client methods** (`lib/clickup.ts`):
- `getTask`, `getListTasks`, `getListFields` — read tasks and field definitions
- `updateTaskCustomField`, `updateTaskStatus` — write back to ClickUp
- `createTask` — create new tasks (used for template creation)
- `getSpaceFolders`, `getFolderlessLists` — workspace hierarchy for projects page
- `extractCustomFieldValue`, `extractCustomFieldUrl`, `resolveDropdownOptionId` — field parsing helpers

**Sibling task resolution:** When loading a task, the portal fetches all tasks in the same list and resolves:
- Project Contacts (name, email, role, Slack handle/ID)
- Slack Channel (delivery channel ID)
- Project Plan (link URL)
- Feedback Deadline (nearest future deadline matching deliverable type)

**Feedback deadline sync:** When the deliverable type changes on send, the portal also updates the paired feedback deadline task's deliverable type to keep them in sync.

**Dynamic task counts:** On send, the portal counts sibling Delivery Deadline tasks by status (waiting/in progress/upcoming) and includes these counts in the n8n webhook payload.

---

## File Structure

```
src/
├── app/
│   ├── layout.tsx                          # Root layout with providers
│   ├── page.tsx                            # Dashboard (3 tabs)
│   ├── globals.css                         # Tailwind + Shadcn theme + TipTap styles
│   ├── deliverable/[taskId]/
│   │   ├── page.tsx                        # Delivery form page
│   │   └── sent/page.tsx                   # Post-send confirmation
│   ├── templates/
│   │   ├── page.tsx                        # Template list
│   │   ├── new/page.tsx                    # Create new template
│   │   └── [taskId]/page.tsx               # Template editor (with version history)
│   ├── projects/
│   │   ├── page.tsx                        # Projects browse (clients → projects)
│   │   └── [listId]/page.tsx              # Project detail (deliveries + links)
│   ├── analytics/
│   │   └── page.tsx                        # Analytics dashboard (charts + stats)
│   ├── auth/
│   │   ├── signin/page.tsx                 # Google OAuth sign-in page
│   │   ├── signout/page.tsx                # Sign-out confirmation page
│   │   └── error/page.tsx                  # Auth error page (access denied, etc.)
│   └── api/
│       ├── auth/[...nextauth]/route.ts     # NextAuth handler
│       ├── tasks/route.ts                  # List tasks
│       ├── tasks/[taskId]/route.ts         # Task detail + save draft
│       ├── tasks/[taskId]/send/route.ts    # Send delivery (with dynamic task counts)
│       ├── templates/route.ts              # List templates
│       ├── templates/[deliverableType]/route.ts  # Template by type (rich text + sender profile)
│       ├── templates/field-options/route.ts      # Template field options (sender list with avatars)
│       ├── templates/edit/[taskId]/route.ts      # Edit template
│       ├── templates/create/route.ts       # Create new template
│       ├── templates/history/[taskId]/route.ts   # Template version history
│       ├── templates/restore/[taskId]/route.ts   # Restore template version
│       ├── deliverable-types/route.ts      # Full deliverable type options list
│       ├── drafts/route.ts                 # List drafts
│       ├── drafts/[taskId]/route.ts        # Draft CRUD
│       ├── deliveries/route.ts             # List deliveries
│       ├── deliveries/[id]/route.ts        # Delivery detail
│       ├── projects/route.ts               # List projects by client
│       ├── projects/[listId]/links/route.ts     # Project delivery links
│       ├── analytics/route.ts              # Aggregated delivery analytics
│       ├── contacts/all/route.ts           # All project contacts with Slack IDs
│       ├── slack/channels/route.ts         # Slack channels
│       └── slack/members/route.ts          # Slack members
├── components/
│   ├── ui/                                 # 19 Shadcn/ui components
│   ├── dashboard/
│   │   ├── task-table.tsx                  # Deliverables tab container (date splitting + assignee filter)
│   │   ├── task-card.tsx                   # Reusable time-bucket card (Today, This Week, etc.)
│   │   ├── assignee-filter.tsx             # Assignee dropdown with avatars
│   │   ├── drafts-table.tsx                # Drafts tab
│   │   ├── sent-table.tsx                  # Sent tab
│   │   └── department-badge.tsx            # Color-coded fixed-width department badges
│   ├── templates/
│   │   ├── templates-grid.tsx              # Responsive grid container for family cards
│   │   ├── templates-family-card.tsx       # Card for a single deliverable-type family
│   │   └── template-variant-item.tsx       # Clickable variant row with status icon + accordion
│   ├── delivery-form/
│   │   ├── delivery-form.tsx               # Main form orchestrator (delivery mode, edited recipients, sender options)
│   │   ├── preview-panel.tsx               # Email/Slack preview (TipTap in edit mode, line-by-line markdown→HTML)
│   │   ├── review-links-section.tsx        # Template-aware link inputs with Flexible Link priority
│   │   ├── scope-section.tsx               # Revision/feedback dropdowns
│   │   ├── version-notes-section.tsx       # Version notes (TipTap rich text editor with @mentions)
│   │   ├── recipients-section.tsx          # Editable To/CC inputs + From sender dropdown
│   │   ├── sender-select.tsx               # Sender dropdown with profile pictures + full names
│   │   ├── slack-channel-section.tsx       # Slack channel picker
│   │   └── send-bar.tsx                    # Save/Send bottom bar
│   └── shared/
│       ├── header.tsx                      # App header with nav
│       ├── providers.tsx                   # TanStack Query + theme provider
│       ├── searchable-select.tsx           # Reusable combobox component
│       ├── rich-text-editor.tsx            # Reusable TipTap rich text editor (with @mention support)
│       └── mention-list.tsx               # Mention suggestion dropdown component
├── hooks/
│   └── use-auto-save.ts                    # 30s auto-save hook
├── lib/
│   ├── auth.ts                             # NextAuth config (Google OAuth)
│   ├── get-session-user.ts                 # Session user email utility for API routes
│   ├── clickup.ts                          # ClickUp API client (7 methods + 3 helpers)
│   ├── custom-field-ids.ts                 # All ClickUp field/space/list IDs
│   ├── db.ts                               # Prisma client singleton (graceful fallback)
│   ├── markdown-to-quill.ts                # Quill Delta ↔ Markdown conversion (with emoji embeds)
│   ├── template-families.ts                # Deliverable type family grouping + version ordering
│   ├── template-merge.ts                   # Template merge engine
│   ├── types.ts                            # TypeScript interfaces (incl. DeliveryFormState with editable recipients)
│   └── utils.ts                            # cn() utility
├── middleware.ts                            # Auth middleware (protects all routes)
└── prisma/
    └── schema.prisma                       # Database schema (4 models)
```

---

## Environment Variables

| Variable | Purpose | Status |
|---|---|---|
| `CLICKUP_API_TOKEN` | ClickUp API authentication | Configured |
| `CLICKUP_WORKSPACE_ID` | ClickUp workspace ID | Configured |
| `SLACK_BOT_TOKEN` | Slack bot token (`xoxb-...`) for channel/member listing and @mentions | Configured |
| `N8N_API_URL` | n8n instance URL | Configured |
| `N8N_API_KEY` | n8n API key | Configured |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Configured |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Configured |
| `NEXTAUTH_SECRET` | NextAuth session secret | Configured |
| `NEXTAUTH_URL` | NextAuth base URL | Configured |
| `POSTGRES_URL` | PostgreSQL connection string (Neon) | Configured |

---

## What's Been Built (Completed)

### Core Infrastructure
- [x] Next.js 16 project with TypeScript, Tailwind, Shadcn/ui
- [x] Prisma 7 schema with driver adapter pattern (`@prisma/adapter-pg`)
- [x] Graceful DB fallback (proxy throws clear error when POSTGRES_URL not set)
- [x] ClickUp API client (`lib/clickup.ts`) with fetch, update, create, status change, and field listing methods
- [x] Custom field ID constants for 20+ fields
- [x] Template merge engine with `[variable]` and `[Link Text | variable]` support
- [x] TanStack Query provider with React Query DevTools
- [x] Theme provider (next-themes)
- [x] Reusable `SearchableSelect` combobox component
- [x] Reusable `RichTextEditor` TipTap component with markdown ↔ HTML conversion
- [x] Toast notifications (Sonner)
- [x] TipTap CSS styles in globals.css

### Dashboard
- [x] Deliverables tab redesigned with **5 time-bucket cards** (Overdue, Today, This Week, Upcoming, Unscheduled)
- [x] Overdue card only shows tasks with an assignee; unassigned overdue → Unscheduled
- [x] **Global assignee filter** with profile pictures and full names (filters all cards simultaneously)
- [x] 5-column fixed-width grid layout for consistent vertical alignment across cards
- [x] Fixed-width department badges (118px) for visual consistency
- [x] Assignee column shows avatar + first name only (left-aligned for avatar alignment)
- [x] Overdue dates render in red
- [x] Drafts tab with resume functionality
- [x] Sent tab with delivery history, detail dialog, search

### Delivery Form
- [x] Two-column layout with all editor sections
- [x] **Delivery mode toggle** — segmented control (Email | Slack) with auto-detection from ClickUp contact data
- [x] Deliverable type dropdown with full 133-option searchable list from ClickUp field definition
- [x] Live template switching when deliverable type changes
- [x] Template-aware review links (only shows fields used in template)
- [x] **Flexible Link priority** — first "Add Review Link" activates Flex Link field (syncs to ClickUp); subsequent clicks add dynamic extra links
- [x] Scope section (revision rounds, feedback windows)
- [x] Version notes with TipTap rich text editor (bold, italic, lists, links, undo/redo) and **@mention support**
- [x] **Editable recipients** — To and CC are editable Input fields; From is a **sender dropdown** with profile pictures + full names (Command/Popover, sourced from template senders via `/api/templates/field-options`)
- [x] Slack channel override dropdown (from Slack API, conditionally shown based on delivery mode)
- [x] Live preview panel with Email/Slack tabs (adaptive tab visibility based on delivery mode)
- [x] Preview Mode with rendered HTML (stateful line-by-line markdown→HTML parser with proper list/header/emoji support)
- [x] Edit Mode with TipTap rich text editor for both Email and Slack previews, with @mention support
- [x] "Reset to Template" reverts edit mode to auto-merged output
- [x] **ClickUp formatting preservation** — API routes prefer `value_richtext` (Quill Delta) converted to markdown via `quillDeltaToMarkdown()`, preserving headers, bold, bullets, emojis
- [x] Auto-save every 30 seconds (DB only, no ClickUp write)
- [x] Draft restoration on form open (includes edited recipients, sender, delivery mode)
- [x] Save Draft button (writes to ClickUp + portal DB)
- [x] Send button with confirmation modal (uses edited recipient values)
- [x] Post-send success/confirmation page
- [x] Bottom bar scroll padding so content isn't hidden behind sticky bar

### Send Flow
- [x] Write form fields to ClickUp custom fields
- [x] Feedback deadline sync when deliverable type changes
- [x] Dynamic task count calculation from sibling Delivery Deadline tasks
- [x] n8n webhook call with complete payload (including dynamic task counts)
- [x] Task status update to "complete" on success
- [x] Delivery logging to PostgreSQL (Delivery + DeliveryLink records)
- [x] Draft cleanup after successful send

### Templates
- [x] Template list page (`/templates`) — redesigned as grouped grid layout with family cards
- [x] Deliverable-type family grouping with explicit overrides (Edit, Spinoffs, Batch, Reformats, Additional Deliverables, Success Bundle) and automatic suffix-stripping
- [x] Responsive grid (1/2/3 columns) with family cards showing variant count and sorted items
- [x] Completeness status indicators (green checkmark / amber warning) on each variant row
- [x] Accordion expand/collapse on each variant showing subject line, sender, body preview, and "Open Template" button
- [x] Department filter tabs with count badges
- [x] Template editor page with TipTap WYSIWYG rich text editor and variable reference sidebar
- [x] Variable chips in TipTap editor — `[variableName]` and `[Link Text | variableName]` render as styled inline chips
- [x] Quill Delta ↔ Markdown ↔ HTML conversion pipeline (`lib/markdown-to-quill.ts` + `rich-text-editor.tsx`)
- [x] **Emoji embed support** — ClickUp emoji inserts (`{ emoji: "link" }`) converted to Unicode via 25+ shortcode map
- [x] Frame.io link-in-brackets fix — prevents nested markdown link corruption in Quill Delta conversion
- [x] Bullet/ordered list round-trip fix — TipTap `<li><p>` wrapping for correct list parsing
- [x] Save template (writes Quill Delta to ClickUp + stores version in DB)
- [x] Create new template page (`/templates/new`) with deliverable type and department dropdowns
- [x] Create template API (`POST /api/templates/create`) — creates task in ClickUp Delivery Snippets list
- [x] Version history panel in template editor (collapsible, shows all versions with timestamps)
- [x] Version preview (click a version to inspect its content)
- [x] Restore template to previous version with confirmation dialog (auto-saves current state before reverting)

### Projects
- [x] Projects browse page (`/projects`) — all projects grouped by client, searchable
- [x] Project detail page (`/projects/[listId]`) — summary stats, all links card, delivery history table
- [x] Projects API (`GET /api/projects`) — lists clients/projects from ClickUp hierarchy
- [x] Project links API (`GET /api/projects/[listId]/links`) — all delivery links for a project

### Analytics
- [x] Analytics API (`GET /api/analytics`) — aggregated stats with configurable period (30d, 90d, 12m, all)
- [x] Analytics dashboard page (`/analytics`) — stat cards, area chart, pie chart, bar chart, leaderboard, activity feed
- [x] Recharts visualizations for deliveries over time, department breakdown, top deliverable types
- [x] Team leaderboard with ranked sender counts and progress bars
- [x] Recent activity feed with department badges and relative timestamps

### Contacts & Mentions
- [x] Contacts API (`GET /api/contacts/all`) — all project contacts with Slack IDs, batch-fetched, 10min server cache, de-duplicated by email
- [x] Optional `?listId=` filter for project-specific contacts
- [x] Slack @mention chips in version notes editor (TipTap Mention extension)
- [x] Tiered autocomplete: project contacts first → Slack workspace members
- [x] Styled mention chips with `@` prefix in the editor
- [x] Mention data round-trips through markdown as `@[Name](userId)`

### Unified Rendering & Slack Pipeline (Phase 13)
- [x] **Unified preview pipeline** — both Email and Slack previews render through the same `RichTextEditor` (TipTap) component; removed legacy `slackMrkdwnToHtml()` function
- [x] **Lossless mention round-trip** — Slack `<@userId>` tokens survive through preview → edit → save → send without losing the user ID
- [x] **Send-time Slack conversion** — `convertToSlackFormat()` exported from `template-merge.ts` and called in `send/route.ts` at dispatch time (not at merge time)
- [x] **Simplified delivery mode** — removed "Both" option; delivery mode is now Email OR Slack (mutually exclusive segmented control)
- [x] **Mention chip styling** — Slack-blue chips (`#e8f0fe` background, `#1264a3` text) with `!important` to override Tailwind v4 layers; no `::before` pseudo-element (TipTap adds `@` prefix natively)
- [x] **Mention dropdown fix** — stripped leading `@` from slack handle display in mention-list.tsx (prevented double `@@`)
- [x] **Slack API error handling** — `.trim()` on `SLACK_BOT_TOKEN` in both `/api/slack/channels` and `/api/slack/members`; descriptive error messages in API responses and `SlackChannelSection` UI
- [x] **Slack handle preference** — mention chips display Slack handles (e.g. `emily.gardiner`) rather than full names when available

### Communication Log
- [x] Send payload now includes aggregated communication log from prior deliveries for the same project
- [x] Up to 20 most recent deliveries summarized with date, type, department, subject, sender, and recipient

### n8n Execution Status
- [x] Status check API (`GET /api/deliveries/[id]/status`) — polls n8n API for execution result
- [x] Updates delivery record with terminal status (success/error)
- [x] Graceful fallback when DB or n8n credentials not available

### Authentication
- [x] Auth middleware (`src/middleware.ts`) — protects all routes, bypassed when OAuth not configured
- [x] Sign-in page with Google OAuth button and @consume-media.com domain restriction
- [x] Sign-out confirmation page
- [x] Auth error page (AccessDenied, Configuration, generic)
- [x] Session-aware header with user avatar, name, and sign-out button
- [x] `getSessionUserEmail()` utility — replaces hardcoded "portal-user" across all API routes
- [x] API routes return 401/403 for unauthenticated/unauthorized requests

### API Endpoints
- [x] 24 API routes covering tasks, templates (list, edit, create, history, restore, field-options), deliverable types, drafts, deliveries (list, detail, status), projects, analytics, contacts, Slack

---

## What's Remaining

All application code and environment configuration is complete for local development. The remaining items:

- [x] **Database connection** — Neon PostgreSQL provisioned and configured (`POSTGRES_URL` set)
- [x] **Google OAuth credentials** — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET` all configured
- [x] **Slack bot token** — `SLACK_BOT_TOKEN` configured with valid `xoxb-...` token
- [ ] **`FLEX_LINK` custom field ID** — Still empty string in `custom-field-ids.ts`; find the field ID in ClickUp and update
- [ ] **`N8N_PORTAL_WEBHOOK_URL`** — Configure the portal-specific n8n webhook endpoint in `.env.local`
- [ ] **Vercel deployment** — Deploy to production with all environment variables set
- [ ] **Slack bot scopes** — Verify the bot has `channels:read`, `users:read`, and `chat:write` scopes in the Slack app configuration

---

## Implementation Phases (from Plan)

| Phase | Description | Status |
|---|---|---|
| Phase 1: Foundation | Next.js setup, OAuth, Prisma, ClickUp client | Done (code complete; awaiting DB + OAuth credentials) |
| Phase 2: Dashboard | Task list, filtering, TanStack Query | Done |
| Phase 3: Data Assembly | Task detail API, template engine, merge logic | Done |
| Phase 4: Delivery Form | Form sections, preview panel, edit mode | Done |
| Phase 5: Send + Draft | Save draft, auto-save, send flow, confirmation | Done |
| Phase 6: Sent Log + Drafts | Sent tab, drafts tab, detail views | Done |
| Phase 7: Template Editor | List, editor, create, version history, restore | Done |
| Phase 8: Project Links | Project browser, link aggregation | Done |
| Phase 9: Analytics | Charts, stats, leaderboard | Done |
| Phase 10: Template Editor v2 | TipTap WYSIWYG editor, Quill Delta conversion, variable chips, grouped grid layout, completeness indicators, accordion details | Done |
| Phase 11: Dashboard Redesign | Time-bucket cards, assignee filter with avatars, 5-column grid, fixed-width badges | Done |
| Phase 12: Delivery Form v2 | Delivery mode toggle, editable recipients, sender dropdown, Flexible Link priority, ClickUp formatting preservation, emoji support, Slack editable preview with @mentions | Done |
| Phase 13: Unified Rendering & Slack Polish | Unified email/Slack preview pipeline (single TipTap renderer), lossless mention round-trip, send-time Slack mrkdwn conversion, simplified delivery mode (Email/Slack only), Slack bot token configuration, mention chip styling, error handling for Slack API | Done |

---

## How to Run

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run development server
npm run dev

# Build for production
npm run build
```

**All environment variables are configured in `.env.local` for local development.** To set up a fresh instance:
1. Copy `.env.local` and fill in all values (see Environment Variables table above)
2. Run `npx prisma db push` to create database tables
3. Ensure the Slack bot has `channels:read`, `users:read`, and `chat:write` scopes
4. Set `N8N_PORTAL_WEBHOOK_URL` for the send flow (still pending)
5. Update `FLEX_LINK` field ID in `lib/custom-field-ids.ts` if needed
