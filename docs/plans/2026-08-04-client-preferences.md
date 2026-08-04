# Client Preferences Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let admins flag per-client access constraints (e.g. KeyBank can't open Google Docs) so the delivery editor shows a persistent warning banner and re-prompts with a soft override at send/schedule time when a blocked-domain review link is present.

**Architecture:** A `ClientPreference` Neon/Prisma table keyed by ClickUp folder id, managed in a new Settings section (mirrors the existing Allowed Senders CRUD). The matching preference is folded into the task-detail response and drives (1) a banner at the top of the editor and (2) a soft confirm dialog on Send/Schedule. Restrictions are stored as keys resolved to domains by a code-side map, unioned with a per-client custom-domain list. The feature degrades to a no-op if the DB is unavailable and never hard-blocks a send.

**Tech Stack:** Next.js 16 App Router, Prisma 7 + Postgres (Neon), React Query, Radix AlertDialog, Vitest.

**Design doc:** `docs/plans/2026-08-04-client-preferences-design.md`

**Conventions to mirror:**
- CRUD API: `src/app/api/settings/senders/route.ts` + `src/app/api/settings/senders/[clickupUserId]/route.ts`
- Settings UI: `src/components/settings/allowed-senders-section.tsx`
- Send-time confirm dialog: the `showLintWarning` `AlertDialog` in `src/components/delivery-form/send-bar.tsx`
- Migrations: this project uses `npx prisma db push` (no migrations dir). `npm run build` runs `prisma generate`.
- Tests: `npx vitest run`.

---

## Task 1: Prisma model + push + generate

**Files:**
- Modify: `prisma/schema.prisma` (append new model)

**Step 1: Add the model**

Append to `prisma/schema.prisma`:

```prisma
model ClientPreference {
  clientFolderId       String   @id
  clientName           String
  enabled              Boolean  @default(true)
  warningMessage       String   @db.Text
  destinationLink      String?
  restrictions         String[]
  customBlockedDomains String[]
  updatedBy            String
  updatedAt            DateTime @updatedAt

  @@index([updatedAt])
}
```

**Step 2: Push schema to the dev DB and regenerate the client**

Run: `npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema" + client regenerated.

(Note: `db push` targets whatever `POSTGRES_URL` in `.env.local` points at — currently the prod Neon DB `neon-delivery-latika`. The table is additive/empty, so this is safe. If a separate dev DB is ever introduced, push there instead.)

**Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(client-prefs): add ClientPreference model"
```

---

## Task 2: Core domain-matching library (TDD)

The pure logic: resolve a preference to a set of blocked domains, and test whether a URL is blocked. No DB, no React — fully unit-testable.

**Files:**
- Create: `src/lib/client-preferences.ts`
- Test: `src/lib/__tests__/client-preferences.test.ts`

**Step 1: Write the failing test**

