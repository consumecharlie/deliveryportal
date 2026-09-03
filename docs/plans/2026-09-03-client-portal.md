# Client Portal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give every client one bookmarkable link (`/portal/<token>`) showing every deliverable we have sent them, all review links, a live feedback deadline per deliverable, and an "All feedback is in" button that closes the loop in ClickUp and Slack.

**Architecture:** New client-facing route surface inside the existing deliverable portal (Next.js 16 App Router, same Neon DB). Reads come from the `Delivery` + `DeliveryLink` tables plus live ClickUp Feedback Deadline tasks (cached per project list). Writes are confined to four new tables (`PortalAccess`, `ProjectChannel`, `FeedbackConfirmation`, `PortalView`) and to ClickUp/Slack side effects on confirmation. Phase 1 is additive: the existing send flow is untouched except for writing `clientFolderId`.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Prisma 7 + `@prisma/adapter-pg` on Neon, Tailwind 4 + shadcn/ui, Vitest, ClickUp v2 API, Slack Web API (bot token), Vercel cron, n8n webhook for reminder email.

**Design doc:** `docs/plans/2026-09-03-client-portal-design.md` (read it first).

**Conventions for every task:**
- Tests live in `src/lib/__tests__/*.test.ts`, run with `npx vitest run <file>`. Vitest is configured with `globals: true` and the `@/` alias (`vitest.config.ts`).
- Pure logic goes in `src/lib/*.ts` with no I/O so it is testable. I/O wrappers are thin.
- No em dashes anywhere in client-facing copy (Michael's rule). Use commas, colons, periods.
- Work on branch `client-portal`. Commit after each task. Push once at the end of the plan (Michael tests on the Vercel deploy). Commit messages end with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01TFi9LwXd6Rc61nh2WYEn7g
  ```
- Schema changes go live with `npx prisma db push` against `POSTGRES_URL` in `.env.local` (that is the production Neon DB; there is no separate staging DB). Run `npx prisma generate` afterwards.
- Before the final push run `npx tsc --noEmit && npx vitest run && npx next build` (lint/tsc miss prerender errors; `next build` catches them).

**Access model decision (refines the design doc):** one token per client folder. A project link is a deep link under the same token: `/portal/<token>/<listId>`. This gives "share a project link" and "climb up to the client view" with a single credential to manage. `PortalAccess.scope` is therefore dropped from the design.

---

## Phase A: Foundations

### Task A1: Branch and schema

**Files:**
- Modify: `prisma/schema.prisma` (append after `AuditResult`)

**Step 1: Create the branch**

```bash
cd /Users/charlie/Claude/deliverable-portal
git checkout -b client-portal
git add docs/plans/2026-09-03-client-portal-design.md docs/plans/2026-09-03-client-portal.md
git commit -m "docs: client portal design + implementation plan"
```

**Step 2: Append the new models**

```prisma
/** One bookmarkable client-portal link per ClickUp client folder. A project
 *  view is a deep link under the same token (/portal/<token>/<listId>).
 *  Rotate by revoking (set revokedAt) and creating a new row. */
model PortalAccess {
  id             String    @id @default(cuid())
  clientFolderId String
  clientName     String
  token          String    @unique
  createdBy      String
  createdAt      DateTime  @default(now())
  revokedAt      DateTime?
  views          PortalView[]

  @@index([clientFolderId])
}

/** Confirmed internal Slack channel (#client-project) for a project list.
 *  Written once by a PM (or auto-matched when the crawl is confident). */
model ProjectChannel {
  projectListId String   @id
  channelId     String
  channelName   String
  autoMatched   Boolean  @default(false)
  confirmedBy   String
  confirmedAt   DateTime @default(now())
}

/** A client pressing "All feedback is in" on a delivery. undoneAt != null
 *  means the confirmation was reversed; the latest row per delivery wins. */
model FeedbackConfirmation {
  id                     String    @id @default(cuid())
  deliveryId             String
  delivery               Delivery  @relation(fields: [deliveryId], references: [id], onDelete: Cascade)
  projectListId          String
  deliverableType        String
  feedbackDeadlineTaskId String?
  confirmedAt            DateTime  @default(now())
  confirmedByName        String?
  undoneAt               DateTime?
  slackChannelId         String?
  slackMessageTs         String?

  @@index([deliveryId])
  @@index([projectListId])
}

/** Lightweight open tracking for the internal "has the client looked" view. */
model PortalView {
  id         String       @id @default(cuid())
  accessId   String
  access     PortalAccess @relation(fields: [accessId], references: [id], onDelete: Cascade)
  deliveryId String?
  viewedAt   DateTime     @default(now())
  userAgent  String?

  @@index([accessId, viewedAt])
  @@index([deliveryId])
}
```

Add the back-relation on `Delivery` (inside the existing model, next to `links`):

```prisma
  confirmations   FeedbackConfirmation[]
```

**Step 3: Push the schema and regenerate**

```bash
npx prisma db push
npx prisma generate
npx tsc --noEmit
```
Expected: `db push` reports the four new tables; `tsc` clean.

**Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(portal): add PortalAccess, ProjectChannel, FeedbackConfirmation, PortalView"
```

---

### Task A2: Portal token generator

**Files:**
- Create: `src/lib/portal-token.ts`
- Test: `src/lib/__tests__/portal-token.test.ts`

**Step 1: Write the failing test**

```ts
import { generatePortalToken, isValidPortalToken } from "@/lib/portal-token";

describe("portal token", () => {
  it("is 32 url-safe chars and unique", () => {
    const a = generatePortalToken();
    const b = generatePortalToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(b);
  });

  it("validates shape only", () => {
    expect(isValidPortalToken(generatePortalToken())).toBe(true);
    expect(isValidPortalToken("short")).toBe(false);
    expect(isValidPortalToken("x".repeat(32) + "/")).toBe(false);
  });
});
```

**Step 2: Run it, expect failure**

`npx vitest run src/lib/__tests__/portal-token.test.ts` → FAIL, module not found.

**Step 3: Implement**

```ts
import { randomBytes } from "crypto";

/** 24 random bytes → 32 base64url chars. ~144 bits of entropy. */
export function generatePortalToken(): string {
  return randomBytes(24).toString("base64url");
}

export function isValidPortalToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(token);
}
```

**Step 4: Run, expect pass. Step 5: Commit**

```bash
git add src/lib/portal-token.ts src/lib/__tests__/portal-token.test.ts
git commit -m "feat(portal): token generator"
```

---

### Task A3: Backfill `clientFolderId` on existing rows

Every `Delivery`/`DeliveryLink` row has an empty folder ID. Fill it from ClickUp (`getList(listId).folder.id`), one call per distinct list.

**Files:**
- Create: `scripts/backfill-client-folder.ts`

**Step 1: Write the script**

```ts
/**
 * One-time backfill: fill Delivery.clientFolderId and DeliveryLink.clientFolderId
 * from ClickUp (list → folder). Idempotent. Run:
 *   npx tsx --env-file=.env.local scripts/backfill-client-folder.ts
 */
import { prisma } from "../src/lib/db";
import { getList } from "../src/lib/clickup";

async function main() {
  const rows = await prisma.delivery.findMany({
    where: { OR: [{ clientFolderId: null }, { clientFolderId: "" }], projectListId: { not: null } },
    select: { projectListId: true },
    distinct: ["projectListId"],
  });
  console.log(`lists to resolve: ${rows.length}`);
  let updated = 0;
  for (const { projectListId } of rows) {
    if (!projectListId) continue;
    try {
      const list = await getList(projectListId);
      const folderId = list.folder?.id;
      if (!folderId) { console.warn("no folder for list", projectListId); continue; }
      const d = await prisma.delivery.updateMany({
        where: { projectListId, OR: [{ clientFolderId: null }, { clientFolderId: "" }] },
        data: { clientFolderId: folderId },
      });
      const l = await prisma.deliveryLink.updateMany({
        where: { projectListId, clientFolderId: "" },
        data: { clientFolderId: folderId },
      });
      updated += d.count;
      console.log(`${projectListId} → ${folderId} (${list.folder.name}): ${d.count} deliveries, ${l.count} links`);
    } catch (err) {
      console.warn("failed", projectListId, err);
    }
  }
  console.log(`done, ${updated} deliveries updated`);
}

main().then(() => process.exit(0));
```

**Step 2: Run it**

```bash
npx tsx --env-file=.env.local scripts/backfill-client-folder.ts
```
Expected: ~52 lines, then `done, 259 deliveries updated` (or the current count). Verify:

```bash
node -e 'require("dotenv").config({path:".env.local"});const {Client}=require("pg");const c=new Client({connectionString:process.env.POSTGRES_URL});c.connect().then(()=>c.query(`select count(*) filter (where "clientFolderId" is null or "clientFolderId"=\x27\x27) missing from "Delivery"`)).then(r=>{console.log(r.rows);c.end()})'
```
Expected: `missing: '0'` (a handful may remain if a list was deleted in ClickUp; note them).

**Step 3: Commit**

```bash
git add scripts/backfill-client-folder.ts
git commit -m "chore(portal): backfill clientFolderId from ClickUp"
```

---

### Task A4: Send route writes `clientFolderId` going forward

**Files:**
- Modify: `src/app/api/tasks/[taskId]/send/route.ts` (both `prisma.delivery.create` blocks, ~line 349 and ~496, and the link records at ~389/~402/~528)
- Modify: `src/app/api/deliverable/adhoc-send/route.ts` (same pattern, find its `prisma.delivery.create`)

**Step 1: Resolve the folder once near the top of step 6 (before the first `prisma.delivery.create`)**

```ts
    // Client folder for portal grouping. One cheap ClickUp call; non-fatal.
    let clientFolderId: string | null = null;
    if (listId) {
      try {
        clientFolderId = (await getList(listId)).folder?.id ?? null;
      } catch (err) {
        console.warn("Could not resolve client folder for", listId, err);
      }
    }
```
Import `getList` from `@/lib/clickup` (it is already imported in some routes; add to the import list here).

**Step 2: Use it**

Replace `clientFolderId: null` with `clientFolderId,` in both delivery creates, and `clientFolderId: ""` with `clientFolderId: clientFolderId ?? ""` in all three link-record builders. For the add-on delivery, resolve `body.addonListId` the same way into `addonFolderId` (add-on may be a different client).

**Step 3: Repeat in `adhoc-send/route.ts`.**

**Step 4: Verify and commit**

```bash
npx tsc --noEmit
git add src/app/api/tasks/[taskId]/send/route.ts src/app/api/deliverable/adhoc-send/route.ts
git commit -m "feat(portal): persist clientFolderId on every new delivery"
```

---

### Task A5: Middleware and shell carve-outs

**Files:**
- Modify: `src/middleware.ts` (the "Skip auth" block, ~line 28)
- Modify: `src/components/layout/app-shell.tsx`

**Step 1: Middleware**

Add to the skip list, right after `pathname.startsWith("/api/cron") ||`:

```ts
    pathname.startsWith("/portal") ||
    pathname.startsWith("/api/portal") ||
```

**Step 2: AppShell**

```ts
  const isAuthPage = pathname.startsWith("/auth");
  const isClientPortal = pathname.startsWith("/portal");

  if (isAuthPage || isClientPortal) {
    return <>{children}</>;
  }
```

**Step 3: Commit**

```bash
git add src/middleware.ts src/components/layout/app-shell.tsx
git commit -m "feat(portal): public /portal and /api/portal routes bypass auth + app shell"
```

Security note for the implementer: every `/api/portal/*` handler MUST start by resolving the token to a `PortalAccess` row and MUST scope every query by that row's `clientFolderId`. Never accept a list ID or folder ID from the request as authority; the token is the only authority. Project IDs in URLs are only ever used as a filter within the token's folder.

---

## Phase B: Pure logic

### Task B1: Server-safe markdown renderer

`markdownToHtml` lives in a `"use client"` file. The portal renders on the server, so move the function to `src/lib` and re-export it from the editor.

**Files:**
- Create: `src/lib/markdown-html.ts`
- Modify: `src/components/shared/rich-text-editor.tsx:75-160`
- Test: `src/lib/__tests__/markdown-html.test.ts`

**Step 1: Test**

```ts
import { markdownToHtml } from "@/lib/markdown-html";

describe("markdownToHtml (lib)", () => {
  it("renders bold, links, bullets, headings", () => {
    const html = markdownToHtml("## Title\n- **A** [x](https://e.com)\n\nplain");
    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain("<ul><li><p><strong>A</strong> <a href=\"https://e.com\">x</a></p></li></ul>");
    expect(html).toContain("<p>plain</p>");
  });
});
```

**Step 2: Move the function body**

Cut `markdownToHtml` (lines 75-160 of the editor) into `src/lib/markdown-html.ts` verbatim, keeping the `collapseListItemGaps` import. In the editor replace it with:

```ts
import { markdownToHtml } from "@/lib/markdown-html";
export { markdownToHtml };
```

**Step 3: Run the whole suite** (`npx vitest run`) to prove nothing else broke (the bold/roundtrip tests import from the editor). Expect all green.

**Step 4: Commit**

```bash
git add src/lib/markdown-html.ts src/lib/__tests__/markdown-html.test.ts src/components/shared/rich-text-editor.tsx
git commit -m "refactor: move markdownToHtml to src/lib for server use"
```

---

### Task B2: Timeline grouping (pure)

Turns flat `Delivery` rows into the client-facing tree: project → deliverable → versions, with resends replacing originals and Slack mention tokens stripped.

**Files:**
- Create: `src/lib/portal-timeline.ts`
- Test: `src/lib/__tests__/portal-timeline.test.ts`

**Step 1: Test**

```ts
import {
  buildTimeline,
  stripMentions,
  type TimelineDelivery,
} from "@/lib/portal-timeline";

function d(over: Partial<TimelineDelivery>): TimelineDelivery {
  return {
    id: "x",
    projectListId: "L1",
    projectName: "Proj",
    deliverableType: "AV Script V1",
    department: "Pre-Pro",
    sentAt: new Date("2026-06-01T15:00:00Z"),
    emailContent: "Hi",
    slackContent: null,
    replacesDeliveryId: null,
    links: [],
    ...over,
  };
}

describe("stripMentions", () => {
  it("replaces slack + tiptap mention tokens with names, unknown → 'you'", () => {
    const names = { U1: "Whitney" };
    expect(stripMentions("Hey <@U1> and @[dana](U2)!", names)).toBe("Hey Whitney and you!");
  });
});

describe("buildTimeline", () => {
  it("groups project → deliverable → versions newest first", () => {
    const t = buildTimeline([
      d({ id: "a", deliverableType: "AV Script V1", sentAt: new Date("2026-06-01") }),
      d({ id: "b", deliverableType: "AV Script V2", sentAt: new Date("2026-06-05") }),
      d({ id: "c", projectListId: "L2", projectName: "Other", sentAt: new Date("2026-05-01") }),
    ], {});
    expect(t.projects.map((p) => p.listId)).toEqual(["L1", "L2"]); // most recent activity first
    expect(t.projects[0].deliverables.map((g) => g.latest.id)).toEqual(["b", "a"]);
  });

  it("a resend replaces its original", () => {
    const t = buildTimeline([
      d({ id: "orig", sentAt: new Date("2026-06-01") }),
      d({ id: "fix", replacesDeliveryId: "orig", sentAt: new Date("2026-06-02") }),
    ], {});
    const all = t.projects[0].deliverables.flatMap((g) => [g.latest, ...g.history]);
    expect(all.map((x) => x.id)).toEqual(["fix"]);
  });

  it("stacks the same deliverable family as history", () => {
    const t = buildTimeline([
      d({ id: "v1", deliverableType: "Edit V1", sentAt: new Date("2026-06-01") }),
      d({ id: "v2", deliverableType: "Edit V2", sentAt: new Date("2026-06-08") }),
      d({ id: "f", deliverableType: "Final Edit", sentAt: new Date("2026-06-15") }),
    ], {});
    const g = t.projects[0].deliverables;
    expect(g).toHaveLength(1);
    expect(g[0].family).toBe("Edit");
    expect(g[0].latest.id).toBe("f");
    expect(g[0].history.map((x) => x.id)).toEqual(["v2", "v1"]);
  });

  it("uses slack body with mentions stripped when there is no email body", () => {
    const t = buildTimeline([d({ emailContent: "", slackContent: "Hi <@U1>", })], { U1: "Sam" });
    expect(t.projects[0].deliverables[0].latest.body).toBe("Hi Sam");
  });
});
```

**Step 2: Run, expect failure. Step 3: Implement**

```ts
/**
 * Pure shaping of Delivery rows into the client portal's tree.
 * No I/O. Deadline/confirmation state is layered on later (portal-data.ts).
 */
import { extractFamilyName } from "@/lib/template-families";

export interface TimelineLink { url: string; label: string; variableName: string | null }

export interface TimelineDelivery {
  id: string;
  projectListId: string;
  projectName: string;
  deliverableType: string;
  department: string;
  sentAt: Date;
  emailContent: string;
  slackContent: string | null;
  replacesDeliveryId: string | null;
  links: TimelineLink[];
}

export interface TimelineEntry extends TimelineDelivery {
  /** Client-safe body (markdown) with mention tokens replaced by names. */
  body: string;
}

export interface DeliverableGroup {
  family: string;
  latest: TimelineEntry;
  history: TimelineEntry[]; // newest first, excludes latest
}

export interface TimelineProject {
  listId: string;
  name: string;
  lastActivity: Date;
  deliverables: DeliverableGroup[]; // most recent first
}

export interface Timeline { projects: TimelineProject[] }

/** Slack user id → display name. */
export type MentionNames = Record<string, string>;

export function stripMentions(md: string, names: MentionNames): string {
  return md
    .replace(/@\[[^\]]*\]\(([^)]+)\)/g, (_, id) => names[id] ?? "you")
    .replace(/<@([A-Z0-9]+)>/g, (_, id) => names[id] ?? "you");
}

export function buildTimeline(rows: TimelineDelivery[], names: MentionNames): Timeline {
  // 1. Resends replace originals.
  const replaced = new Set(rows.map((r) => r.replacesDeliveryId).filter(Boolean) as string[]);
  const live = rows.filter((r) => !replaced.has(r.id));

  // 2. Client-safe body.
  const entries: TimelineEntry[] = live.map((r) => ({
    ...r,
    body: stripMentions(r.emailContent || r.slackContent || "", names),
  }));

  // 3. Group by project, then by deliverable family.
  const byProject = new Map<string, TimelineEntry[]>();
  for (const e of entries) {
    const arr = byProject.get(e.projectListId) ?? [];
    arr.push(e);
    byProject.set(e.projectListId, arr);
  }

  const projects: TimelineProject[] = [];
  for (const [listId, list] of byProject) {
    const byFamily = new Map<string, TimelineEntry[]>();
    for (const e of list) {
      const fam = extractFamilyName(e.deliverableType);
      const arr = byFamily.get(fam) ?? [];
      arr.push(e);
      byFamily.set(fam, arr);
    }
    const deliverables: DeliverableGroup[] = [];
    for (const [family, versions] of byFamily) {
      versions.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
      deliverables.push({ family, latest: versions[0], history: versions.slice(1) });
    }
    deliverables.sort((a, b) => b.latest.sentAt.getTime() - a.latest.sentAt.getTime());
    projects.push({
      listId,
      name: list[0].projectName,
      lastActivity: deliverables[0].latest.sentAt,
      deliverables,
    });
  }
  projects.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  return { projects };
}
```

`extractFamilyName` already exists in `src/lib/template-families.ts:101` (verified 2026-09-03). Read it first and make sure it maps "Edit V1", "Edit V2", and "Final Edit" to the same family; if "Final Edit" is not handled, extend it there (with a test in the existing template-families test file, or create `src/lib/__tests__/template-families.test.ts`) rather than adding a second helper.

**Step 4: Run, expect pass. Step 5: Commit**

```bash
git add src/lib/portal-timeline.ts src/lib/__tests__/portal-timeline.test.ts src/lib/template-families.ts src/lib/__tests__/
git commit -m "feat(portal): pure timeline grouping with resend replacement + mention stripping"
```

---

### Task B3: Deadline resolver (pure)

Live ClickUp due date wins. Otherwise compute from send date + feedback window in business days. Never blank.

**Files:**
- Create: `src/lib/portal-deadline.ts`
- Test: `src/lib/__tests__/portal-deadline.test.ts`

**Step 1: Test**

```ts
import { resolveDeadline, deadlineState } from "@/lib/portal-deadline";

describe("resolveDeadline", () => {
  it("prefers the live ClickUp due date", () => {
    const r = resolveDeadline({ liveDueMs: 1_800_000_000_000, sentAt: new Date("2026-06-01T15:00:00Z"), feedbackWindows: "48 Hours" });
    expect(r).toEqual({ dueMs: 1_800_000_000_000, source: "clickup" });
  });

  it("computes send date + window business days (Eastern) when no task", () => {
    // Fri Jun 5 2026 3pm ET + 48 Hours (2 business days) → Tue Jun 9, EOD sentinel 08:00 UTC
    const r = resolveDeadline({ liveDueMs: null, sentAt: new Date("2026-06-05T19:00:00Z"), feedbackWindows: "48 Hours" });
    expect(r.source).toBe("computed");
    expect(new Date(r.dueMs).toISOString()).toBe("2026-06-09T08:00:00.000Z");
  });

  it("falls back to 2 business days when the window is unknown", () => {
    const r = resolveDeadline({ liveDueMs: null, sentAt: new Date("2026-06-01T15:00:00Z"), feedbackWindows: "" });
    expect(new Date(r.dueMs).toISOString()).toBe("2026-06-03T08:00:00.000Z");
  });
});

describe("deadlineState", () => {
  const due = Date.parse("2026-06-09T08:00:00Z");
  it("open before, due-today on the day, overdue after (Eastern days)", () => {
    expect(deadlineState(due, Date.parse("2026-06-08T12:00:00Z"))).toBe("open");
    expect(deadlineState(due, Date.parse("2026-06-09T20:00:00Z"))).toBe("due-today");
    expect(deadlineState(due, Date.parse("2026-06-10T12:00:00Z"))).toBe("overdue");
  });
});
```

**Step 2: Implement**

```ts
import { windowBusinessDays } from "@/lib/feedback-conflict";
import { addBusinessDays, holidaySet } from "@/lib/us-holidays";

const TZ = "America/New_York";
const DEFAULT_WINDOW_DAYS = 2;

/** "YYYY-MM-DD" of an instant in Eastern time. */
export function easternDateString(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** ClickUp's date-only sentinel: 08:00 UTC on that calendar date. */
export function dateOnlySentinelMs(date: string): number {
  return Date.parse(`${date}T08:00:00Z`);
}

export interface ResolvedDeadline { dueMs: number; source: "clickup" | "computed" }

export function resolveDeadline(input: {
  liveDueMs: number | null;
  sentAt: Date;
  feedbackWindows: string;
}): ResolvedDeadline {
  if (input.liveDueMs) return { dueMs: input.liveDueMs, source: "clickup" };
  const days = windowBusinessDays(input.feedbackWindows) ?? DEFAULT_WINDOW_DAYS;
  const start = easternDateString(input.sentAt.getTime());
  const year = Number(start.slice(0, 4));
  const due = addBusinessDays(start, days, holidaySet([year]));
  return { dueMs: dateOnlySentinelMs(due), source: "computed" };
}

export type DeadlineState = "open" | "due-today" | "overdue";

export function deadlineState(dueMs: number, nowMs: number): DeadlineState {
  const dueDay = easternDateString(dueMs);
  const today = easternDateString(nowMs);
  if (today < dueDay) return "open";
  if (today === dueDay) return "due-today";
  return "overdue";
}
```

`windowBusinessDays("48 Hours")` returns 2 (verified: hours divisible by 24 → days; "Flexible" and "12 Hours" return null, which is why the resolver defaults to 2).

**Step 3: Run, expect pass. Step 4: Commit**

```bash
git add src/lib/portal-deadline.ts src/lib/__tests__/portal-deadline.test.ts
git commit -m "feat(portal): deadline resolver (live ClickUp or computed business-day fallback)"
```

---

### Task B4: Internal channel ranking (pure)

The existing `rankChannels()` scores on client name only. The internal channel is named after the project (`callrail-wiggam-law-virtual-testimonial`), so rank on project name tokens with client name as a tiebreaker, and exclude Slack Connect channels.

**Files:**
- Create: `src/lib/project-channel-rank.ts`
- Test: `src/lib/__tests__/project-channel-rank.test.ts`

**Step 1: Test**

```ts
import { rankInternalChannels } from "@/lib/project-channel-rank";

const ch = (name: string, shared = false) => ({ id: name, name, isShared: shared, isMember: false });

describe("rankInternalChannels", () => {
  it("prefers the channel whose tokens cover the project name", () => {
    const r = rankInternalChannels("CallRail Wiggam Law Virtual Testimonial", "CallRail", [
      ch("callrail-marketcrest-virtual-testimonial"),
      ch("callrail-wiggam-law-virtual-testimonial"),
      ch("callrail-virtualtestimonials-consume", true),
    ]);
    expect(r[0].name).toBe("callrail-wiggam-law-virtual-testimonial");
    expect(r[0].confident).toBe(true);
    expect(r.find((c) => c.name.endsWith("-consume"))).toBeUndefined();
  });

  it("uses the client name to break generic ties", () => {
    const r = rankInternalChannels("PebblePost SKO NextGen TL", "PebblePost", [
      ch("consume-nextgen-tl"),
      ch("pebblepost-sko-nextgen-tl"),
    ]);
    expect(r[0].name).toBe("pebblepost-sko-nextgen-tl");
  });

  it("is not confident on a weak match", () => {
    const r = rankInternalChannels("Iterable Brand Campaign", "Iterable", [ch("random-general")]);
    expect(r.length === 0 || r[0].confident === false).toBe(true);
  });
});
```

**Step 2: Implement**

```ts
export interface InternalChannelCandidate {
  id: string;
  name: string;
  isShared: boolean;
  isMember: boolean;
}

export interface RankedInternalChannel extends InternalChannelCandidate {
  score: number;
  confident: boolean;
}

function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && t !== "consume");
}

const CONFIDENT_COVERAGE = 0.75; // share of channel tokens found in the project name
const MIN_HITS = 2;

export function rankInternalChannels(
  projectName: string,
  clientName: string,
  channels: InternalChannelCandidate[]
): RankedInternalChannel[] {
  const proj = new Set(tokens(projectName));
  const client = new Set(tokens(clientName));
  const out: RankedInternalChannel[] = [];
  for (const c of channels) {
    if (c.isShared) continue;
    const ct = tokens(c.name);
    if (ct.length === 0) continue;
    const hits = ct.filter((t) => proj.has(t)).length;
    if (hits < MIN_HITS) continue;
    const coverage = hits / ct.length;
    const clientBonus = ct.some((t) => client.has(t)) ? 0.1 : 0;
    const score = coverage + clientBonus + hits * 0.01;
    out.push({ ...c, score, confident: coverage >= CONFIDENT_COVERAGE && clientBonus > 0 });
  }
  return out.sort((a, b) => b.score - a.score || a.name.length - b.name.length);
}
```

**Step 3: Run, expect pass. Step 4: Commit**

```bash
git add src/lib/project-channel-rank.ts src/lib/__tests__/project-channel-rank.test.ts
git commit -m "feat(portal): rank internal Slack channels by project name"
```

---

## Phase C: Portal read path

### Task C1: Live ClickUp feedback state per project (cached)

For each project list, fetch its tasks, pull the Feedback Deadline tasks (Project Task Type 12), and expose `{deliverableType → {taskId, dueMs, isOpen}}`. Cache 5 minutes in `DashboardCache` (key `portal:fd:<listId>`) because ClickUp is slow and a client-level portal can span many lists.

**Files:**
- Create: `src/lib/portal-live.ts`

**Step 1: Implement**

```ts
import { prisma } from "@/lib/db";
import { getListTasks, extractCustomFieldValue } from "@/lib/clickup";
import { CUSTOM_FIELDS, PROJECT_TASK_TYPES } from "@/lib/custom-field-ids";

export interface LiveFeedbackTask {
  taskId: string;
  name: string;
  dueMs: number | null;
  /** true while the client still owes feedback (status is not complete/closed) */
  isOpen: boolean;
}

export type LiveFeedbackMap = Record<string /* deliverableType */, LiveFeedbackTask>;

const TTL_MS = 5 * 60_000;
const CLOSED = new Set(["complete", "closed", "done"]);

export async function getLiveFeedback(listId: string, force = false): Promise<LiveFeedbackMap> {
  const key = `portal:fd:${listId}`;
  if (!force) {
    try {
      const cached = await prisma.dashboardCache.findUnique({ where: { key } });
      if (cached && Date.now() - cached.updatedAt.getTime() < TTL_MS) {
        return cached.data as LiveFeedbackMap;
      }
    } catch { /* DB optional */ }
  }

  const { tasks } = await getListTasks(listId, true);
  const map: LiveFeedbackMap = {};
  for (const t of tasks) {
    const raw = t.custom_fields.find((f) => f.id === CUSTOM_FIELDS.PROJECT_TASK_TYPE)?.value;
    const label = extractCustomFieldValue(t.custom_fields, CUSTOM_FIELDS.PROJECT_TASK_TYPE);
    const isFd = label === "Feedback Deadline" || String(raw) === PROJECT_TASK_TYPES.FEEDBACK_DEADLINE;
    if (!isFd) continue;
    const type = extractCustomFieldValue(t.custom_fields, CUSTOM_FIELDS.DELIVERABLE_TYPE);
    if (!type) continue;
    const entry: LiveFeedbackTask = {
      taskId: t.id,
      name: t.name,
      dueMs: t.due_date ? Number(t.due_date) : null,
      isOpen: !CLOSED.has(t.status.status.toLowerCase()),
    };
    // Prefer an open task; among equals prefer the soonest due date.
    const prev = map[type];
    if (!prev || (entry.isOpen && !prev.isOpen) || (entry.isOpen === prev.isOpen && (entry.dueMs ?? Infinity) < (prev.dueMs ?? Infinity))) {
      map[type] = entry;
    }
  }

  try {
    await prisma.dashboardCache.upsert({ where: { key }, create: { key, data: map }, update: { data: map } });
  } catch { /* ignore */ }
  return map;
}

export async function invalidateLiveFeedback(listId: string): Promise<void> {
  try { await prisma.dashboardCache.delete({ where: { key: `portal:fd:${listId}` } }); } catch { /* ignore */ }
}
```

`extractCustomFieldValue` resolves dropdown orderindex/UUID to the option label via `type_config.options` (verified at `src/lib/clickup.ts:262-291`), so `type` above is the human label and matches `Delivery.deliverableType`.

**Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add src/lib/portal-live.ts
git commit -m "feat(portal): cached live feedback-deadline state per project list"
```

---

### Task C2: Portal data loader

One server function that turns a token into everything the pages need.

**Files:**
- Create: `src/lib/portal-data.ts`

**Step 1: Implement**

```ts
import { prisma } from "@/lib/db";
import { isValidPortalToken } from "@/lib/portal-token";
import { buildTimeline, type Timeline, type TimelineEntry, type MentionNames } from "@/lib/portal-timeline";
import { getLiveFeedback } from "@/lib/portal-live";
import { resolveDeadline, deadlineState, type DeadlineState } from "@/lib/portal-deadline";
import { formatFeedbackDeadline } from "@/lib/feedback-deadline";

export interface PortalAccessInfo { id: string; clientFolderId: string; clientName: string; token: string }

export async function resolveAccess(token: string): Promise<PortalAccessInfo | null> {
  if (!isValidPortalToken(token)) return null;
  const row = await prisma.portalAccess.findUnique({ where: { token } });
  if (!row || row.revokedAt) return null;
  return { id: row.id, clientFolderId: row.clientFolderId, clientName: row.clientName, token: row.token };
}

export interface FeedbackStatus {
  /** "awaiting" = client owes feedback; "confirmed" = client pressed the button
   *  (or ClickUp task is complete); "none" = nothing to do (older version). */
  kind: "awaiting" | "confirmed" | "none";
  dueMs: number;
  dueLabel: string;      // "Tue, Sep 9" (+ " 12:00 PM ET" when timed)
  source: "clickup" | "computed";
  state: DeadlineState;
  feedbackDeadlineTaskId: string | null;
  confirmedAt: Date | null;
  confirmedByName: string | null;
}

export interface PortalEntry extends TimelineEntry { feedback: FeedbackStatus | null }

export interface PortalData {
  access: PortalAccessInfo;
  timeline: Timeline;
  /** deliveryId → status, for the latest version of each deliverable */
  status: Record<string, FeedbackStatus>;
  actionItems: Array<{ entry: TimelineEntry; projectName: string; status: FeedbackStatus }>;
}

/** Newest non-undone confirmation per delivery. */
async function latestConfirmations(deliveryIds: string[]) {
  const rows = await prisma.feedbackConfirmation.findMany({
    where: { deliveryId: { in: deliveryIds } },
    orderBy: { confirmedAt: "desc" },
  });
  const out = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!out.has(r.deliveryId)) out.set(r.deliveryId, r);
  return out;
}

