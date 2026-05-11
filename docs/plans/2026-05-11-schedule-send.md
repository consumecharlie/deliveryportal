# Schedule Send Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let a team member schedule any delivery to auto-send at a future time, anchored to Eastern; with a `/scheduled` page, an in-form picker, T-30 reminder DMs, and bounce-to-Drafts behavior when incomplete at fire time.

**Architecture:** Extend the existing `Draft` Prisma model with `scheduledFor`/`scheduleStatus`/`lastReminderAt`. A new `/api/cron/scheduled-sends` route runs every minute on Vercel Cron, does three passes (reminder / fire / stale), and triggers the existing send pipeline for due-and-complete items via an internal call. Incomplete items at fire time get cleared and a Slack DM. New `/scheduled` page is a sorted list with edit/cancel actions; the delivery form's send bar gets a `SplitButton` with a "Schedule send..." dropdown opening a preset+picker popover.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma + Neon Postgres (via `@prisma/adapter-pg`), Vercel Cron, Slack Web API (existing bot), TanStack Query, Shadcn/ui (`Popover`, `DropdownMenu`, `AlertDialog`), Vitest, sonner toasts, lucide-react icons.

**Design doc:** `docs/plans/2026-05-11-schedule-send-design.md`

**Conventions to follow:**
- Prisma client: `import { prisma } from "@/lib/db"`; wrap reads/writes in try/catch.
- Session: `import { getSessionUserEmail } from "@/lib/get-session-user"`.
- Tests: `src/lib/__tests__/*.test.ts`, run with `npm test` (Vitest, node env, `@/` alias).
- All commits go to `main`; `git push` after every commit (per `feedback_always_push.md`).
- Per `feedback_confirm_before_pushing.md`: each task's commits are pre-authorized via this plan; new design decisions surfaced mid-task require asking the user first.
- Brand-asset icons live in `/Users/charlie/Claude/brand-assets/Icons/`; copy into `public/icons/` with lowercase-dash filenames if needed. `on-button.svg` is already copied.

**Manual prerequisite (not blocking initial tasks):**
Before Task 13 (the cron's Slack-DM fan-in starts firing), the Slack bot needs two new scopes added in the Slack app config and re-installed in the workspace: `users:read.email`, `im:write`. Already present (don't re-add): `chat:write`. The implementation plan tasks themselves don't depend on this; the cron will gracefully log + skip DMs if the scopes are missing. Track this as a follow-up.

---

## Task 1: Extend `Draft` Prisma model with schedule columns

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add the three columns and index**

In `prisma/schema.prisma`, update the `Draft` model. After the existing `updatedAt DateTime @updatedAt` line, add:

```prisma
  scheduledFor    DateTime?
  scheduleStatus  String?
  lastReminderAt  DateTime?
```

Then add an index for the cron's `scheduledFor` queries. Replace the existing `@@index([taskId])` line with both:

```prisma
  @@index([taskId])
  @@index([scheduledFor])
```

**Step 2: Push the schema and regenerate the client**

Run from the repo root (the prisma config now correctly loads `.env.local`):
```bash
npx prisma db push
npx prisma generate
```
Expected: `db push` reports the new columns added; `generate` succeeds.

**Step 3: Commit and push**

```bash
git add prisma/schema.prisma
git commit -m "Add schedule columns to Draft model"
git push
```

---

## Task 2: `isFormComplete(formData)` helper (TDD)

**Files:**
- Create: `src/lib/schedule-send.ts`
- Create: `src/lib/__tests__/schedule-send-is-complete.test.ts`

> **Discovery first.** Before writing the test, read `src/app/api/tasks/[taskId]/send/route.ts` and identify the validation it does on the form data before calling n8n. The required fields commonly include: primary recipient email, delivery type, sender, at least one link (when the template uses link variables), subject line, email content, and (if Slack mode) a Slack channel. List these in the test and helper.

**Step 1: Write the failing test**

Create `src/lib/__tests__/schedule-send-is-complete.test.ts` with cases like:

```typescript
import { describe, it, expect } from "vitest";
import { isFormComplete, missingFields } from "../schedule-send";

const completeForm = {
  primaryEmail: "client@x.com",
  ccEmails: "",
  deliverableType: "Final cut",
  senderEmail: "sender@consume-media.com",
  emailSubject: "Your deliverables",
  emailContent: "<p>Hi there</p>",
  slackChannel: "",
  links: [{ url: "https://example.com/foo", label: "Final" }],
};

describe("isFormComplete", () => {
  it("returns true for a complete form", () => {
    expect(isFormComplete(completeForm)).toBe(true);
  });

  it("returns false when primary email is missing", () => {
    expect(isFormComplete({ ...completeForm, primaryEmail: "" })).toBe(false);
  });

  it("returns false when there are zero links", () => {
    expect(isFormComplete({ ...completeForm, links: [] })).toBe(false);
  });

  it("returns false when a link has an empty url", () => {
    expect(
      isFormComplete({
        ...completeForm,
        links: [{ url: "", label: "Final" }],
      })
    ).toBe(false);
  });
});

describe("missingFields", () => {
  it("lists every missing required field by label", () => {
    expect(
      missingFields({ ...completeForm, primaryEmail: "", emailSubject: "" })
    ).toEqual(["Recipient email", "Subject line"]);
  });

  it("returns empty array for a complete form", () => {
    expect(missingFields(completeForm)).toEqual([]);
  });
});
```