Create `src/lib/__tests__/client-preferences.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  RESTRICTION_OPTIONS,
  resolveBlockedDomains,
  findBlockedLinks,
  type ClientPreferenceData,
} from "@/lib/client-preferences";

function pref(over: Partial<ClientPreferenceData> = {}): ClientPreferenceData {
  return {
    clientFolderId: "f1",
    clientName: "KeyBank",
    enabled: true,
    warningMessage: "KeyBank can't access Google Docs.",
    destinationLink: "https://app.box.com/folder/123",
    restrictions: ["google"],
    customBlockedDomains: [],
    ...over,
  };
}

describe("resolveBlockedDomains", () => {
  it("expands the google restriction to its domains", () => {
    expect(resolveBlockedDomains(pref())).toEqual(
      expect.arrayContaining(["docs.google.com", "drive.google.com"])
    );
  });

  it("unions restriction domains with custom domains", () => {
    const domains = resolveBlockedDomains(
      pref({ restrictions: ["google"], customBlockedDomains: ["wetransfer.com"] })
    );
    expect(domains).toEqual(
      expect.arrayContaining(["docs.google.com", "drive.google.com", "wetransfer.com"])
    );
  });

  it("returns nothing for a disabled preference", () => {
    expect(resolveBlockedDomains(pref({ enabled: false }))).toEqual([]);
  });

  it("dedupes and lowercases custom domains", () => {
    const domains = resolveBlockedDomains(
      pref({ restrictions: [], customBlockedDomains: ["Docs.Google.com", "docs.google.com"] })
    );
    expect(domains).toEqual(["docs.google.com"]);
  });
});

describe("findBlockedLinks", () => {
  const p = pref();

  it("flags a google docs link", () => {
    const hits = findBlockedLinks(p, ["https://docs.google.com/document/d/abc/edit"]);
    expect(hits).toEqual(["https://docs.google.com/document/d/abc/edit"]);
  });

  it("flags subdomains of a blocked domain", () => {
    const hits = findBlockedLinks(p, ["https://drive.google.com/file/d/xyz"]);
    expect(hits).toHaveLength(1);
  });

  it("does not flag an allowed link (Box)", () => {
    expect(findBlockedLinks(p, ["https://app.box.com/folder/123"])).toEqual([]);
  });

  it("ignores empty/invalid urls", () => {
    expect(findBlockedLinks(p, ["", "not a url", null as unknown as string])).toEqual([]);
  });

  it("flags nothing when preference is disabled", () => {
    expect(
      findBlockedLinks(pref({ enabled: false }), ["https://docs.google.com/x"])
    ).toEqual([]);
  });

  it("exposes google as a predefined restriction option", () => {
    expect(RESTRICTION_OPTIONS.map((o) => o.key)).toContain("google");
  });
});
```

**Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/client-preferences.test.ts`
Expected: FAIL (module not found / exports undefined).

**Step 3: Write the implementation**

Create `src/lib/client-preferences.ts`:

```typescript
export interface ClientPreferenceData {
  clientFolderId: string;
  clientName: string;
  enabled: boolean;
  warningMessage: string;
  destinationLink: string | null;
  restrictions: string[];
  customBlockedDomains: string[];
}

/**
 * Predefined restriction toggles shown as checkboxes in the Settings UI. Each
 * maps to the set of domains it blocks. Add a new predefined restriction by
 * adding an entry here + (nothing else — the UI renders from this list). No
 * schema migration needed.
 */
export const RESTRICTION_OPTIONS: Array<{
  key: string;
  label: string;
  domains: string[];
}> = [
  {
    key: "google",
    label: "Can't access Google Docs / Drive",
    domains: ["docs.google.com", "drive.google.com"],
  },
];

const RESTRICTION_BY_KEY = new Map(RESTRICTION_OPTIONS.map((o) => [o.key, o]));