export async function loadPortal(access: PortalAccessInfo, onlyListId?: string): Promise<PortalData> {
  const rows = await prisma.delivery.findMany({
    where: { clientFolderId: access.clientFolderId, ...(onlyListId ? { projectListId: onlyListId } : {}) },
    orderBy: { sentAt: "desc" },
    include: { links: true },
  });

  // Names for mention stripping: we do not store Slack ids ↔ names on the
  // delivery, so v1 maps nothing and every mention renders as "you".
  const names: MentionNames = {};

  const timeline = buildTimeline(
    rows.map((r) => ({
      id: r.id,
      projectListId: r.projectListId ?? "",
      projectName: r.projectName,
      deliverableType: r.deliverableType,
      department: r.department,
      sentAt: r.sentAt,
      emailContent: r.emailContent,
      slackContent: r.slackContent,
      replacesDeliveryId: r.replacesDeliveryId,
      links: r.links.map((l) => ({ url: l.url, label: l.label, variableName: l.variableName })),
    })),
    names
  );

  const latestIds = timeline.projects.flatMap((p) => p.deliverables.map((g) => g.latest.id));
  const confirmations = await latestConfirmations(latestIds);
  const now = Date.now();
  const status: PortalData["status"] = {};
  const actionItems: PortalData["actionItems"] = [];

  for (const project of timeline.projects) {
    let live: Awaited<ReturnType<typeof getLiveFeedback>> = {};
    try { live = await getLiveFeedback(project.listId); } catch (err) { console.warn("live feedback failed", project.listId, err); }

    for (const group of project.deliverables) {
      const e = group.latest;
      const task = live[e.deliverableType] ?? null;
      const conf = confirmations.get(e.id);
      const confirmed = Boolean(conf && !conf.undoneAt) || Boolean(task && !task.isOpen);
      const { dueMs, source } = resolveDeadline({ liveDueMs: task?.dueMs ?? null, sentAt: e.sentAt, feedbackWindows: "" });
      const fmt = formatFeedbackDeadline(dueMs);
      const s: FeedbackStatus = {
        kind: confirmed ? "confirmed" : "awaiting",
        dueMs, source,
        dueLabel: fmt.timeLabel ? `${fmt.formattedDate}, ${fmt.timeLabel}` : fmt.formattedDate,
        state: deadlineState(dueMs, now),
        feedbackDeadlineTaskId: task?.taskId ?? null,
        confirmedAt: conf && !conf.undoneAt ? conf.confirmedAt : null,
        confirmedByName: conf && !conf.undoneAt ? conf.confirmedByName : null,
      };
      // Without a ClickUp task, stop nagging 30 days after send.
      if (!task && now - e.sentAt.getTime() > 30 * 86_400_000 && !confirmed) s.kind = "none";
      status[e.id] = s;
      if (s.kind === "awaiting") actionItems.push({ entry: e, projectName: project.name, status: s });
    }
  }
  actionItems.sort((a, b) => a.status.dueMs - b.status.dueMs);
  return { access, timeline, status, actionItems };
}
```

`feedbackWindows` is passed as `""` here because it is not stored on `Delivery`. Follow-up (recorded in the design doc): persist `feedbackWindows` on `Delivery` at send time so the computed fallback uses the real window. Add that column now if trivial: `feedbackWindows String?` on `Delivery`, written in the send route from `formState.feedbackWindows`, and pass `r.feedbackWindows ?? ""` above. Do it; it is three lines and a `db push`.

**Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add src/lib/portal-data.ts prisma/schema.prisma src/app/api/tasks/[taskId]/send/route.ts
git commit -m "feat(portal): data loader with live deadlines, confirmations, action items"
```