Adjust the field set to match whatever the existing send route actually validates.

**Step 2: Run the test to verify it fails**

```bash
npm test -- src/lib/__tests__/schedule-send-is-complete.test.ts
```
Expected: FAIL with module-not-found for `../schedule-send`.

**Step 3: Implement the helper**

Create `src/lib/schedule-send.ts`:

```typescript
export interface ScheduleFormData {
  primaryEmail?: string;
  ccEmails?: string;
  deliverableType?: string;
  senderEmail?: string;
  emailSubject?: string;
  emailContent?: string;
  slackChannel?: string;
  links?: Array<{ url?: string; label?: string }>;
  // ...add any other fields the send route validates
}

const REQUIRED_FIELDS: Array<{
  key: keyof ScheduleFormData;
  label: string;
  validate: (formData: ScheduleFormData) => boolean;
}> = [
  { key: "primaryEmail", label: "Recipient email", validate: (f) => Boolean(f.primaryEmail?.trim()) },
  { key: "deliverableType", label: "Deliverable type", validate: (f) => Boolean(f.deliverableType?.trim()) },
  { key: "senderEmail", label: "Sender", validate: (f) => Boolean(f.senderEmail?.trim()) },
  { key: "emailSubject", label: "Subject line", validate: (f) => Boolean(f.emailSubject?.trim()) },
  { key: "emailContent", label: "Email content", validate: (f) => Boolean(f.emailContent?.trim()) },
  { key: "links", label: "Delivery link", validate: (f) => Boolean(f.links?.length && f.links.every((l) => l.url?.trim())) },
];

export function isFormComplete(formData: ScheduleFormData): boolean {
  return REQUIRED_FIELDS.every((f) => f.validate(formData));
}

export function missingFields(formData: ScheduleFormData): string[] {
  return REQUIRED_FIELDS.filter((f) => !f.validate(formData)).map((f) => f.label);
}
```

**Step 4: Run the test to verify it passes**

```bash
npm test -- src/lib/__tests__/schedule-send-is-complete.test.ts
```
Expected: all tests PASS.

**Step 5: Commit and push**

```bash
git add src/lib/schedule-send.ts src/lib/__tests__/schedule-send-is-complete.test.ts
git commit -m "Add isFormComplete + missingFields helpers"
git push
```

---

## Task 3: Cron filter helpers (TDD)

**Files:**
- Modify: `src/lib/schedule-send.ts`
- Create: `src/lib/__tests__/schedule-send-filters.test.ts`

**Step 1: Write the failing test**

Create `src/lib/__tests__/schedule-send-filters.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  findRemindableDrafts,
  findDueDrafts,
  findStaleDrafts,
  type SchedulableDraft,
} from "../schedule-send";

const minutesFromNow = (mins: number) =>
  new Date(Date.now() + mins * 60_000);

const baseDraft: SchedulableDraft = {
  id: "d1",
  taskId: "t1",
  formData: {},
  scheduledFor: null,
  scheduleStatus: null,
  lastReminderAt: null,
};

describe("findDueDrafts", () => {
  it("returns drafts whose scheduledFor is now or in the past and status is scheduled", () => {
    const drafts: SchedulableDraft[] = [
      { ...baseDraft, id: "due", scheduledFor: minutesFromNow(-1), scheduleStatus: "scheduled" },
      { ...baseDraft, id: "future", scheduledFor: minutesFromNow(10), scheduleStatus: "scheduled" },
      { ...baseDraft, id: "firing", scheduledFor: minutesFromNow(-1), scheduleStatus: "firing" },
      { ...baseDraft, id: "no-schedule", scheduledFor: null, scheduleStatus: null },
    ];
    expect(findDueDrafts(drafts, new Date()).map((d) => d.id)).toEqual(["due"]);
  });
});

describe("findRemindableDrafts", () => {
  it("returns scheduled drafts with scheduledFor in 25-35 min window and no prior reminder", () => {
    const now = new Date();
    const drafts: SchedulableDraft[] = [
      { ...baseDraft, id: "in-window", scheduledFor: minutesFromNow(30), scheduleStatus: "scheduled" },
      { ...baseDraft, id: "too-soon", scheduledFor: minutesFromNow(20), scheduleStatus: "scheduled" },
      { ...baseDraft, id: "too-far", scheduledFor: minutesFromNow(40), scheduleStatus: "scheduled" },
      { ...baseDraft, id: "already-reminded", scheduledFor: minutesFromNow(30), scheduleStatus: "scheduled", lastReminderAt: now },
    ];
    expect(findRemindableDrafts(drafts, now).map((d) => d.id)).toEqual(["in-window"]);
  });
});

describe("findStaleDrafts", () => {
  it("returns drafts more than 30 min past their scheduledFor that are still scheduled or firing", () => {
    const drafts: SchedulableDraft[] = [
      { ...baseDraft, id: "fresh-due", scheduledFor: minutesFromNow(-5), scheduleStatus: "scheduled" },
      { ...baseDraft, id: "stale-scheduled", scheduledFor: minutesFromNow(-45), scheduleStatus: "scheduled" },
      { ...baseDraft, id: "stale-firing", scheduledFor: minutesFromNow(-45), scheduleStatus: "firing" },
      { ...baseDraft, id: "no-schedule", scheduledFor: null, scheduleStatus: null },
    ];
    expect(findStaleDrafts(drafts, new Date()).map((d) => d.id).sort()).toEqual(["stale-firing", "stale-scheduled"]);
  });
});
```