function normalizeDomain(d: string): string {
  return d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

/** All domains this client blocks (restriction keys ∪ custom domains). Empty if disabled. */
export function resolveBlockedDomains(pref: ClientPreferenceData): string[] {
  if (!pref.enabled) return [];
  const set = new Set<string>();
  for (const key of pref.restrictions ?? []) {
    for (const d of RESTRICTION_BY_KEY.get(key)?.domains ?? []) set.add(d.toLowerCase());
  }
  for (const d of pref.customBlockedDomains ?? []) {
    const n = normalizeDomain(d);
    if (n) set.add(n);
  }
  return [...set];
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Returns the subset of `urls` that match this client's blocked domains. */
export function findBlockedLinks(
  pref: ClientPreferenceData,
  urls: Array<string | null | undefined>
): string[] {
  const blocked = resolveBlockedDomains(pref);
  if (blocked.length === 0) return [];
  const hits: string[] = [];
  for (const url of urls) {
    if (!url) continue;
    const host = hostOf(url);
    if (!host) continue;
    if (blocked.some((d) => host === d || host.endsWith(`.${d}`))) hits.push(url);
  }
  return hits;
}
```

**Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/__tests__/client-preferences.test.ts`
Expected: PASS (all cases).

**Step 5: Commit**

```bash
git add src/lib/client-preferences.ts src/lib/__tests__/client-preferences.test.ts
git commit -m "feat(client-prefs): domain-matching library"
```

---

## Task 3: CRUD + clients API

**Files:**
- Create: `src/app/api/settings/client-preferences/route.ts` (GET list, PUT upsert)
- Create: `src/app/api/settings/client-preferences/[folderId]/route.ts` (DELETE)
- Create: `src/app/api/settings/clients/route.ts` (client picker list)

**Step 1: List + upsert route**

Create `src/app/api/settings/client-preferences/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserEmail } from "@/lib/get-session-user";
import type { ClientPreferenceData } from "@/lib/client-preferences";

export async function GET() {
  try {
    const rows = await prisma.clientPreference.findMany({
      orderBy: { clientName: "asc" },
    });
    return NextResponse.json({ preferences: rows });
  } catch (error) {
    console.error("Failed to list client preferences:", error);
    return NextResponse.json({ preferences: [] }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<ClientPreferenceData>;
    const clientFolderId = String(body.clientFolderId ?? "").trim();
    const clientName = String(body.clientName ?? "").trim();
    if (!clientFolderId || !clientName) {
      return NextResponse.json(
        { error: "clientFolderId and clientName are required" },
        { status: 400 }
      );
    }
    const updatedBy = await getSessionUserEmail();
    const data = {
      clientName,
      enabled: body.enabled ?? true,
      warningMessage: String(body.warningMessage ?? "").trim(),
      destinationLink: body.destinationLink?.trim() || null,
      restrictions: Array.isArray(body.restrictions) ? body.restrictions : [],
      customBlockedDomains: Array.isArray(body.customBlockedDomains)
        ? body.customBlockedDomains.map((d) => d.trim()).filter(Boolean)
        : [],
      updatedBy,
    };
    const saved = await prisma.clientPreference.upsert({
      where: { clientFolderId },
      create: { clientFolderId, ...data },
      update: data,
    });
    return NextResponse.json({ preference: saved });
  } catch (error) {
    console.error("Failed to save client preference:", error);
    return NextResponse.json({ error: "Failed to save preference" }, { status: 500 });
  }
}
```

**Step 2: Delete route**

Create `src/app/api/settings/client-preferences/[folderId]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ folderId: string }> }
) {
  try {
    const { folderId } = await params;
    try {
      await prisma.clientPreference.delete({ where: { clientFolderId: folderId } });
    } catch (e) {
      if ((e as { code?: string })?.code === "P2025") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      throw e;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete client preference:", error);
    return NextResponse.json({ error: "Failed to delete preference" }, { status: 500 });
  }
}
```

**Step 3: Clients (folder) list route**

Create `src/app/api/settings/clients/route.ts` (reuses `getSpaceFolders`, which the dashboard already relies on):

```typescript
import { NextResponse } from "next/server";
import { getSpaceFolders, getFolderlessLists } from "@/lib/clickup";
import { SPACES } from "@/lib/custom-field-ids";

export async function GET() {
  try {
    const { folders } = await getSpaceFolders(SPACES.PROJECTS);
    const clients = folders
      .map((f) => ({ folderId: f.id, name: f.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ clients });
  } catch (error) {
    console.error("Failed to list clients:", error);
    return NextResponse.json({ clients: [] }, { status: 500 });
  }
}
```

(Confirm `getSpaceFolders` returns `{ folders: Array<{ id, name }> }` in `src/lib/clickup.ts`; adjust the shape if needed. `getFolderlessLists` import can be dropped if unused — folderless lists aren't clients.)

**Step 4: Manual smoke test**

Run: `npm run dev`, then in a browser/console:
`fetch('/api/settings/clients').then(r=>r.json()).then(console.log)`
Expected: `{ clients: [{ folderId, name }, ...] }` including "KeyBank".

**Step 5: Commit**

```bash
git add src/app/api/settings/client-preferences src/app/api/settings/clients
git commit -m "feat(client-prefs): CRUD + clients list API"
```

---

## Task 4: Fold the matching preference into task detail

**Files:**
- Modify: `src/lib/types.ts` (add `clientPreference` to the task-detail response type)
- Modify: `src/app/api/tasks/[taskId]/route.ts` (look up the preference by `folderId`, include it)

**Step 1: Extend the type**

In `src/lib/types.ts`, add to the task-detail response interface (the one that already holds `feedbackDeadline`, `revisionRoundOptions`, etc.):

```typescript
  clientPreference?: ClientPreferenceData | null;
```

Import the type at the top:

```typescript
import type { ClientPreferenceData } from "@/lib/client-preferences";
```

**Step 2: Look it up in the route**

In `src/app/api/tasks/[taskId]/route.ts`, after `task` is fetched (so `task.folder.id` is available) and before building the `result` object, add:

```typescript
    let clientPreference = null;
    try {
      clientPreference = await prisma.clientPreference.findUnique({
        where: { clientFolderId: task.folder.id },
      });
    } catch {
      clientPreference = null; // DB down → feature no-ops
    }
```

Add `clientPreference` to the returned `result` object.

**Step 3: Verify build**

Run: `npx next build`
Expected: EXIT 0.

**Step 4: Commit**

```bash
git add src/lib/types.ts "src/app/api/tasks/[taskId]/route.ts"
git commit -m "feat(client-prefs): include client preference in task detail"
```

---

## Task 5: Editor warning banner

**Files:**
- Create: `src/components/delivery-form/client-preference-banner.tsx`
- Modify: `src/components/delivery-form/delivery-form.tsx` (render near the top, above the form body)

**Step 1: Banner component**

Create `src/components/delivery-form/client-preference-banner.tsx`:

```tsx
"use client";

import { AlertTriangle, ExternalLink } from "lucide-react";
import type { ClientPreferenceData } from "@/lib/client-preferences";

export function ClientPreferenceBanner({
  preference,
}: {
  preference: ClientPreferenceData | null | undefined;
}) {
  if (!preference || !preference.enabled || !preference.warningMessage.trim()) {
    return null;
  }
  return (
    <div className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <div className="space-y-2">
        <p className="font-medium">{preference.clientName} — delivery note</p>
        <p className="text-muted-foreground whitespace-pre-line">
          {preference.warningMessage}
        </p>
        {preference.destinationLink && (
          <a
            href={preference.destinationLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-amber-600 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open {preference.clientName}&apos;s folder
          </a>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Render it**

In `src/components/delivery-form/delivery-form.tsx`, import the banner and render it at the very top of the returned editor JSX (inside the outer wrapper `<div className="space-y-4 pb-24">`, above the resend banner):

```tsx
<ClientPreferenceBanner preference={taskDetail.clientPreference} />
```

**Step 3: Verify build**

Run: `npx next build`
Expected: EXIT 0.

**Step 4: Commit**

```bash
git add src/components/delivery-form/client-preference-banner.tsx src/components/delivery-form/delivery-form.tsx
git commit -m "feat(client-prefs): editor warning banner"
```

---

## Task 6: Send/Schedule guardrail (soft re-prompt)

Gather the review-link URLs, run `findBlockedLinks`, and gate Send/Schedule behind a confirm dialog that always re-states the warning for a flagged client (escalated when a blocked link is detected). Mirror the existing `showLintWarning` AlertDialog in `send-bar.tsx`.

**Files:**
- Modify: `src/components/delivery-form/delivery-form.tsx` (collect review-link URLs, pass `clientPreference` + urls to SendBar)
- Modify: `src/components/delivery-form/send-bar.tsx` (add the confirm gate + dialog)

**Step 1 (TDD): test the URL-collection helper**

Add a tiny pure helper so the "which links do we check" logic is testable. In `src/lib/client-preferences.ts` add:

```typescript
/** All review-link URLs on a delivery (standard fields + extra links). */
export function collectReviewLinkUrls(
  reviewLinks: Record<string, string> | undefined,
  extraLinks: Array<{ url?: string }> | undefined
): string[] {
  return [
    ...Object.values(reviewLinks ?? {}),
    ...(extraLinks ?? []).map((l) => l.url ?? ""),
  ].filter((u): u is string => Boolean(u && u.trim()));
}
```

Add to `src/lib/__tests__/client-preferences.test.ts`:

```typescript
import { collectReviewLinkUrls } from "@/lib/client-preferences";

describe("collectReviewLinkUrls", () => {
  it("collects standard + extra link urls, dropping empties", () => {
    const urls = collectReviewLinkUrls(
      { googleDeliverableLink: "https://docs.google.com/x", frameReviewLink: "" },
      [{ url: "https://app.box.com/y" }, { url: "" }]
    );
    expect(urls).toEqual(["https://docs.google.com/x", "https://app.box.com/y"]);
  });
});
```

Run: `npx vitest run src/lib/__tests__/client-preferences.test.ts` — expected FAIL then, after adding the helper, PASS.

**Step 2: Compute blocked links in the form**

In `delivery-form.tsx`, near the recipient logic, compute:

```typescript
const clientPreference = taskDetail.clientPreference ?? null;
const blockedReviewLinks = clientPreference
  ? findBlockedLinks(clientPreference, collectReviewLinkUrls(reviewLinks, extraLinks))
  : [];
```

Import `findBlockedLinks`, `collectReviewLinkUrls` from `@/lib/client-preferences`. Pass `clientPreference` and `blockedReviewLinks` as props to `<SendBar ... />` (both the main and any addon render sites).

**Step 3: Add the confirm gate to SendBar**

In `send-bar.tsx`:
- Add props: `clientPreference?: ClientPreferenceData | null; blockedReviewLinks?: string[];`
- Add state: `const [showClientPrefConfirm, setShowClientPrefConfirm] = useState(false);`
- The Send button currently either sends or opens the lint warning. Insert the client-pref gate **first**: if `clientPreference?.enabled && clientPreference.warningMessage`, clicking Send opens `showClientPrefConfirm` instead of sending. Its "Send anyway" action then proceeds to the existing flow (lint check → send). Wire the same gate into the Schedule action.
- Add an AlertDialog modeled on the `showLintWarning` block:

```tsx
<AlertDialog open={showClientPrefConfirm} onOpenChange={setShowClientPrefConfirm}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        {clientPreference?.clientName} — before you send
      </AlertDialogTitle>
      <AlertDialogDescription asChild>
        <div className="space-y-2">
          <p className="whitespace-pre-line">{clientPreference?.warningMessage}</p>
          {blockedReviewLinks && blockedReviewLinks.length > 0 && (
            <p className="rounded bg-amber-500/10 px-2 py-1 font-medium text-amber-600">
              Heads up: this review link looks like one they can't open —{" "}
              {blockedReviewLinks[0]}
            </p>
          )}
          {clientPreference?.destinationLink && (
            <a
              href={clientPreference.destinationLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-amber-600 hover:underline"
            >
              Open {clientPreference.clientName}&apos;s folder
            </a>
          )}
        </div>
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Go back</AlertDialogCancel>
      <AlertDialogAction
        onClick={() => {
          setShowClientPrefConfirm(false);
          proceedAfterClientPref(); // continues to lint-check / send
        }}
      >
        Send anyway
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Refactor the current Send onClick into a `proceedAfterClientPref()` that runs the existing lint/send logic, so both the gated and ungated paths converge. Import `AlertTriangle` from `lucide-react` and `ClientPreferenceData` from `@/lib/client-preferences`.

**Step 4: Verify build + tests**

Run: `npx vitest run` then `npx next build`
Expected: tests PASS, build EXIT 0.

**Step 5: Commit**

```bash
git add src/components/delivery-form/delivery-form.tsx src/components/delivery-form/send-bar.tsx src/lib/client-preferences.ts src/lib/__tests__/client-preferences.test.ts
git commit -m "feat(client-prefs): soft send/schedule guardrail"
```

---

## Task 7: Settings management UI

**Files:**
- Create: `src/components/settings/client-preferences-section.tsx`
- Modify: `src/app/settings/page.tsx` (render the new section under Allowed Senders)

**Step 1: Build the section**

Create `src/components/settings/client-preferences-section.tsx`, mirroring `allowed-senders-section.tsx` (React Query `useQuery` for `GET /api/settings/client-preferences` and `GET /api/settings/clients`; `useMutation` for `PUT` and `DELETE /api/settings/client-preferences/[folderId]`; invalidate on success). The editor row/form must include:
- Client picker (select from `/api/settings/clients`; on pick, capture `folderId` + `name`).
- Enabled toggle (checkbox).
- Warning message (textarea).
- Destination link (url input, optional).
- Predefined restriction checkboxes rendered from `RESTRICTION_OPTIONS` (`import { RESTRICTION_OPTIONS } from "@/lib/client-preferences"`), storing checked keys into `restrictions`.
- An **Advanced** `<details>`/disclosure revealing a comma-or-newline editable custom-domain list bound to `customBlockedDomains`.
- Save (PUT) and Delete buttons; list existing preferences with an edit affordance.

Keep styling consistent with the Allowed Senders section (same card/border/spacing classes).

**Step 2: Render it**

In `src/app/settings/page.tsx`:

```tsx
import { ClientPreferencesSection } from "@/components/settings/client-preferences-section";
// ...
<AllowedSendersSection />
<ClientPreferencesSection />
```

**Step 3: Verify build**

Run: `npx next build`
Expected: EXIT 0.

**Step 4: Manual test (dev)**

Run: `npm run dev`. In Settings, add a preference for **KeyBank**: message = "KeyBank can't access Google Docs. Export as .docx and upload to their Box folder, then paste the Box link as the review link.", destination link = their Box folder URL, check "Can't access Google Docs / Drive". Save. Reload → it persists.

**Step 5: Commit**

```bash
git add src/components/settings/client-preferences-section.tsx src/app/settings/page.tsx
git commit -m "feat(client-prefs): Settings management UI"
```

---

## Task 8: End-to-end verification + push

**Step 1: Full suite + build**

Run: `npx vitest run` (expect all green) and `npx next build` (EXIT 0).

**Step 2: Manual E2E on dev**

- Open a KeyBank delivery → banner shows at the top with the Box link.
- Paste a `docs.google.com` link as the review link → click Send → confirm dialog appears, escalated with the blocked-link callout → "Go back" cancels; "Send anyway" proceeds.
- Open a non-flagged client's delivery → no banner, no dialog.

**Step 3: Push**

```bash
git push
```

**Step 4: Post-deploy (prod)**

- `prisma db push` already applied the table to the prod DB (Task 1). Confirm the Settings section loads on `delivery.consume-media.com`.
- Seed KeyBank in the live Settings UI if not already done.

---

## Notes / gotchas

- **DB-down safety:** every DB read (`findUnique` in task detail, list queries) is wrapped so failure yields `null`/empty — the banner and guardrail simply don't appear; sends are never blocked.
- **`db push` targets prod:** `.env.local`'s `POSTGRES_URL` points at the prod Neon DB. The `ClientPreference` table is additive and empty, so pushing is safe, but be deliberate.
- **Restriction extensibility:** to add a predefined checkbox later (e.g. Dropbox), add one entry to `RESTRICTION_OPTIONS` — the Settings checkboxes and the matcher both read from it; no schema change.
- **Addon deliveries:** the guardrail checks the primary delivery's review links; extend `collectReviewLinkUrls` to include `addonReviewLinks` if add-on links should also be checked (confirm with Michael — likely yes, cheap to add).