---

### Task C3: Portal layout and pages

**Files:**
- Create: `src/app/portal/layout.tsx`
- Create: `src/app/portal/[token]/page.tsx` (client dashboard)
- Create: `src/app/portal/[token]/[listId]/page.tsx` (project view)
- Create: `src/components/portal/portal-header.tsx`
- Create: `src/components/portal/action-items.tsx`
- Create: `src/components/portal/deliverable-card.tsx` (client component: version dropdown, links, body)
- Create: `src/components/portal/feedback-badge.tsx`

Design intent (see memory `feedback_beginner_friendly_mission`, `feedback_pills_vs_controls`): calm, spacious, one column on mobile, two on desktop. Pills are status only (Awaiting / Due today / Overdue / Confirmed). Buttons are rounded rectangles. Montserrat is already loaded on the root layout; use it. No internal jargon (no "share task", no ClickUp).

**Step 1: Layout**

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Client Portal | Consume Media",
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f6f7f8] text-neutral-900 font-[family-name:var(--font-montserrat)]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8">{children}</div>
    </div>
  );
}
```

**Step 2: Client dashboard page**

```tsx
import { notFound } from "next/navigation";
import { resolveAccess, loadPortal } from "@/lib/portal-data";
import { PortalHeader } from "@/components/portal/portal-header";
import { ActionItems } from "@/components/portal/action-items";
import { DeliverableCard } from "@/components/portal/deliverable-card";
import { recordView } from "@/lib/portal-views";

