# Client Portal v3: the desktop

Date: 2026-09-09
Status: approved direction (Michael, 2026-09-09), building

## Why again

Michael's review of v2: generic and poor. The brand has a much stronger
language than a light page with a table, and it is already built: the arcade
desktop on the sign-in page (dark ground, 62px grid, floating cherries and
ghosts, yellow-outline pixel folders labelled NEW_FINAL_FINAL_REALTHISTIME.MP4,
"Powering Up" windows with Mac traffic lights), the CharlieOS wordmark, the
offset-shadow pixel buttons, the Pac ripple loader, the capsule menus. He wants
the client portal to be that: a 1990s Mac desktop, each project a folder in a
Project Finder, each card a window, fun and delightful. Whimsy moves from the
edges to the center; that is his call for this surface.

## The metaphor, exactly

The client's portal is their own little computer. Turning it on boots to a
desktop. Their projects are folders. What we sent them lives in windows. What
they owe us is a window that stays on top. Everything the old list did still
happens, but inside the metaphor.

Name on the menu bar: "Consume OS" in the CharlieOS lockup style (placeholder;
Michael names things).

## Layout (desktop, 1280)

```
┌ menu bar 34px: [Pac] Consume OS  ·  STACK OVERFLOW (pixel caps) ······· Send us a note  Tue 4:12 PM ┐
│ desktop: #151919, 62px grid rgba(207,238,220,0.06); a ghost and a cherry float near the edges           │
│                                                                                                          │
│  ┌ ○○○  NEEDS YOUR REVIEW ───────────────┐   ┌ ○○○  UP NEXT ────────────────────┐                        │
│  │ light body                            │   │ light body                        │                        │
│  │ Post Script AV · V1                   │   │ Sep 9   Post Script AV V2         │                        │
│  │ CallRail Wiggam Law                   │   │         CallRail Wiggam Law       │                        │
│  │ Due Tue, Sep 8      [OPEN REVIEW]     │   │ Sep 15  Edit V1                   │                        │
│  │                     [ALL FEEDBACK IS IN]│  │ Sep 18  Edit V2                   │                        │
│  └───────────────────────────────────────┘   └───────────────────────────────────┘                        │
│                                                                                                          │
│  PROJECT FINDER                                                                                           │
│  [folder]            [folder]            [folder]            [folder]                                     │
│  CALLRAIL WIGGAM     LEADERS OF CODE     STACK BVAS          ARCHIVE (3)                                  │
│  LAW ... (1)                                                                                              │
│                                                                                                          │
│  ┌ ○○○  CALLRAIL WIGGAM LAW VIRTUAL TESTIMONIAL ───────────────────────────────────────┐                  │
│  │ In progress, wraps up Sep 21, up next: Post Script AV V2 on Sep 9                    │                  │
│  │ roadmap rail (pellets, yellow Pac = up next)                                          │                  │
│  │ deliverables table (rows expand to the message, versions, confirm)                    │                  │
│  └───────────────────────────────────────────────────────────────────────────────────────┘                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Mobile (390): menu bar; windows stack full width in this order: Needs your
review, Up next, Project Finder (folders in a horizontal strip), open project
windows. No dragging on touch.

## Windows

The window chrome is the one from `PoweringUpWindow` in
`src/components/arcade-background.tsx`, rebuilt in CSS so it can hold real
content:

- Title bar 30px, `#151919`, 1px `#F4FBF6` outline around the whole window,
  top corners 4.5px, no bottom radius (classic). Three traffic lights at left:
  hollow white 13px circles; on hover they fill with the macOS colors
  (`#FF5F57`, `#FEBC2E`, `#28C840`) and show their glyphs. Close hides the
  window (a project window closes back into its folder; the review window
  can't be closed, its close light is disabled and stays hollow). Minimize
  collapses the window to its title bar. Zoom toggles the window to the full
  content width. Title text: pixel caps, `#FAFFFD`, centered, 13px, 0.15em.
- A second window outline sits 6px right and 6px down behind every window
  (the stacked-window depth from the sign-in art), 1px `#F4FBF6` at 55%.
- Body: `#FAFFFD`, ink `#151919`, body text `#4D5959`, Montserrat. Padding 20.
  Inside the body the v2 components live on: the roadmap rail, the deliverables
  table, the status pills, the disclosure, the confirm flow. They keep their
  behavior; restyle only what the window needs (no outer card borders).
- Windows on desktop are draggable by the title bar (pointer events, clamped
  to the desktop, z-order raises on pointerdown). Positions persist per token
  in localStorage so the client's desktop stays how they left it. Reduced
  motion and touch: no drag.
- Windows enter with a transform-only pop (scale 0.96 to 1, 200ms,
  `cubic-bezier(0.2,0.7,0.2,1)`), staggered 60ms in reading order.

## Project Finder

- A pixel-caps caption "PROJECT FINDER" then a row of folders. Folder art is
  `public/folder-1.svg` (full, for projects with something ahead or awaiting)
  and `public/folder-2.svg` (flatter, for quiet projects). 96px wide. Label
  under each in pixel caps, 11px, `#DBEF00` on the dark desktop, two lines max
  with the project name truncated to 28 characters. A small green badge disc
  with the count of items awaiting review when > 0.
- Double-click (or tap) opens the project window; a single click selects the
  folder (outline highlight, like Finder). Open projects show their folder as
  "open" (folder-2 with a green outline instead of yellow).
- Completed (archived) projects are not in the row. They sit inside one
  "ARCHIVE" folder that opens a window listing the archived projects as
  folders; opening one shows its deliverables table (rail hidden, as in v2).
- In-progress projects open by default on first visit, cascaded 24px apart
  (top-left offset) under the Finder row; the most recent activity on top.

## Needs your review window (always on top, cannot close)

Rows: deliverable title + variant, project name, deadline line, then the two
buttons. Buttons are the brand offset-shadow pixel buttons (`.cm-btn` from the
MOGRT Library / Soundcheck `Button.tsx` and CSS; copy them in verbatim,
light-body variant: stroke and shadow `#151919`). "OPEN REVIEW" secondary
(white), "ALL FEEDBACK IS IN" primary (green, hover flips yellow, press sinks).
Past due gets the yellow pill; due today the yellow-outline pill. When nothing
is awaiting, the window body shows the ghost icon at 56px with the pixel
caption "ALL CLEAR" and the sentence "Nothing needs your review right now."

## Up next window

Every upcoming milestone across in-progress projects (states up-next, planned,
in-review), sorted by date, first 8, grouped by day: a left column with the
date in pixel caps (`SEP 9`), the milestone label and project name on the
right. In-review items show "waiting on your feedback" in dark green. Empty:
"Nothing scheduled yet. We'll add dates as the project plans firm up."

## Delight, deliberately

- Boot: first visit per session shows the "Powering Up" window centered on
  the empty desktop for 1.4s (the existing 10-segment progress bar), then the
  desktop pops in. Skipped on reduced motion and on repeat visits in the same
  session (sessionStorage).
- Confirming feedback: the row's status flips to Confirmed and a pixel "+100"
  in `#DBEF00` rises out of the button and fades (arcade points), 700ms,
  transform-only. Reduced motion: no float, just the flip.
- Menu bar clock: live, Eastern, "Tue 4:12 PM". A tiny thing that makes it a
  computer.
- The ghost and cherry float near the desktop edges with the existing
  `animate-float-*` classes, never over a window, never in the way.
- Copy stays plain: "Awaiting you", "Confirmed Jul 12", "Wraps up Sep 28".
  The whimsy is the frame, not the sentences.

## Type and color

- Pixel caps: window titles, folder labels, the two captions, the pixel
  buttons, the clock. This is the desktop's system font; it is allowed to be
  everywhere the OS chrome is. Inside window bodies it does not appear.
- EightiesComeback: the client name once, as the desktop greeting behind the
  windows? No. It appears only in the Archive window title area and the
  project window's summary heading. Keep it rare.
- Montserrat for everything in window bodies.
- Palette unchanged: `#151919` ground, `#FAFFFD` bodies, `#6AC387` green,
  `#DBEF00` yellow (folders, "now", past due, points), `#C5FFD8` tint,
  `#BBD2CF` hairlines on light, `#4D5959` / `#6F7F7F` text. Traffic lights are
  the only place the macOS reds and ambers appear.

## What does not change

The data layer and page model (`src/lib/portal-page.ts`,
`portal-page-model.ts`), the confirm/undo/message/view routes, the reach-out
form logic, `renderPortalBody`, the deliverables table's expand behavior, the
rail's states. This is a re-skin of the frame plus new arrangement, not new
data.

## Generic-default check

A "retro Mac desktop" can be a cliché too (Poolsuite, Windows 95 CSS kits).
This one is Consume's because the chrome is their own sign-in art (the
stacked-window outline, the hollow traffic lights, the Powering Up bar), the
folders are their yellow-outline NEW_FINAL_FINAL folders, the buttons are the
brand's press-into-shadow pixel buttons, the loader is the Pac ripple, the
points pop is arcade, and the content inside the windows stays the quiet,
tabular v2 work. No beige System 7 grays, no Chicago font, no fake dithering.
