# Allowed Senders Settings Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hardcoded `ALLOWED_SENDERS` set in `field-options/route.ts` with a Postgres-backed allowlist, manageable from a new `/settings` page.

**Architecture:** New `AllowedSender` Prisma model keyed by ClickUp user ID. A `/settings` page (added to the sidebar) lets any signed-in `@consume-media.com` user add/remove senders via a ClickUp workspace member picker. The existing `field-options` endpoint joins the DB allowlist against ClickUp workspace members instead of using the hardcoded set.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma + Neon Postgres (via `@prisma/adapter-pg`), TanStack Query (React Query), Shadcn/ui (`Command`, `Popover`, `Alert`, `AlertDialog`), Vitest.

**Design doc:** `docs/plans/2026-05-10-allowed-senders-settings-design.md`

**Conventions to follow:**
- Prisma client: `import { prisma } from "@/lib/db"` (proxy errors are fine; wrap in try/catch).
- Session user email: `import { getSessionUserEmail } from "@/lib/get-session-user"`.
- API routes return `NextResponse.json(...)` with try/catch.
- Tests live in `src/**/__tests__/*.test.ts` and run with `npm test` (Vitest, node env, `@/` alias).

**Project memory note:** Per `feedback_always_push.md`, every commit must be pushed; Michael tests on live Vercel deploys.

---

## Task 1: Add `AllowedSender` Prisma model

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Append the model**

Add to the end of `prisma/schema.prisma`:

```prisma
model AllowedSender {
  clickupUserId Int      @id
  addedBy       String
  addedAt       DateTime @default(now())

  @@index([addedAt])
}
```

**Step 2: Push the schema and regenerate the client**

Run from repo root:
```bash
npx prisma db push
npx prisma generate
```

Expected: `db push` reports the new table created on Neon; `generate` reports "Generated Prisma Client".

**Step 3: Sanity-check via REPL**

Run:
```bash
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.allowedSender.count().then(c=>{console.log('count:',c);return p.\$disconnect()}).catch(e=>{console.error(e);process.exit(1)})"
```
Expected: `count: 0`. (Skip if `POSTGRES_URL` not in shell — the deploy will pick it up.)

**Step 4: Commit and push**

```bash
git add prisma/schema.prisma
git commit -m "Add AllowedSender Prisma model"
git push
```

---

## Task 2: Extract `filterMembersByAllowlist` helper (TDD)

**Files:**
- Create: `src/lib/allowed-senders.ts`
- Create: `src/lib/__tests__/allowed-senders.test.ts`

**Step 1: Write the failing test**

Create `src/lib/__tests__/allowed-senders.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { filterMembersByAllowlist, type WorkspaceMember } from "../allowed-senders";

const members: WorkspaceMember[] = [
  { id: 1, username: "alice", email: "alice@x.com", profilePicture: undefined, initials: "A" },
  { id: 2, username: "bob", email: "bob@x.com", profilePicture: undefined, initials: "B" },
  { id: 3, username: "carol", email: "carol@x.com", profilePicture: undefined, initials: "C" },
];

describe("filterMembersByAllowlist", () => {
  it("returns only members whose id is in the allowlist", () => {
    const result = filterMembersByAllowlist(members, new Set([1, 3]));
    expect(result.map((m) => m.username)).toEqual(["alice", "carol"]);
  });

  it("returns an empty array when the allowlist is empty", () => {
    expect(filterMembersByAllowlist(members, new Set())).toEqual([]);
  });

  it("ignores allowlist ids that are no longer in the workspace", () => {
    const result = filterMembersByAllowlist(members, new Set([1, 999]));
    expect(result.map((m) => m.username)).toEqual(["alice"]);
  });

  it("sorts results alphabetically by username", () => {
    const result = filterMembersByAllowlist(members, new Set([3, 1, 2]));
    expect(result.map((m) => m.username)).toEqual(["alice", "bob", "carol"]);
  });
});
```

**Step 2: Run the test to verify it fails**

Run:
```bash
npm test -- src/lib/__tests__/allowed-senders.test.ts
```
Expected: FAIL with module-not-found for `../allowed-senders`.

**Step 3: Implement the helper**

Create `src/lib/allowed-senders.ts`:

```typescript
export interface WorkspaceMember {
  id: number;
  username: string;
  email: string;
  profilePicture?: string;
  initials: string;
}

export function filterMembersByAllowlist(
  members: WorkspaceMember[],
  allowed: Set<number>
): WorkspaceMember[] {
  return members
    .filter((m) => allowed.has(m.id))
    .sort((a, b) => a.username.localeCompare(b.username));
}
```

**Step 4: Run the test to verify it passes**

Run:
```bash
npm test -- src/lib/__tests__/allowed-senders.test.ts
```
Expected: 4 tests PASS.

**Step 5: Commit and push**

```bash
git add src/lib/allowed-senders.ts src/lib/__tests__/allowed-senders.test.ts
git commit -m "Add filterMembersByAllowlist helper"
git push
```

---

## Task 3: Refactor `field-options` to use DB allowlist

**Files:**
- Modify: `src/app/api/templates/field-options/route.ts`

**Step 1: Replace the hardcoded set with a DB query**

In `src/app/api/templates/field-options/route.ts`:

1. Add imports near the top:
   ```typescript
   import { prisma } from "@/lib/db";
   import { filterMembersByAllowlist, type WorkspaceMember } from "@/lib/allowed-senders";
   ```
2. Replace the block that maps `team.members` and filters by `ALLOWED_SENDERS` (currently lines ~77–119) with:
   ```typescript
   const mapped: WorkspaceMember[] = team.members.map(
     (m: {
       user: {
         id: number;
         username: string;
         email: string;
         profilePicture?: string;
       };
     }) => {
       const user = m.user;
       const name = (user.username ?? user.email ?? "").trim();
       const initials = name
         .split(/[\s.@]+/)
         .filter(Boolean)
         .slice(0, 2)
         .map((p) => (p[0] ?? "").toUpperCase())
         .join("");
       return {
         id: user.id ?? 0,
         username: user.username ?? "",
         email: user.email ?? "",
         profilePicture: user.profilePicture ?? undefined,
         initials,
       };
     }
   );

   let allowedIds = new Set<number>();
   try {
     const rows = await prisma.allowedSender.findMany({ select: { clickupUserId: true } });
     allowedIds = new Set(rows.map((r) => r.clickupUserId));
   } catch (dbErr) {
     console.warn("Failed to load AllowedSender rows; sender list will be empty:", dbErr);
   }

   senderOptions = filterMembersByAllowlist(mapped, allowedIds);
   ```
3. Delete the now-unused `ALLOWED_SENDERS` `Set` constant.

**Step 2: Type-check the file**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors. If errors mention `senderOptions` typing, ensure the outer `let senderOptions: MemberOption[] = []` declaration matches `WorkspaceMember[]` (they have identical shape; you can leave `MemberOption` or replace it with `WorkspaceMember`).

**Step 3: Commit and push**

```bash
git add src/app/api/templates/field-options/route.ts
git commit -m "Filter senders by AllowedSender DB rows instead of hardcoded set"
git push
```

> **Do NOT deploy yet** — at this point production has no allowlist rows, so the dropdown would empty out. Task 4 (seed) closes that gap before we trust this in prod.

---

## Task 4: Seed initial allowed senders

**Files:**
- Create: `scripts/seed-allowed-senders.ts`

**Step 1: Write the seed script**