**Step 2: Run the test to verify it fails**

```bash
npm test -- src/lib/__tests__/schedule-send-filters.test.ts
```
Expected: FAIL — `findDueDrafts`/`findRemindableDrafts`/`findStaleDrafts`/`SchedulableDraft` not exported.

**Step 3: Append the helpers to `src/lib/schedule-send.ts`**

Add after the existing exports:

```typescript
export interface SchedulableDraft {
  id: string;
  taskId: string;
  formData: ScheduleFormData;
  scheduledFor: Date | null;
  scheduleStatus: string | null;
  lastReminderAt: Date | null;
}

export function findDueDrafts(drafts: SchedulableDraft[], now: Date): SchedulableDraft[] {
  return drafts.filter(
    (d) => d.scheduleStatus === "scheduled" && d.scheduledFor != null && d.scheduledFor <= now
  );
}

export function findRemindableDrafts(drafts: SchedulableDraft[], now: Date): SchedulableDraft[] {
  const fromMs = now.getTime() + 25 * 60_000;
  const toMs = now.getTime() + 35 * 60_000;
  return drafts.filter(
    (d) =>
      d.scheduleStatus === "scheduled" &&
      d.lastReminderAt == null &&
      d.scheduledFor != null &&
      d.scheduledFor.getTime() >= fromMs &&
      d.scheduledFor.getTime() <= toMs
  );
}

export function findStaleDrafts(drafts: SchedulableDraft[], now: Date): SchedulableDraft[] {
  const cutoffMs = now.getTime() - 30 * 60_000;
  return drafts.filter(
    (d) =>
      (d.scheduleStatus === "scheduled" || d.scheduleStatus === "firing") &&
      d.scheduledFor != null &&
      d.scheduledFor.getTime() < cutoffMs
  );
}
```

**Step 4: Tests pass**

```bash
npm test -- src/lib/__tests__/schedule-send-filters.test.ts
```
Expected: all PASS.

**Step 5: Commit and push**

```bash
git add src/lib/schedule-send.ts src/lib/__tests__/schedule-send-filters.test.ts
git commit -m "Add cron filter helpers for schedule send"
git push
```

---

## Task 4: `sendSlackDM(senderEmail, text)` helper

**Files:**
- Create: `src/lib/slack-dm.ts`

> **No TDD here** — the helper is a thin wrapper around two Slack API calls. Manually-verifiable only.

**Step 1: Implement the helper**

Create `src/lib/slack-dm.ts`:

```typescript
const SLACK_API = "https://slack.com/api";

interface SlackResp {
  ok: boolean;
  error?: string;
}

interface LookupResp extends SlackResp {
  user?: { id: string };
}

interface ConversationsOpenResp extends SlackResp {
  channel?: { id: string };
}

async function slackCall<T extends SlackResp>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN is not set");
  }
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T;
  if (!json.ok) {
    throw new Error(`Slack ${method} failed: ${json.error ?? "unknown"}`);
  }
  return json;
}

/**
 * DM a Consume Media user by email. Returns true on success.
 * On any failure (missing scopes, user not found, token issue) logs a warning
 * and returns false rather than throwing — callers (the cron) must remain robust.
 */
export async function sendSlackDM(senderEmail: string, text: string): Promise<boolean> {
  try {
    const lookup = await slackCall<LookupResp>("users.lookupByEmail", { email: senderEmail });
    const userId = lookup.user?.id;
    if (!userId) return false;
    const conv = await slackCall<ConversationsOpenResp>("conversations.open", { users: userId });
    const channel = conv.channel?.id;
    if (!channel) return false;
    await slackCall("chat.postMessage", { channel, text });
    return true;
  } catch (err) {
    console.warn("sendSlackDM failed for", senderEmail, ":", err);
    return false;
  }
}
```

**Step 2: Commit and push**

```bash
git add src/lib/slack-dm.ts
git commit -m "Add sendSlackDM helper for cron notifications"
git push
```

---

## Task 5: Allow cron-internal calls to the send route

**Files:**
- Modify: `src/app/api/tasks/[taskId]/send/route.ts`

**Step 1: Read the existing route**