export const dynamic = "force-dynamic";

export default async function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await resolveAccess(token);
  if (!access) notFound();
  const data = await loadPortal(access);
  await recordView(access.id, null);

  return (
    <>
      <PortalHeader clientName={access.clientName} crumbs={[]} />
      <ActionItems token={token} items={data.actionItems} />
      <section className="mt-10 space-y-10">
        {data.timeline.projects.map((p) => (
          <div key={p.listId}>
            <h2 className="text-lg font-semibold mb-4">
              <a href={`/portal/${token}/${p.listId}`} className="hover:underline">{p.name}</a>
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {p.deliverables.map((g) => (
                <DeliverableCard key={g.latest.id} token={token} group={g} status={data.status[g.latest.id]} />
              ))}
            </div>
          </div>
        ))}
        {data.timeline.projects.length === 0 && (
          <p className="text-neutral-500">Nothing has been shared here yet. Deliverables will appear as soon as we send them.</p>
        )}
      </section>
    </>
  );
}
```

**Step 3: Project page** is the same with `loadPortal(access, listId)`, a breadcrumb `[{label: access.clientName, href: /portal/<token>}]`, and `notFound()` if the timeline has no project with that `listId` (this is the scoping guard: a list ID outside the client's folder yields zero rows).

**Step 4: `recordView`** in `src/lib/portal-views.ts`:

```ts
import { prisma } from "@/lib/db";
import { headers } from "next/headers";