Create `scripts/seed-allowed-senders.ts`:

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const SEED_USERNAMES = [
  "louis galanti",
  "landon schellman",
  "tony saffell",
  "sadjr williams",
  "michael rosenberg",
];

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error("POSTGRES_URL not set");
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) throw new Error("CLICKUP_API_TOKEN not set");

  const teamsRes = await fetch("https://api.clickup.com/api/v2/team", {
    headers: { Authorization: token, "Content-Type": "application/json" },
  });
  if (!teamsRes.ok) throw new Error(`ClickUp /team failed: ${teamsRes.status}`);
  const { teams } = await teamsRes.json();
  const team = teams[0];
  const members: Array<{ user: { id: number; username: string } }> = team.members ?? [];

  const targetSet = new Set(SEED_USERNAMES);
  const matches = members.filter((m) =>
    targetSet.has((m.user.username ?? "").toLowerCase())
  );

  if (matches.length !== SEED_USERNAMES.length) {
    const found = matches.map((m) => m.user.username.toLowerCase());
    const missing = SEED_USERNAMES.filter((u) => !found.includes(u));
    console.warn("Missing usernames in workspace:", missing);
  }

  const pool = new pg.Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  for (const m of matches) {
    await prisma.allowedSender.upsert({
      where: { clickupUserId: m.user.id },
      update: {},
      create: { clickupUserId: m.user.id, addedBy: "seed" },
    });
    console.log(`✓ ${m.user.username} (${m.user.id})`);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

**Step 2: Run the seed against the configured Postgres**

Run from repo root (loads `.env.local` via `--env-file`):
```bash
node --env-file=.env.local --experimental-strip-types scripts/seed-allowed-senders.ts
```
Expected output: a `✓ <username> (<id>)` line for each of the five seeded users. If any are listed as "Missing usernames in workspace", investigate before continuing.

**Step 3: Commit and push**

```bash
git add scripts/seed-allowed-senders.ts
git commit -m "Add seed script for initial AllowedSender rows"
git push
```

---

## Task 5: `GET` and `POST /api/settings/senders`

**Files:**
- Create: `src/app/api/settings/senders/route.ts`

**Step 1: Implement the route**

Create `src/app/api/settings/senders/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserEmail } from "@/lib/get-session-user";
import { WORKSPACE_ID } from "@/lib/custom-field-ids";
import type { WorkspaceMember } from "@/lib/allowed-senders";

interface AllowedSenderRow {
  clickupUserId: number;
  addedBy: string;
  addedAt: string;
  member: WorkspaceMember | null;
}

async function fetchWorkspaceMembers(): Promise<WorkspaceMember[]> {
  const res = await fetch("https://api.clickup.com/api/v2/team", {
    headers: {
      Authorization: process.env.CLICKUP_API_TOKEN ?? "",
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) return [];
  const { teams } = await res.json();
  const team =
    (teams ?? []).find((t: { id: string }) => t.id === WORKSPACE_ID) ??
    (teams ?? [])[0];
  if (!team?.members) return [];
  return team.members.map((m: {
    user: { id: number; username: string; email: string; profilePicture?: string };
  }) => {
    const u = m.user;
    const name = (u.username ?? u.email ?? "").trim();
    const initials = name
      .split(/[\s.@]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => (p[0] ?? "").toUpperCase())
      .join("");
    return {
      id: u.id ?? 0,
      username: u.username ?? "",
      email: u.email ?? "",
      profilePicture: u.profilePicture ?? undefined,
      initials,
    };
  });
}

export async function GET() {
  try {
    const [rows, members] = await Promise.all([
      prisma.allowedSender.findMany({ orderBy: { addedAt: "desc" } }),
      fetchWorkspaceMembers(),
    ]);
    const byId = new Map(members.map((m) => [m.id, m]));
    const data: AllowedSenderRow[] = rows.map((r) => ({
      clickupUserId: r.clickupUserId,
      addedBy: r.addedBy,
      addedAt: r.addedAt.toISOString(),
      member: byId.get(r.clickupUserId) ?? null,
    }));
    return NextResponse.json({ senders: data });
  } catch (error) {
    console.error("Failed to list allowed senders:", error);
    return NextResponse.json({ senders: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const clickupUserId = Number(body?.clickupUserId);
    if (!Number.isInteger(clickupUserId) || clickupUserId <= 0) {
      return NextResponse.json(
        { error: "clickupUserId is required and must be a positive integer" },
        { status: 400 }
      );
    }
    const addedBy = await getSessionUserEmail();
    try {
      await prisma.allowedSender.create({ data: { clickupUserId, addedBy } });
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002") {
        return NextResponse.json({ error: "Already added" }, { status: 409 });
      }
      throw e;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to add allowed sender:", error);
    return NextResponse.json({ error: "Failed to add sender" }, { status: 500 });
  }
}
```

**Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 3: Commit and push**

```bash
git add src/app/api/settings/senders/route.ts
git commit -m "Add GET/POST /api/settings/senders"
git push
```

---

## Task 6: `DELETE /api/settings/senders/[clickupUserId]`

**Files:**
- Create: `src/app/api/settings/senders/[clickupUserId]/route.ts`

**Step 1: Implement the route**

Create `src/app/api/settings/senders/[clickupUserId]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ clickupUserId: string }> }
) {
  try {
    const { clickupUserId: idStr } = await params;
    const clickupUserId = Number(idStr);
    if (!Number.isInteger(clickupUserId) || clickupUserId <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    try {
      await prisma.allowedSender.delete({ where: { clickupUserId } });
    } catch (e) {
      if ((e as { code?: string })?.code === "P2025") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      throw e;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to remove allowed sender:", error);
    return NextResponse.json({ error: "Failed to remove sender" }, { status: 500 });
  }
}
```

> **Why `params` is `Promise<...>`:** Next.js 15+ async dynamic params. Verify against another `[id]` route in the repo (e.g. `src/app/api/tasks/[taskId]/route.ts`) and match its signature.

**Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 3: Commit and push**

```bash
git add src/app/api/settings/senders/[clickupUserId]/route.ts
git commit -m "Add DELETE /api/settings/senders/[clickupUserId]"
git push
```

---

## Task 7: Workspace members endpoint for the picker

**Files:**
- Create: `src/app/api/settings/workspace-members/route.ts`

**Step 1: Implement**

Create `src/app/api/settings/workspace-members/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { WORKSPACE_ID } from "@/lib/custom-field-ids";
import type { WorkspaceMember } from "@/lib/allowed-senders";

export async function GET() {
  try {
    const res = await fetch("https://api.clickup.com/api/v2/team", {
      headers: {
        Authorization: process.env.CLICKUP_API_TOKEN ?? "",
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      return NextResponse.json({ members: [] }, { status: 502 });
    }
    const { teams } = await res.json();
    const team =
      (teams ?? []).find((t: { id: string }) => t.id === WORKSPACE_ID) ??
      (teams ?? [])[0];
    const members: WorkspaceMember[] = (team?.members ?? []).map((m: {
      user: { id: number; username: string; email: string; profilePicture?: string };
    }) => {
      const u = m.user;
      const name = (u.username ?? u.email ?? "").trim();
      const initials = name
        .split(/[\s.@]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => (p[0] ?? "").toUpperCase())
        .join("");
      return {
        id: u.id ?? 0,
        username: u.username ?? "",
        email: u.email ?? "",
        profilePicture: u.profilePicture ?? undefined,
        initials,
      };
    });
    members.sort((a, b) => a.username.localeCompare(b.username));
    return NextResponse.json({ members });
  } catch (error) {
    console.error("Failed to fetch workspace members:", error);
    return NextResponse.json({ members: [] }, { status: 500 });
  }
}
```

> Yes, this duplicates the mapping in the GET allowlist route — pull it into a shared helper if duplication grows. For now, two call sites is the YAGNI threshold.

**Step 2: Commit and push**

```bash
git add src/app/api/settings/workspace-members/route.ts
git commit -m "Add GET /api/settings/workspace-members"
git push
```

---

## Task 8: `/settings` page UI

**Files:**
- Create: `src/app/settings/page.tsx`
- Create: `src/components/settings/allowed-senders-section.tsx`
- Create: `src/components/settings/add-sender-popover.tsx`

> Before writing these files, read `src/components/delivery-form/sender-select.tsx` and `src/components/dashboard/assignee-filter.tsx` to copy the `Popover + Command` shape and `Avatar` import. Match the project's existing styling and React Query usage (the rest of the app uses `useQuery`/`useMutation` — see `src/components/delivery-form/delivery-form.tsx:200–223` for an example).

**Step 1: Build `add-sender-popover.tsx`**

Create `src/components/settings/add-sender-popover.tsx`. It should:
- Accept props `{ allowedIds: Set<number>, onAdded: () => void }`.
- `useQuery({ queryKey: ["settings", "workspace-members"], queryFn })` against `/api/settings/workspace-members`. `staleTime: 5 * 60_000`.
- Filter out members whose `id` is in `allowedIds` for the picker list.
- Render a `Popover` with a trigger `Button` ("Add sender"), and inside, the same `Command` / `CommandInput` / `CommandList` / `CommandItem` structure as `sender-select.tsx`.
- On `CommandItem` select: `useMutation` `POST /api/settings/senders` with `{ clickupUserId }`. On success: close popover, call `onAdded()`, toast "Added <username>".
- On 409 response: toast "Already added" and still close the popover.

**Step 2: Build `allowed-senders-section.tsx`**

Create `src/components/settings/allowed-senders-section.tsx`. It should:
- `useQuery({ queryKey: ["settings", "allowed-senders"], queryFn })` against `/api/settings/senders`. Returns `{ senders: AllowedSenderRow[] }`.
- Render an `Alert` (Shadcn) with the n8n warning copy:
  > "Senders also need n8n credentials configured. Adding someone here without n8n credentials will cause their sends to fail."
- Render the list as Shadcn `Card`s, one per sender. Each row shows `Avatar`, username, email (small/muted), an "added by &lt;email&gt; on &lt;date&gt;" line, and a destructive `Button` with an X icon.
- Wrap remove in an `AlertDialog` with title "Remove sender?" and description naming the sender. Confirm triggers `useMutation` `DELETE /api/settings/senders/<clickupUserId>`.
- After **any** add or remove mutation succeeds: `queryClient.invalidateQueries({ queryKey: ["settings", "allowed-senders"] })` AND `queryClient.invalidateQueries({ queryKey: ["field-options-senders"] })`. The second key is the one used by the delivery form so the From dropdown refreshes.
- For senders whose `member` field is `null` (no longer in the ClickUp workspace), show username as `(deleted user)` with a muted style; remove is still allowed.
- Place the `AddSenderPopover` button in a flex header above the list.

**Step 3: Build `src/app/settings/page.tsx`**

Create the page:

```tsx
import { AppShell } from "@/components/layout/app-shell";
import { AllowedSendersSection } from "@/components/settings/allowed-senders-section";

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage who can be selected as the sender on a delivery.
          </p>
        </div>
        <AllowedSendersSection />
      </div>
    </AppShell>
  );
}
```

> Confirm `AppShell` is the right wrapper by checking another page (e.g. `src/app/sent/page.tsx`). Use whatever layout primitive that page uses.

**Step 4: Type-check and run unit tests**

Run:
```bash
npx tsc --noEmit && npm test
```
Expected: type-check clean; all tests pass (the new helper test from Task 2 plus existing tests).

**Step 5: Commit and push**

```bash
git add src/app/settings src/components/settings
git commit -m "Add /settings page with allowed senders management"
git push
```

---

## Task 9: Add Settings to the sidebar

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

**Step 1: Append the nav entry**

In `src/components/layout/sidebar.tsx`, add to the `navItems` array (after Analytics):

```typescript
{ href: "/settings", label: "Settings", icon: "/icons/gear.svg" },
```

> If `/icons/gear.svg` does not exist in `public/icons/`, pick the closest existing icon (e.g. `/icons/timer.svg`) and note the missing icon as a follow-up. The label and href are what matter functionally.

**Step 2: Commit and push**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "Add Settings link to sidebar"
git push
```

---

## Task 10: Verify on Vercel

This task runs against the live Vercel deployment (Michael tests there, not localhost).

**Step 1: Confirm the seed ran in production**

Connect to the production Postgres (or run the seed once with prod `POSTGRES_URL`) and check:
```sql
SELECT "clickupUserId", "addedBy" FROM "AllowedSender" ORDER BY "addedAt";
```
Expected: 5 rows for the originally hardcoded users.

**Step 2: Smoke-test the page**

In the browser on the Vercel deploy:
1. Visit `/settings`. Expect the list with all 5 seeded users and the n8n warning alert.
2. Click "Add sender", search for a non-allowed teammate, click them. Expect: their card appears at the top of the list, toast "Added".
3. Try adding the same person again: toast "Already added", no duplicate row.
4. On a delivery page, open the From dropdown without reloading: the new person should appear (Query invalidation).
5. Back on `/settings`, click X on the new person, confirm the dialog. They disappear from the list and from the From dropdown.

**Step 3: Document the outcome**

Reply with: which steps passed, which failed, and any UI rough edges (alignment, copy).

---

## Done criteria

- `AllowedSender` table exists in production Postgres with the original 5 users seeded.
- `/settings` page loads, lists allowed senders, allows add and remove.
- The delivery form's From dropdown reflects changes without a full reload.
- `field-options/route.ts` no longer contains the `ALLOWED_SENDERS` set.
- `npm test` passes; `npx tsc --noEmit` reports no errors.
- All commits pushed.