Open `src/app/api/tasks/[taskId]/send/route.ts` (~502 lines) and find:
- Where it reads form data from the request body (you'll need to know the body shape for Task 8).
- Where it reads `sentBy` (likely `getSessionUserEmail()`).

**Step 2: Add a cron-secret bypass at the top of `POST`**

At the top of the `POST` handler, before any session/auth logic, accept a cron-secret authorization. Add:

```typescript
const cronAuth = req.headers.get("authorization");
const isCron = cronAuth === `Bearer ${process.env.CRON_SECRET ?? ""}` && Boolean(process.env.CRON_SECRET);
```

Then anywhere `getSessionUserEmail()` is currently called for `sentBy`, fall back to a request-body field when `isCron`:

```typescript
const sentBy = isCron
  ? (body?.sentBy as string | undefined) ?? "scheduled-send"
  : await getSessionUserEmail();
```

> Be precise: do NOT replace `getSessionUserEmail()` everywhere — only at the `sentBy` capture site (and any analogous attribution site). The rest of the route should be unchanged.

**Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: clean.

**Step 4: Commit and push**

```bash
git add src/app/api/tasks/[taskId]/send/route.ts
git commit -m "Allow cron-secret bypass on send route for scheduled sends"
git push
```

---

## Task 6: Schedule API — POST/DELETE/PATCH `/api/drafts/[taskId]/schedule`

**Files:**
- Create: `src/app/api/drafts/[taskId]/schedule/route.ts`

**Step 1: Implement the route**

Create `src/app/api/drafts/[taskId]/schedule/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

async function parseScheduledFor(req: Request): Promise<{ scheduledFor: Date | null; error?: string }> {
  const body = await req.json().catch(() => ({}));
  const raw = body?.scheduledFor;
  if (!raw || typeof raw !== "string") {
    return { scheduledFor: null, error: "scheduledFor is required (ISO string)" };
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return { scheduledFor: null, error: "scheduledFor is not a valid date" };
  }
  if (d.getTime() <= Date.now()) {
    return { scheduledFor: null, error: "scheduledFor must be in the future" };
  }
  return { scheduledFor: d };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const parsed = await parseScheduledFor(req);
    if (parsed.error || !parsed.scheduledFor) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const updated = await prisma.draft.update({
      where: { taskId },
      data: {
        scheduledFor: parsed.scheduledFor,
        scheduleStatus: "scheduled",
        lastReminderAt: null,
      },
    });
    return NextResponse.json({ ok: true, draft: updated });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }
    console.error("Failed to schedule draft:", e);
    return NextResponse.json({ error: "Failed to schedule" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  // Reschedule — same shape as POST but explicitly clears the reminder flag.
  return POST(req, { params });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    await prisma.draft.update({
      where: { taskId },
      data: { scheduledFor: null, scheduleStatus: null, lastReminderAt: null },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }
    console.error("Failed to cancel schedule:", e);
    return NextResponse.json({ error: "Failed to cancel schedule" }, { status: 500 });
  }
}
```

**Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: clean.

**Step 3: Commit and push**

```bash
git add src/app/api/drafts/[taskId]/schedule/route.ts
git commit -m "Add schedule/reschedule/cancel API for drafts"
git push
```

---

## Task 7: `GET /api/scheduled` — list scheduled drafts

**Files:**
- Create: `src/app/api/scheduled/route.ts`

**Step 1: Implement the route**

Create `src/app/api/scheduled/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isFormComplete, missingFields, type ScheduleFormData } from "@/lib/schedule-send";

export async function GET() {
  try {
    const drafts = await prisma.draft.findMany({
      where: { scheduledFor: { not: null }, scheduleStatus: "scheduled" },
      orderBy: { scheduledFor: "asc" },
    });
    const data = drafts.map((d) => {
      const formData = (d.formData ?? {}) as ScheduleFormData;
      return {
        id: d.id,
        taskId: d.taskId,
        savedBy: d.savedBy,
        scheduledFor: d.scheduledFor?.toISOString() ?? null,
        isComplete: isFormComplete(formData),
        missing: missingFields(formData),
        formData,
      };
    });
    return NextResponse.json({ scheduled: data });
  } catch (e) {
    console.error("Failed to list scheduled drafts:", e);
    return NextResponse.json({ scheduled: [], error: "Failed to load scheduled" }, { status: 500 });
  }
}
```

**Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/app/api/scheduled/route.ts
git commit -m "Add GET /api/scheduled"
git push
```

---

## Task 8: Cron route + `vercel.json`

**Files:**
- Create: `src/app/api/cron/scheduled-sends/route.ts`
- Create or modify: `vercel.json` (in the repo root)

**Step 1: Add the Vercel cron config**

If `vercel.json` doesn't exist, create it. Otherwise add the `crons` array. Final shape:

```json
{
  "crons": [
    { "path": "/api/cron/scheduled-sends", "schedule": "* * * * *" }
  ]
}
```

**Step 2: Implement the cron route**

Create `src/app/api/cron/scheduled-sends/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  findDueDrafts,
  findRemindableDrafts,
  findStaleDrafts,
  isFormComplete,
  missingFields,
  type SchedulableDraft,
  type ScheduleFormData,
} from "@/lib/schedule-send";
import { sendSlackDM } from "@/lib/slack-dm";