export async function recordView(accessId: string, deliveryId: string | null) {
  try {
    const ua = (await headers()).get("user-agent") ?? null;
    if (ua && /bot|crawl|preview|slackbot|facebookexternalhit/i.test(ua)) return;
    await prisma.portalView.create({ data: { accessId, deliveryId, userAgent: ua?.slice(0, 200) } });
  } catch { /* never block rendering */ }
}
```

**Step 5: Components** (complete markup is left to the implementer within these constraints):

- `PortalHeader`: Consume Media wordmark (reuse `/favicon.svg` or the header logo asset from `src/components/shared/header.tsx`), client name as the title, breadcrumb, and a one-line hint: "Bookmark this page. Every deliverable we share lands here."
- `ActionItems` (server component with a client `ConfirmButton` child): heading "Needs your feedback", one row per item: deliverable type, project name, deadline pill (Due Tue, Sep 9 / Due today / Overdue), "Open review" link to the first link, and the `ConfirmButton`. Empty state: "You're all caught up."
- `DeliverableCard` (client): title = `group.latest.deliverableType`, sent date, `FeedbackBadge`, every link as a rounded-rectangle button labelled from `variableName` via this map (fall back to the stored `label`):
  ```ts
  const LINK_LABELS: Record<string, string> = {
    frameReviewLink: "Frame.io review",
    googleDeliverableLink: "Google Drive",
    loomReviewLink: "Loom walkthrough",
    animaticReviewLink: "Animatic",
    flexLink: "Review link",
  };
  ```
  Body rendered from `markdownToHtml(entry.body)` inside a `prose`-like container (write minimal CSS in `globals.css` under `.portal-body`). A "Show message" disclosure keeps cards short. If `group.history.length > 0`, a version `<select>` ("Latest: Final Edit", "Edit V2, sent Jun 8", ...) swaps the displayed entry; only the latest shows the feedback badge and confirm button.
- `FeedbackBadge`: pill; colors: awaiting = amber, due-today = orange, overdue = red, confirmed = green.
- `ConfirmButton` in `src/components/portal/confirm-button.tsx`: POSTs to `/api/portal/<token>/confirm` (Task D5). On success, swaps to "Feedback confirmed, thank you" with an "Undo" text link that opens a confirm dialog saying: "Undoing this reopens the feedback window and can delay the project timeline. Continue?".

**Step 6: Smoke test locally**

Create a temporary access row for a real client (pick one with several deliveries, e.g. Stack Overflow):

```bash
node -e 'require("dotenv").config({path:".env.local"});const {Client}=require("pg");const c=new Client({connectionString:process.env.POSTGRES_URL});c.connect().then(()=>c.query(`select "clientFolderId","clientName",count(*) from "Delivery" where "clientName"=\x27Stack Overflow\x27 group by 1,2`)).then(r=>{console.log(r.rows);c.end()})'
```
Then insert via a one-off script using `generatePortalToken()` (or wait for the admin UI in E1). `npm run dev`, open `/portal/<token>`, check: projects listed, versions stacked, links open, badges show, no internal nav rendered.

**Step 7: Commit**

```bash
git add src/app/portal src/components/portal src/lib/portal-views.ts src/app/globals.css
git commit -m "feat(portal): client portal pages (dashboard, project view, deliverable cards)"
```

---

## Phase D: Confirmation

### Task D1: ClickUp comment helper with PM group mention

**Files:**
- Modify: `src/lib/clickup.ts` (append)
- Modify: `src/lib/custom-field-ids.ts` (append)

**Step 1: Constants**

```ts
// ClickUp user group used for "tag the PM team" on portal confirmations.
export const USER_GROUPS = {
  PROJECT_MANAGEMENT: "a69e7430-c3bd-45d7-95da-4ca97ebe1015",
} as const;

