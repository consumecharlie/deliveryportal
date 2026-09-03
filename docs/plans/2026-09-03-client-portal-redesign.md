# Client Portal Redesign: Design Brief

Date: 2026-09-03
Status: approved direction, building

## Why

The first pass rendered every delivery as an identical card in a grid. Michael's
review: underwhelming, chaotic, no sense of which projects are active or what is
coming next, and deliverables with the same type label ("Edit V1" x6 in the
Leaders of Code Podcast) are indistinguishable.

Two facts change the design:

1. ClickUp already holds each project's roadmap. Every list has a "Share X with
   Client" task (Project Task Type 11, Delivery Deadline) with a due date and a
   paired "Confirm X Feedback Received" task (type 12). Completed ones are the
   past; open ones are the future. The list itself carries a due date.
2. A share task's parent task names the actual deliverable ("LOC19: Intuit",
   "Post-Production - Leaders of Code - Ep #21"), and the share task name
   carries the variant ("Share Video Edit01 with Client" vs "Share Snippets
   Edit01 with Client"). Keying on the parent, not the type label, fixes the
   identity problem.

## Subject, audience, job

A review room for a video production client. The reader is a marketing lead at
a B2B company who gets a link in an email and wants three things in order: what
needs me, where is the thing I am looking for, and what is coming next.

## Design plan

**Identity.** Consume Media's own system, taken from the brand guide: retro,
clean, cool. Ground is Almost White `#FAFFFD` with white panels and hairlines in
Lightest Gray `#BBD2CF`. Ink is Almost Black `#151919`, body Dark Gray
`#4D5959`, secondary Medium Gray `#6F7F7F`. Consume Green `#6AC387` marks
progress and delivered work; Dark Green `#508E61` for green text on light;
Light Green `#C5FFD8` tints the one surface that needs the reader ("Needs your
review"). Yellow Accent `#DBEF00` is reserved for the single "now" marker: the
milestone the client is on, and due-today. Overdue is ink on yellow. No red.

**Type.** EightiesComeback ExtraBold for the client name and project names.
Montserrat for everything else (Regular body, Bold for row titles). Small
Pixel7, all caps, 15% tracking, used exactly where the brand guide says: as an
accent caption, and only for the two section captions "Needs your review" and
"Up next". Nowhere else.

**The one bold element: the roadmap rail.** Each project section opens with a
horizontal rail of its planned deliverables, drawn from ClickUp. Delivered
milestones are filled green pellets, the milestone in the client's hands is the
Pac play mark in yellow, upcoming ones are hollow. Labels under each pellet are
the deliverable name; dates sit under those. This is the Pac motif from the
brand used structurally: the client eats through the project. Everything else
on the page is quiet.

**Layout.** Left aligned, max width 1120px, single column. Wireframe:

```
[Pac mark] Consume Media                                   [Send us a note]

STACK OVERFLOW                                   (EightiesComeback, large)
3 projects in progress, 2 completed

NEEDS YOUR REVIEW                                     (pixel caps caption)
┌────────────────────────────────────────────────────────────────────────┐
│ Post Script AV V1   CallRail Wiggam Law   Due Tue, Sep 8   [Open review] [All feedback is in] │
│ Ep #21 Video Edit01 Leaders of Code       Past due         [Open review] [All feedback is in] │
└────────────────────────────────────────────────────────────────────────┘
(hidden entirely when empty; a single quiet line replaces it)

Leaders of Code Podcast                    In post-production, wraps up Sep 28
●────●────●────◗────○────○
Post   Post   Post   Edit   Edit   Final
Script Script Script V1     V2     Delivery
V1     V2     Final  Sep 15 Sep 18 Sep 28
Aug 20 Aug 25 Aug 27

Deliverable                          Shared      Links              Status
LOC19: Intuit                        May 20      Frame.io           Confirmed May 22
  Video Edit01, version 2 of 2                                       ▸ earlier versions
LOC19: Intuit                        Jun 4       Frame.io           Confirmed
  Snippets Edit01
Leaders of Code, Ep #21              Jul 30      Frame.io  Drive    Awaiting you, due Aug 3
  Video Edit01
(a row expands to show the message we sent and earlier versions inline)

Completed projects (2)  ▸
```

Deliverables are a table, not cards: one row per deliverable (keyed by parent
task), latest version shown, earlier versions and the message behind a
disclosure. Links are compact labelled buttons in the row. Status is a status
pill (the only pills on the page). Version dropdowns are gone.

Project page: same header with a breadcrumb back to the client, that project's
section expanded with every version listed.

Reach-out: a button in the header that opens a side panel with the chat-styled
note form, instead of a permanent block at the bottom.

**Principles.** Structure encodes state: the rail is the project's state, the
table is the archive, the green tint is the to-do. No decorative gradients, no
icon salad, no hover choreography; motion only on expand and confirm. Copy is
plain: "Awaiting you", "Confirmed Jul 12", "Up next", "Wraps up Sep 28".

## Generic-default check

A light page with a green accent and a table could be any SaaS. What makes this
one Consume Media's: the brand's own off-white and greens rather than a cream
and terracotta; EightiesComeback and the pixel caption, which no template
carries; the pellet rail as the project's progress meter, which is both the
brand's mascot idea and the most useful piece of information on the page; and
tabular deliverables instead of the card kit. Cut from the first pass: the card
grid, the version select, the "Bookmark this page" hint, the bottom chat block,
and the "You're all caught up" box.

## Data changes

- `Delivery` gains `parentTaskId`, `parentTaskName`, `shareTaskName` (nullable),
  written at send time from the share task and backfilled for existing rows
  with one `getTask` per delivery.
- `portal-live` also fetches the list's Delivery Deadline tasks (type 11) and
  the list due date, cached with the feedback tasks under `portal:fd:<listId>`.
- Pure helpers: `deliverableTitle(parentName)` strips department prefixes
  ("Post-Production - ", "Pre-Production - ", "Design - ", "Production - ");
  `variantLabel(shareTaskName)` strips "Share " and " with Client".
- Grouping key becomes `parentTaskId`, falling back to the type family when a
  delivery has no parent.
- New page model in `src/lib/portal-page-model.ts` (the contract between the
  data layer and the UI).