function authorized(req: Request): boolean {
  const auth = req.headers.get("authorization");
  return Boolean(
    process.env.CRON_SECRET &&
    auth === `Bearer ${process.env.CRON_SECRET}`
  );
}

function formatET(d: Date): string {
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

async function runReminderPass(now: Date, candidates: SchedulableDraft[]) {
  const remindable = findRemindableDrafts(candidates, now);
  for (const d of remindable) {
    const fd = d.formData as ScheduleFormData;
    if (isFormComplete(fd)) continue;
    const missing = missingFields(fd).join(", ");
    const text = `:hourglass: Heads up — your scheduled send for ${fd.primaryEmail ?? "(no client)"} fires at ${formatET(d.scheduledFor!)} and is missing: ${missing}.`;
    await sendSlackDM(d.savedBy ?? "", text);
    await prisma.draft.update({
      where: { id: d.id },
      data: { lastReminderAt: now },
    });
  }
}

async function runFirePass(now: Date, candidates: SchedulableDraft[], baseUrl: string) {
  const due = findDueDrafts(candidates, now);
  for (const d of due) {
    // Atomic claim: only proceed if status is still "scheduled".
    const claimed = await prisma.draft.updateMany({
      where: { id: d.id, scheduleStatus: "scheduled" },
      data: { scheduleStatus: "firing" },
    });
    if (claimed.count === 0) continue;

    const fd = (d.formData ?? {}) as ScheduleFormData;
    if (!isFormComplete(fd)) {
      await bounce(d, fd, "Missing required fields: " + missingFields(fd).join(", "));
      continue;
    }

    try {
      const sendUrl = `${baseUrl}/api/tasks/${encodeURIComponent(d.taskId)}/send`;
      const res = await fetch(sendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify({ ...fd, sentBy: d.savedBy }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`send route returned ${res.status}: ${txt.slice(0, 200)}`);
      }
      // On success the send route deletes the draft, so nothing more to do.
    } catch (err) {
      console.error("scheduled send failed for draft", d.id, err);
      await bounce(d, fd, "Send failed: " + (err instanceof Error ? err.message : String(err)));
    }
  }
}

async function runStalePass(now: Date, candidates: SchedulableDraft[]) {
  const stale = findStaleDrafts(candidates, now);
  for (const d of stale) {
    const fd = (d.formData ?? {}) as ScheduleFormData;
    await bounce(d, fd, "Scheduled time passed without firing");
  }
}

async function bounce(d: SchedulableDraft, fd: ScheduleFormData, reason: string) {
  await prisma.draft.update({
    where: { id: d.id },
    data: { scheduledFor: null, scheduleStatus: null, lastReminderAt: null },
  });
  const text = `:warning: Your scheduled send for ${fd.primaryEmail ?? "(no client)"} didn't fire (${reason}). It's back in Drafts.`;
  await sendSlackDM(d.savedBy ?? "", text);
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const now = new Date();
    const baseUrl = req.headers.get("x-forwarded-proto") && req.headers.get("host")
      ? `${req.headers.get("x-forwarded-proto")}://${req.headers.get("host")}`
      : process.env.NEXT_PUBLIC_APP_URL ?? "";
    if (!baseUrl) throw new Error("cannot derive baseUrl for internal call");

    const candidates = await prisma.draft.findMany({
      where: {
        OR: [
          { scheduleStatus: "scheduled" },
          { scheduleStatus: "firing" },
        ],
      },
    });
    const drafts: SchedulableDraft[] = candidates.map((c) => ({
      id: c.id,
      taskId: c.taskId,
      formData: (c.formData ?? {}) as ScheduleFormData,
      scheduledFor: c.scheduledFor,
      scheduleStatus: c.scheduleStatus,
      lastReminderAt: c.lastReminderAt,
    }));

    await runReminderPass(now, drafts);
    await runFirePass(now, drafts, baseUrl);
    await runStalePass(now, drafts);

    return NextResponse.json({ ok: true, processed: drafts.length });
  } catch (e) {
    console.error("Cron failed:", e);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}

// Allow Vercel cron's GET fallback by aliasing.
export const GET = POST;
```

**Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add vercel.json src/app/api/cron/scheduled-sends/route.ts
git commit -m "Add scheduled-sends cron route and Vercel cron config"
git push
```

> After this commit deploys, the cron starts ticking. Until any draft has `scheduledFor` set, every tick is a no-op (the query returns 0 candidates).

---

## Task 9: SchedulePicker popover component

**Files:**
- Create: `src/components/delivery-form/schedule-picker.tsx`

**Step 1: Implement**

Create `src/components/delivery-form/schedule-picker.tsx`:

```tsx
"use client";

import { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface Props {
  trigger: React.ReactNode;
  /** Called when user confirms a schedule time (ISO string). */
  onSchedule: (isoString: string) => void;
  busy?: boolean;
}

/**
 * Returns an ISO string for a future moment in Eastern Time.
 * The picker presents times as Eastern; this helper converts wall-clock-ET to a UTC ISO.
 */
function etWallClockToIso(year: number, month: number, day: number, hour: number, minute: number): string {
  // Construct a Date object representing that wall-clock in ET by leveraging Intl.DateTimeFormat round-trip.
  // Simpler approach: build a string like "2026-05-12T09:00:00-04:00" — but DST means the offset varies.
  // Cleanest: use a local-time Date, then adjust by the difference between server TZ and ET.
  const local = new Date(year, month - 1, day, hour, minute);
  const localTz = -local.getTimezoneOffset(); // minutes east of UTC for browser/server
  // Determine ET offset (EST = -300, EDT = -240) by checking what hour ET sees right now.
  const etOffsetMinutes = etOffsetForDate(local);
  const diffMinutes = localTz - etOffsetMinutes;
  return new Date(local.getTime() - diffMinutes * 60_000).toISOString();
}

function etOffsetForDate(d: Date): number {
  // Returns ET offset in minutes east of UTC for the given date.
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" });
  const parts = fmt.formatToParts(d).find((p) => p.type === "timeZoneName");
  if (parts?.value === "GMT-4") return -240;
  return -300; // default to EST
}

function presetTomorrowAt9(): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return etWallClockToIso(tomorrow.getFullYear(), tomorrow.getMonth() + 1, tomorrow.getDate(), 9, 0);
}

function presetNextMondayAt9(): string {
  const now = new Date();
  const date = new Date(now);
  const day = date.getDay(); // 0=Sun
  const daysUntilMon = ((8 - day) % 7) || 7; // always >=1 day out
  date.setDate(date.getDate() + daysUntilMon);
  return etWallClockToIso(date.getFullYear(), date.getMonth() + 1, date.getDate(), 9, 0);
}

function presetInOneHour(): string {
  const d = new Date(Date.now() + 60 * 60_000);
  // Round up to next 5-min mark.
  const mins = d.getMinutes();
  const rounded = Math.ceil(mins / 5) * 5;
  d.setMinutes(rounded, 0, 0);
  return d.toISOString();
}

function formatET(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function SchedulePicker({ trigger, onSchedule, busy = false }: Props) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<string>(""); // YYYY-MM-DD
  const [time, setTime] = useState<string>(""); // HH:mm

  const previewIso = useMemo(() => {
    if (!date || !time) return null;
    const [y, m, dd] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    if (!y || !m || !dd || hh == null || mm == null) return null;
    return etWallClockToIso(y, m, dd, hh, mm);
  }, [date, time]);

  const previewIsValid = previewIso != null && new Date(previewIso).getTime() > Date.now();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-[360px] p-4 space-y-3" align="end">
        <div className="text-sm font-medium">Schedule send (Eastern)</div>
        <div className="grid grid-cols-1 gap-2">
          <Button variant="outline" size="sm" onClick={() => onSchedule(presetTomorrowAt9())} disabled={busy}>
            Tomorrow 9am ET
          </Button>
          <Button variant="outline" size="sm" onClick={() => onSchedule(presetNextMondayAt9())} disabled={busy}>
            Monday 9am ET
          </Button>
          <Button variant="outline" size="sm" onClick={() => onSchedule(presetInOneHour())} disabled={busy}>
            In 1 hour
          </Button>
        </div>
        <div className="border-t pt-3 space-y-2">
          <div className="text-xs text-muted-foreground">Or pick a time</div>
          <div className="flex gap-2">
            <input
              type="date"
              className="flex-1 rounded-md border px-2 py-1 text-sm"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <input
              type="time"
              step={300}
              className="flex-1 rounded-md border px-2 py-1 text-sm"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          {previewIso && (
            <div className={`text-xs ${previewIsValid ? "text-muted-foreground" : "text-destructive"}`}>
              {previewIsValid ? `Will send: ${formatET(previewIso)}` : "Must be in the future"}
            </div>
          )}
          <Button
            size="sm"
            className="w-full"
            disabled={!previewIsValid || busy}
            onClick={() => previewIso && onSchedule(previewIso)}
          >
            Schedule
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

**Step 2: Commit and push**

```bash
git add src/components/delivery-form/schedule-picker.tsx
git commit -m "Add SchedulePicker popover component"
git push
```

---

## Task 10: Wire the SplitButton + SchedulePicker into the send bar

**Files:**
- Modify: `src/components/delivery-form/send-bar.tsx`

**Step 1: Discover the current send-bar shape**

Open `src/components/delivery-form/send-bar.tsx`. Find the primary "Send" button. Note how it handles loading state (`isPending`/`isSending`) and how the parent (`delivery-form.tsx`) passes handlers.

**Step 2: Add a split-button dropdown + picker**

Replace the existing single Send button with a flex pair: the Send button on the left, a `<DropdownMenu>` chevron trigger on the right that shows a single "Schedule send..." item. That item opens `<SchedulePicker>` via a wrapper trigger.

Skeleton:

```tsx
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { SchedulePicker } from "./schedule-picker";
import { toast } from "sonner";

// inside the existing send-bar component, replace the lone Send button with:
<div className="flex">
  <Button onClick={handleSend} disabled={isSending} className="rounded-r-none">
    Send
  </Button>
  <SchedulePicker
    trigger={
      <Button variant="default" className="rounded-l-none border-l border-l-white/20 px-2" disabled={isSending}>
        <ChevronDown className="h-4 w-4" />
      </Button>
    }
    onSchedule={async (iso) => {
      try {
        const res = await fetch(`/api/drafts/${taskId}/schedule`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledFor: iso }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? "Failed to schedule");
        }
        toast.success("Scheduled");
        queryClient.invalidateQueries({ queryKey: ["scheduled", "list"] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to schedule");
      }
    }}
  />
</div>
```

(Use the `useQueryClient` hook already imported in the file. If not present, import it from `@tanstack/react-query` and call once near the top of the component.)

> If the send-bar already uses something other than `<Button>` (e.g. a custom styled button), match the local component instead. The structure of "primary action + caret dropdown" is what matters; the exact CSS classes follow the file's conventions.

**Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add src/components/delivery-form/send-bar.tsx
git commit -m "Add Schedule send option to send bar"
git push
```

---

## Task 11: `/scheduled` page

**Files:**
- Create: `src/app/scheduled/page.tsx`
- Create: `src/components/scheduled/scheduled-list.tsx`

**Step 1: Implement the page**

Create `src/app/scheduled/page.tsx`:

```tsx
import { ScheduledList } from "@/components/scheduled/scheduled-list";

export default function ScheduledPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-eighties text-2xl">Scheduled</h1>
        <p className="text-muted-foreground">
          Deliveries queued to send automatically. Edit, reschedule, or cancel any item below.
        </p>
      </div>
      <ScheduledList />
    </div>
  );
}
```

**Step 2: Implement the list component**

Create `src/components/scheduled/scheduled-list.tsx`:

```tsx
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useState } from "react";

interface ScheduledRow {
  id: string;
  taskId: string;
  savedBy: string;
  scheduledFor: string | null;
  isComplete: boolean;
  missing: string[];
  formData: { primaryEmail?: string; deliverableType?: string };
}

function fmtET(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function ScheduledList() {
  const queryClient = useQueryClient();
  const [pendingCancel, setPendingCancel] = useState<ScheduledRow | null>(null);
  const { data, isLoading, isError } = useQuery<{ scheduled: ScheduledRow[] }>({
    queryKey: ["scheduled", "list"],
    queryFn: async () => {
      const res = await fetch("/api/scheduled");
      if (!res.ok) throw new Error("Failed to load scheduled");
      return res.json();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (row: ScheduledRow) => {
      const res = await fetch(`/api/drafts/${row.taskId}/schedule`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to cancel schedule");
      }
    },
    onSuccess: () => {
      toast.success("Schedule cancelled");
      queryClient.invalidateQueries({ queryKey: ["scheduled", "list"] });
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Card className="p-4 text-muted-foreground">Loading…</Card>;
  if (isError) return <Card className="p-4 text-destructive">Failed to load scheduled items.</Card>;

  const rows = data?.scheduled ?? [];
  if (rows.length === 0) {
    return <Card className="p-6 text-muted-foreground">Nothing scheduled. Use Send → Schedule send on a delivery to queue one.</Card>;
  }

  return (
    <>
      <div className="space-y-2">
        {rows.map((row) => (
          <Card
            key={row.id}
            className="flex flex-row items-center gap-3 px-4 py-3"
          >
            <div className="flex-1">
              <div className="font-medium">{row.formData.primaryEmail ?? "(no recipient)"}</div>
              <div className="text-xs text-muted-foreground">
                {row.formData.deliverableType ?? "Unknown type"} · scheduled for {fmtET(row.scheduledFor)}
              </div>
              {!row.isComplete && (
                <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                  Incomplete: missing {row.missing.join(", ")}
                </div>
              )}
            </div>
            <Link href={`/deliverable/${row.taskId}`}>
              <Button variant="outline" size="sm">Edit</Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Cancel schedule for ${row.formData.primaryEmail ?? row.taskId}`}
              onClick={() => setPendingCancel(row)}
            >
              <X className="h-4 w-4" />
            </Button>
          </Card>
        ))}
      </div>
      <AlertDialog
        open={pendingCancel != null}
        onOpenChange={(open) => !cancelMutation.isPending && !open && setPendingCancel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel scheduled send?</AlertDialogTitle>
            <AlertDialogDescription>
              The delivery will move back to Drafts. You can reschedule or send it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>Keep scheduled</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelMutation.isPending}
              onClick={() => pendingCancel && cancelMutation.mutate(pendingCancel)}
            >
              {cancelMutation.isPending ? "Cancelling…" : "Cancel schedule"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

> Confirm the per-deliverable edit route is `/deliverable/[taskId]` by reading `src/app/deliverable/` directory; if it's different, adjust the `<Link href>`.

**Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add src/app/scheduled src/components/scheduled
git commit -m "Add /scheduled page with cancel + edit actions"
git push
```

---

## Task 12: Sidebar nav entry for Scheduled

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

**Step 1: Insert the entry between Drafts and Sent**

Update the `navItems` array. After the `Drafts` line, add:

```typescript
{ href: "/scheduled", label: "Scheduled", icon: "/icons/on-button.svg" },
```

The icon file (`public/icons/on-button.svg`) is already in the repo from a prior commit.

**Step 2: Commit and push**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "Add Scheduled link to sidebar"
git push
```

---

## Task 13: Scheduled-mode banner on the delivery form

**Files:**
- Modify: `src/components/delivery-form/delivery-form.tsx`
- Possibly modify: `src/components/delivery-form/send-bar.tsx` (for "Send now" + "Save schedule" labels)

**Step 1: Read the form's data flow**

Find where `delivery-form.tsx` loads the draft data (likely a `useQuery(["draft", taskId])` near the top). The draft response now includes `scheduledFor`, `scheduleStatus`, `lastReminderAt` fields per the updated `Draft` model.

**Step 2: Render a sticky banner when `scheduledFor` is set**

Above the form's existing content, render a banner when the draft's `scheduledFor` is non-null and `scheduleStatus === "scheduled"`:

```tsx
{draft?.scheduledFor && draft?.scheduleStatus === "scheduled" && (
  <div className="sticky top-0 z-10 -mx-6 mb-4 px-6 py-3 bg-blue-500/10 border-b border-blue-500/30 text-sm flex items-center justify-between gap-3">
    <div>
      <strong>Scheduled for</strong>{" "}
      {new Date(draft.scheduledFor).toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })}
    </div>
    <div className="flex gap-2">
      <SchedulePicker
        trigger={<Button variant="outline" size="sm">Reschedule</Button>}
        onSchedule={async (iso) => {
          /* PATCH /api/drafts/[taskId]/schedule */
        }}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          await fetch(`/api/drafts/${taskId}/schedule`, { method: "DELETE" });
          queryClient.invalidateQueries({ queryKey: ["draft", taskId] });
          queryClient.invalidateQueries({ queryKey: ["scheduled", "list"] });
          toast.success("Schedule cancelled — back in Drafts");
        }}
      >
        Cancel schedule
      </Button>
    </div>
  </div>
)}
```

**Step 3 (optional, only if simple to do):** when `scheduledFor` is set, the send-bar's primary "Send" button can re-label to "Send now" (fires immediately, the existing send flow already deletes the draft including its schedule). Skip if it requires more than ~10 lines.

**Step 4: Type-check + commit**

```bash
npx tsc --noEmit
git add src/components/delivery-form/delivery-form.tsx src/components/delivery-form/send-bar.tsx
git commit -m "Show scheduled-mode banner with reschedule + cancel on delivery form"
git push
```

---

## Task 14: Live Vercel smoke test

This task runs against the live deploy. The cron starts ticking as soon as Task 8 is deployed; the UI flows light up after Tasks 10–13 deploy.

**Prerequisite: Slack scopes.** Confirm in the Slack app config that the bot has `users:read.email`, `im:write`, `chat:write`. If missing, add them and re-install the bot. The cron's `sendSlackDM` will silently log and skip if scopes are absent, but the user-facing reminder/bounce notifications won't reach the sender until this is done.

**Smoke test plan (run on the live `/scheduled` page):**

1. **Schedule a complete delivery 6 min out** — open any draft with all required fields filled, click Send → Schedule send → date+time 6 min from now → confirm. Page should show the new row at the top of `/scheduled`. Wait for it to fire (~6 min). Confirm:
   - Row disappears from `/scheduled`
   - The delivery appears in `/sent` with the correct `sentAt`
   - The ClickUp task is marked complete (existing send flow)

2. **Schedule an incomplete delivery 6 min out** — same as (1) but blank a required field (e.g. clear the delivery link). Wait for fire. Confirm:
   - Row disappears from `/scheduled`
   - Draft is restored (visible in `/drafts`)
   - You received a Slack DM with the bounce reason

3. **Schedule an incomplete delivery 35 min out** — leave a field blank. Wait for the T-30 reminder DM to arrive. Drop in the missing field, save. At T-0, confirm normal fire (Sent row appears).

4. **Round-trip on a scheduled item** — schedule something for tomorrow 9am ET. Open it from `/scheduled` → confirm the blue banner shows the right time. Edit content, save. Click Reschedule → pick a new time. Click Cancel schedule → confirm the draft is back in `/drafts` without `scheduledFor`.

**Done criteria:** all four scenarios pass on the live deploy.

---

## Done criteria for the feature

- New schedule columns exist on the `Draft` table in production Postgres.
- The cron is configured in `vercel.json` and runs every minute.
- `/scheduled` page loads, lists items sorted by fire time, supports edit + cancel.
- Send bar split-button opens the schedule picker; scheduling round-trips.
- Reminder + bounce Slack DMs reach the sender (once Slack scopes added).
- All four smoke-test scenarios in Task 14 pass.
- `npm test` passes; `npx tsc --noEmit` clean.
- All commits pushed.