// Fallback mentions if the group lookup fails (Michael, Sadjr).
export const PM_FALLBACK_USER_IDS = [50799924, 106025619] as const;
```

**Step 2: Helpers**

```ts
export async function getUserGroupMembers(groupId: string): Promise<Array<{ id: number; username: string }>> {
  const teamId = process.env.CLICKUP_WORKSPACE_ID;
  const res = await clickupFetch<{ groups: Array<{ id: string; members: Array<{ id: number; username: string }> }> }>(
    `/group?team_id=${teamId}`
  );
  return res.groups.find((g) => g.id === groupId)?.members ?? [];
}

/**
 * Post a comment that @mentions users. ClickUp's v2 API accepts a structured
 * `comment` array; a `{type:"tag", user:{id}}` chunk renders as a mention.
 * `group_assignee` additionally assigns the comment to a user group.
 */
export async function createTaskComment(
  taskId: string,
  opts: { text: string; mentionUserIds?: number[]; groupAssignee?: string; notifyAll?: boolean }
): Promise<{ id: string }> {
  const chunks: Array<Record<string, unknown>> = [];
  for (const id of opts.mentionUserIds ?? []) {
    chunks.push({ type: "tag", user: { id } });
    chunks.push({ text: " " });
  }
  chunks.push({ text: opts.text });
  return clickupFetch<{ id: string }>(`/task/${taskId}/comment`, {
    method: "POST",
    body: JSON.stringify({
      comment: chunks,
      ...(opts.groupAssignee ? { group_assignee: opts.groupAssignee } : {}),
      notify_all: opts.notifyAll ?? true,
    }),
  });
}
```

**Step 3: Validate live against a scratch task (mandatory; the mention format is undocumented)**

Create a throwaway task in the Templates space or a test list you own (ask Michael for a list ID if none is obvious; do NOT use a client project). Then:

```bash
npx tsx --env-file=.env.local -e '
import { createTaskComment, getUserGroupMembers } from "./src/lib/clickup";
import { USER_GROUPS } from "./src/lib/custom-field-ids";
(async () => {
  const members = await getUserGroupMembers(USER_GROUPS.PROJECT_MANAGEMENT);
  console.log(members);
  const r = await createTaskComment("<SCRATCH_TASK_ID>", { text: "portal mention test", mentionUserIds: members.map(m => m.id), groupAssignee: USER_GROUPS.PROJECT_MANAGEMENT });
  console.log(r);
})();'
```
Open the task in ClickUp: both people must appear as blue mention chips. If the structured array is rejected (400), fall back to `comment_text` with `@` + username per member and re-verify; record whichever worked in a code comment. Delete the scratch comment/task afterwards.

**Step 4: Commit**

```bash
git add src/lib/clickup.ts src/lib/custom-field-ids.ts
git commit -m "feat(clickup): task comments with user mentions + PM user group lookup"
```

---

### Task D2: Slack channel post helper

**Files:**
- Modify: `src/lib/slack-dm.ts` (append; reuses the private `slackCall`)

**Step 1: Implement**

```ts
/**
 * Post to a channel. Joins first if the bot is not a member (public channels
 * only; a private channel needs a manual invite and returns not_in_channel).
 * Returns the message ts on success, null on failure (never throws).
 */
export async function postChannelMessage(
  channelId: string,
  text: string,
  opts: { threadTs?: string } = {}
): Promise<string | null> {
  const body: Record<string, unknown> = { channel: channelId, text, unfurl_links: false };
  if (opts.threadTs) body.thread_ts = opts.threadTs;
  try {
    const r = await slackCall<SlackResp & { ts?: string }>("chat.postMessage", body);
    return r.ts ?? null;
  } catch (err) {
    if (String(err).includes("not_in_channel")) {
      try {
        await slackCall("conversations.join", { channel: channelId });
        const r = await slackCall<SlackResp & { ts?: string }>("chat.postMessage", body);
        return r.ts ?? null;
      } catch (err2) {
        console.warn("postChannelMessage retry failed", channelId, err2);
        return null;
      }
    }
    console.warn("postChannelMessage failed", channelId, err);
    return null;
  }
}
```

**Step 2: Verify against the test channel**

```bash
npx tsx --env-file=.env.local -e 'import {postChannelMessage} from "./src/lib/slack-dm"; postChannelMessage(process.env.TEST_SLACK_CHANNEL_ID!, "portal post test").then(console.log)'
```
Expected: a ts string and a message in #delivery-testing.

**Step 3: Commit**

```bash
git add src/lib/slack-dm.ts
git commit -m "feat(slack): postChannelMessage with auto-join"
```

---

### Task D3: Project channel resolution (crawl + DB)

**Files:**
- Create: `src/lib/project-channel.ts`

**Step 1: Implement**

```ts
import { prisma } from "@/lib/db";
import { listVisibleChannels } from "@/lib/slack-audit";
import { rankInternalChannels, type RankedInternalChannel } from "@/lib/project-channel-rank";

export interface ProjectChannelResolution {
  channelId: string | null;
  channelName: string | null;
  source: "confirmed" | "auto" | "none";
  suggestions: RankedInternalChannel[];
}

/**
 * Confirmed mapping wins. Otherwise crawl Slack, rank, and auto-select only a
 * confident top match (persisting it as autoMatched so a PM can see/override).
 */
export async function resolveProjectChannel(
  projectListId: string,
  projectName: string,
  clientName: string
): Promise<ProjectChannelResolution> {
  const existing = await prisma.projectChannel.findUnique({ where: { projectListId } });
  if (existing) {
    return { channelId: existing.channelId, channelName: existing.channelName, source: "confirmed", suggestions: [] };
  }
  const channels = await listVisibleChannels();
  const ranked = rankInternalChannels(
    projectName,
    clientName,
    channels.map((c) => ({ id: c.id, name: c.name, isShared: Boolean(c.isShared), isMember: c.isMember }))
  ).slice(0, 5);
  const top = ranked[0];
  if (top?.confident) {
    await prisma.projectChannel.create({
      data: { projectListId, channelId: top.id, channelName: top.name, autoMatched: true, confirmedBy: "auto-match" },
    });
    return { channelId: top.id, channelName: top.name, source: "auto", suggestions: ranked };
  }
  return { channelId: null, channelName: null, source: "none", suggestions: ranked };
}
```

`VisibleChannel` in `src/lib/slack-audit.ts:74-79` has no shared flag (verified 2026-09-03). Add `isShared: boolean` to the interface and set it in `listVisibleChannels()` from `Boolean(c.is_ext_shared || c.is_shared)`. Slack Connect client channels are the ones we must never post to, so this flag is load-bearing.

**Step 2: Dry-run against three known lists** (no writes: comment out the `create` temporarily or add a `dryRun` flag) and confirm CallRail Wiggam Law → `callrail-wiggam-law-virtual-testimonial`, PebblePost SKO → `pebblepost-sko-nextgen-tl`, Iterable Brand Campaign → none.

**Step 3: Commit**

```bash
git add src/lib/project-channel.ts src/lib/slack-audit.ts
git commit -m "feat(portal): resolve internal project Slack channel (confirmed → auto-match → suggestions)"
```

---

### Task D4: Admin API + UI for project channel mapping

**Files:**
- Create: `src/app/api/settings/project-channel/route.ts` (GET `?listId=` returns resolution; PUT `{listId, channelId, channelName}` confirms; DELETE `?listId=` clears)
- Modify: `src/app/project-setup/page.tsx` (or the component it renders for each project row): add a "Internal channel" cell showing the confirmed/auto channel name with a "Change" popover listing the top suggestions plus a search box over `listVisibleChannels()` (reuse `/api/slack/channels`).

Keep this small: the wizard pattern already exists in Project Setup (`docs/plans/2026-08-05-project-setup-channel-autoconfig.md`); mirror its popover, not its 3-step flow. Confirming writes `ProjectChannel` with `confirmedBy = session email`, `autoMatched = false`, and calls `joinChannel(channelId)`.

Commit: `feat(portal): admin mapping for internal project Slack channel`.

---

### Task D5: Confirm and undo routes

**Files:**
- Create: `src/lib/portal-confirm.ts` (the orchestration, so it is testable with mocks and reusable by undo)
- Create: `src/app/api/portal/[token]/confirm/route.ts`
- Create: `src/app/api/portal/[token]/undo/route.ts`
- Test: `src/lib/__tests__/portal-confirm-messages.test.ts` (pure message builders only)

**Step 1: Pure message builders + test**

```ts
// src/lib/portal-confirm-messages.ts
export interface ConfirmContext {
  clientName: string;
  projectName: string;
  deliverableType: string;
  confirmedByName: string | null;
  portalUrl: string;
  deadlineLabel: string;
}

export function slackConfirmText(c: ConfirmContext): string {
  const who = c.confirmedByName ? ` (${c.confirmedByName})` : "";
  return `:white_check_mark: *${c.clientName}* confirmed all feedback is in on *${c.deliverableType}* for *${c.projectName}*${who}. Deadline was ${c.deadlineLabel}. <${c.portalUrl}|Open client portal>`;
}

export function slackUndoText(c: ConfirmContext): string {
  return `:leftwards_arrow_with_hook: *${c.clientName}* reopened feedback on *${c.deliverableType}* for *${c.projectName}*. The feedback window is extended. <${c.portalUrl}|Open client portal>`;
}

export function clickupConfirmComment(c: ConfirmContext): string {
  const who = c.confirmedByName ? ` by ${c.confirmedByName}` : "";
  return `Client confirmed all feedback is in via the client portal${who}. Marking this feedback deadline complete.`;
}

export function clickupUndoComment(): string {
  return "Client reopened feedback via the client portal. Reopening this feedback deadline.";
}
```

Test each builder produces the expected strings for one fixture (assert `toContain` on the key phrases and the link).

**Step 2: Orchestration**

```ts
// src/lib/portal-confirm.ts
import { prisma } from "@/lib/db";
import { updateTaskStatus, createTaskComment, getUserGroupMembers } from "@/lib/clickup";
import { USER_GROUPS, PM_FALLBACK_USER_IDS } from "@/lib/custom-field-ids";
import { postChannelMessage } from "@/lib/slack-dm";
import { resolveProjectChannel } from "@/lib/project-channel";
import { invalidateLiveFeedback } from "@/lib/portal-live";
import { slackConfirmText, slackUndoText, clickupConfirmComment, clickupUndoComment, type ConfirmContext } from "@/lib/portal-confirm-messages";

const FD_OPEN_STATUS = "waiting on client";

async function pmMentionIds(): Promise<number[]> {
  try {
    const m = await getUserGroupMembers(USER_GROUPS.PROJECT_MANAGEMENT);
    if (m.length) return m.map((x) => x.id);
  } catch { /* fall through */ }
  return [...PM_FALLBACK_USER_IDS];
}

export async function confirmFeedback(input: {
  accessId: string; clientName: string; clientFolderId: string;
  deliveryId: string; confirmedByName: string | null;
  feedbackDeadlineTaskId: string | null; deadlineLabel: string; portalUrl: string;
}) {
  const delivery = await prisma.delivery.findFirst({ where: { id: input.deliveryId, clientFolderId: input.clientFolderId } });
  if (!delivery) throw new Error("Delivery not in this portal");

  const ctx: ConfirmContext = {
    clientName: input.clientName, projectName: delivery.projectName,
    deliverableType: delivery.deliverableType, confirmedByName: input.confirmedByName,
    portalUrl: input.portalUrl, deadlineLabel: input.deadlineLabel,
  };

  // 1. ClickUp (best effort, but do it before the DB row so a hard failure is visible)
  let clickupOk = false;
  if (input.feedbackDeadlineTaskId) {
    try {
      await updateTaskStatus(input.feedbackDeadlineTaskId, "complete");
      await createTaskComment(input.feedbackDeadlineTaskId, {
        text: clickupConfirmComment(ctx), mentionUserIds: await pmMentionIds(), groupAssignee: USER_GROUPS.PROJECT_MANAGEMENT,
      });
      clickupOk = true;
    } catch (err) { console.error("ClickUp confirm side-effect failed", err); }
    if (delivery.projectListId) await invalidateLiveFeedback(delivery.projectListId);
  }

  // 2. Slack (best effort)
  let slackChannelId: string | null = null; let slackMessageTs: string | null = null;
  if (delivery.projectListId) {
    const ch = await resolveProjectChannel(delivery.projectListId, delivery.projectName, input.clientName);
    if (ch.channelId) { slackChannelId = ch.channelId; slackMessageTs = await postChannelMessage(ch.channelId, slackConfirmText(ctx)); }
    else console.warn("No internal channel mapped for", delivery.projectListId, "suggestions:", ch.suggestions.map((s) => s.name));
  }

  // 3. Record
  const row = await prisma.feedbackConfirmation.create({
    data: {
      deliveryId: delivery.id, projectListId: delivery.projectListId ?? "", deliverableType: delivery.deliverableType,
      feedbackDeadlineTaskId: input.feedbackDeadlineTaskId, confirmedByName: input.confirmedByName,
      slackChannelId, slackMessageTs,
    },
  });
  return { id: row.id, clickupOk, slackOk: Boolean(slackMessageTs) };
}

export async function undoFeedback(input: { clientFolderId: string; clientName: string; deliveryId: string; portalUrl: string }) {
  const conf = await prisma.feedbackConfirmation.findFirst({
    where: { deliveryId: input.deliveryId, undoneAt: null, delivery: { clientFolderId: input.clientFolderId } },
    orderBy: { confirmedAt: "desc" }, include: { delivery: true },
  });
  if (!conf) throw new Error("Nothing to undo");
  const ctx: ConfirmContext = {
    clientName: input.clientName, projectName: conf.delivery.projectName, deliverableType: conf.deliverableType,
    confirmedByName: conf.confirmedByName, portalUrl: input.portalUrl, deadlineLabel: "",
  };
  if (conf.feedbackDeadlineTaskId) {
    try {
      await updateTaskStatus(conf.feedbackDeadlineTaskId, FD_OPEN_STATUS);
      await createTaskComment(conf.feedbackDeadlineTaskId, { text: clickupUndoComment(), mentionUserIds: await pmMentionIds() });
    } catch (err) { console.error("ClickUp undo side-effect failed", err); }
    if (conf.projectListId) await invalidateLiveFeedback(conf.projectListId);
  }
  if (conf.slackChannelId) await postChannelMessage(conf.slackChannelId, slackUndoText(ctx), { threadTs: conf.slackMessageTs ?? undefined });
  await prisma.feedbackConfirmation.update({ where: { id: conf.id }, data: { undoneAt: new Date() } });
}
```

Verify `"waiting on client"` is the exact open status name on Feedback Deadline tasks (seen in the 2026-09-03 census; confirm on one live task with `getTask`). If a list uses a different status set, `updateTaskStatus` throws; that is logged, not fatal.

**Step 3: Routes**

```ts
// src/app/api/portal/[token]/confirm/route.ts
import { NextResponse } from "next/server";
import { resolveAccess, loadPortal } from "@/lib/portal-data";
import { confirmFeedback } from "@/lib/portal-confirm";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await resolveAccess(token);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { deliveryId?: string; name?: string };
  if (!body.deliveryId) return NextResponse.json({ error: "deliveryId required" }, { status: 400 });

  // Recompute status server-side; never trust the client's idea of the task id.
  const data = await loadPortal(access);
  const status = data.status[body.deliveryId];
  if (!status || status.kind !== "awaiting") return NextResponse.json({ error: "Nothing awaiting feedback" }, { status: 409 });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const result = await confirmFeedback({
    accessId: access.id, clientName: access.clientName, clientFolderId: access.clientFolderId,
    deliveryId: body.deliveryId, confirmedByName: body.name?.trim().slice(0, 80) || null,
    feedbackDeadlineTaskId: status.feedbackDeadlineTaskId, deadlineLabel: status.dueLabel,
    portalUrl: `${base}/portal/${token}`,
  });
  return NextResponse.json({ ok: true, ...result });
}
```

`undo/route.ts` mirrors it, calling `undoFeedback`. Both routes rate-limit lightly: reject if the same delivery had a confirmation or undo in the last 10 seconds (query the latest row) to stop double-clicks.

**Step 4: Live test on a real but low-stakes deliverable**

Use the test client link from C3. Press confirm on an item whose Feedback Deadline task you can safely reopen (coordinate with Michael on which one, or use a project in the `Upcoming Projects` area). Verify: ClickUp task complete + comment with mention chips; Slack message in the internal channel; portal shows Confirmed. Press Undo: task back to waiting on client, follow-up in the Slack thread, portal shows Awaiting.

**Step 5: Commit**

```bash
git add src/lib/portal-confirm.ts src/lib/portal-confirm-messages.ts src/lib/__tests__/portal-confirm-messages.test.ts src/app/api/portal
git commit -m "feat(portal): confirm / undo feedback with ClickUp + Slack side effects"
```

---

## Phase E: Internal side

### Task E1: Portal link management in Settings

**Files:**
- Create: `src/app/api/settings/portal-access/route.ts` (GET all active rows joined with client names from `/api/projects` data; POST `{clientFolderId, clientName}` creates a token; DELETE `?id=` revokes)
- Create: `src/components/settings/client-portal-section.tsx`
- Modify: `src/app/settings/page.tsx` (add the section)

Behaviour: a table of every client folder (source: `GET /api/projects`, which already groups lists by folder), with columns Client, Portal link (masked as `…/portal/abcd…` with Copy button), Created, Last viewed (from `PortalView`), and actions Create / Rotate (revoke + create, confirm dialog) / Copy project link (opens a small picker of that client's lists and copies `/portal/<token>/<listId>`). Auth: this is under `/api/settings`, already behind the middleware.

Commit: `feat(portal): settings section to create, copy, rotate client portal links`.

---

### Task E2: Feedback state in the Sent view

**Files:**
- Modify: `src/app/api/deliveries/route.ts` (the list endpoint used by the Sent table: include `confirmations` latest row and a `viewCount`)
- Modify: `src/components/dashboard/sent-table.tsx` (new column "Client feedback": Awaiting / Confirmed <date> by <name> / Reopened; and an eye icon with the view count when > 0)
- Modify: the sent-detail dialog to show the same plus the portal deep link for that project.

Commit: `feat(portal): show client confirmation + views in Sent`.

---

## Phase F: Reminders, overdue nudges, reach-out

### Task F1: Reminder + overdue cron

**Files:**
- Create: `src/lib/portal-reminders.ts` (pure selection: given action items with `dueMs` and `nowMs`, return `{remindTomorrow[], remindToday[], overdue[]}` using `easternDateString` and `addBusinessDays`)
- Test: `src/lib/__tests__/portal-reminders.test.ts`
- Create: `src/app/api/cron/portal-reminders/route.ts`
- Modify: `vercel.json` (add `{ "path": "/api/cron/portal-reminders", "schedule": "0 13 * * 1-5" }`, 9:00 ET weekdays; adjust in winter if exact 9am matters)

Cron body: iterate all active `PortalAccess` rows → `loadPortal` → classify. For each item:
- Tomorrow-is-due or due-today: POST to `N8N_PORTAL_REMINDER_WEBHOOK_URL` with `{ to: primaryEmail, cc: ccEmails, subject, html, portal_url }`. Primary + CCs come from the latest `Delivery` row for that deliverable (`primaryEmail`, `ccEmails`), which matches "address to the primary, copy all contacts". Slack-only deliveries (empty `primaryEmail`) get a Slack post to the *delivery* channel instead? No: Michael said client-facing Slack stays as-is in phase 1. For Slack-only clients, skip the email and only do the internal nudge.
- Overdue (first business day after due, and every 2 business days after): `postChannelMessage` to the internal project channel: ":hourglass: <client> has not confirmed feedback on <type> (<project>). Due <label>. <portal link>".
- Idempotency: add `PortalReminder { id, deliveryId, kind ("tomorrow"|"today"|"overdue"), sentAt }` to the schema; skip if a row exists for `(deliveryId, kind, easternDate(now))`.

n8n: create a tiny workflow "Portal reminder email" (Webhook → Gmail send from the delivery's `senderEmail`, or from `pre-production@` etc. via `DEPARTMENT_CC_EMAILS`). Use the n8n MCP tools to build it, and set `N8N_PORTAL_REMINDER_WEBHOOK_URL` in Vercel with `printf '%s' "<url>" | vercel env add N8N_PORTAL_REMINDER_WEBHOOK_URL production` (never `echo`, see memory `feedback_vercel_env_no_echo`). Until the URL exists the cron logs and skips, same pattern as the send route.

Commit: `feat(portal): deadline reminders (email) + overdue nudges (internal Slack)`.

---

### Task F2: Reach-out form

**Files:**
- Create: `src/components/portal/reach-out.tsx` (client: chat-styled panel at the bottom of both portal pages; fields: name, message; optional project context from the page)
- Create: `src/app/api/portal/[token]/message/route.ts`

Route: resolve access; if the page had a project, `resolveProjectChannel` and `postChannelMessage` there with ":speech_balloon: Message from <client> via the client portal (<name>):\n> <message>\n<portal link>"; if no channel is mapped (client-level page or unmapped project), fall back to `sendSlackDM` to the sender of the client's most recent delivery, and additionally to `pre-production@consume-media.com` via the reminder webhook if configured. Rate limit: 5 per token per hour (count `PortalMessage` rows; add that small table `{id, accessId, projectListId?, name, message, createdAt}` so messages are never lost even if Slack fails).

Commit: `feat(portal): reach-out form posting to the internal project channel`.

---

## Phase G: Ship

### Task G1: Docs, memory, verification, push

1. Update `CLAUDE.md`: new section "Client Portal" covering the token model, `/portal` + `/api/portal` public carve-out and the scoping rule, the four tables, the live-deadline cache key, the confirmation side effects, and the reminder cron + env var. Add `src/lib/portal-*.ts` and `src/lib/project-channel*.ts` to the Important Files table.
2. Update `docs/plans/2026-09-03-client-portal-design.md` status line to "implemented on branch client-portal, pending live verification" and record the access-model refinement (one token per client, project deep links).
3. Verify:
   ```bash
   npx tsc --noEmit && npx vitest run && npx next build
   ```
   All three must pass. Fix anything `next build` reports (prerender errors do not show in tsc).
4. Push once and open the PR:
   ```bash
   git push -u origin client-portal
   gh pr create --title "Client portal" --body "$(cat <<'EOF'
   One bookmarkable link per client showing every deliverable, review links, live feedback deadlines, and an "All feedback is in" button that completes the ClickUp feedback task, tags the PM group, and posts to the internal project channel.

   Design: docs/plans/2026-09-03-client-portal-design.md
   Plan: docs/plans/2026-09-03-client-portal.md

   Live verification checklist for Michael:
   - Settings → Client Portal → create a link for one client, open it
   - Confirm feedback on a safe deliverable; check ClickUp task, comment mentions, internal Slack
   - Undo; check task reopened + Slack thread reply
   - Project Setup → internal channel mapping shows for that project

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   https://claude.ai/code/session_01TFi9LwXd6Rc61nh2WYEn7g
   EOF
   )"
   ```
   This PR includes schema changes, so per memory `feedback_merge_no_migration_prs`, do not merge it yourself. Hand the preview URL to Michael.
5. Save a memory note (`project_client_portal.md`) with: status, the token model, the "never post to the weekly-status channel" rule, the PM group ID, and the pending items (feedback window persistence, short notification message phase 2, editable reminder copy).

---

## Backlog (explicitly out of this plan)

- Phase 2: replace the full delivery email with the short "added to your portal" notification; editable template for it.
- Mention name resolution for Slack-delivered bodies (store contact id→name at send time).
- Bulk audit of share tasks closed outside the portal.
- Per-client branding (logo, colour).
- Client-facing reminder copy editable from Templates.
