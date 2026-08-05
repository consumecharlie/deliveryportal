# Project Communications Audit — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A cross-project audit console (`/audit`) that detects communication-config gaps per project (contacts, email-vs-Slack, Slack bot in channel, project plan link, template mapping) and offers one-click / guided fixes, served from a Neon on-demand cache.

**Architecture:** A pure, unit-tested audit **engine** evaluates a resolved project config into typed issues. A **scan** resolves every active project's config from ClickUp + Slack membership, runs the engine, and writes results to a Neon `AuditResult` cache (stale-while-revalidate, same pattern as `DashboardCache`). The `/audit` page reads the cache instantly with a Re-scan button; fix actions re-scan the affected project.

**Tech Stack:** Next.js 16 App Router, Prisma 7 + Neon, React Query, Slack Web API (`conversations.info` / `conversations.join`), n8n webhook, Vitest.

**Design doc:** `docs/plans/2026-08-05-comms-audit-design.md`

**Conventions to mirror:**
- Neon read-through cache: `src/app/api/tasks/route.ts` (DashboardCache + `after()` SWR)
- ClickUp sibling resolution: `src/app/api/projects/[listId]/detail/route.ts:68-115`
- Slack membership call: `src/app/api/slack/check-membership/route.ts`, channels: `src/app/api/slack/channels/route.ts` (`SLACK_BOT_TOKEN`, `conversations.info`)
- Project enumeration: `getSpaceFolders(SPACES.PROJECTS)` + `getFolderlessLists` in `src/lib/clickup.ts`; per-list tasks via `getListTasks(listId, true)`
- Field constants: `src/lib/custom-field-ids.ts` (`CUSTOM_FIELDS.*`, `PROJECT_TASK_TYPES.*`)
- Nav: `src/components/layout/sidebar.tsx` `navItems`
- Settings CRUD/query patterns: `src/components/settings/client-preferences-section.tsx`
- Migrations: `npx prisma db push` then `npx prisma generate`. Tests: `npx vitest run`.

---

## Task 0: Prerequisite — Find Slack ID webhook (manual / controller)

The "Run Slack user-ID sync" fix POSTs to the `Find Slack ID` n8n workflow
(`h8e33InXoUk2ExaR`), which currently has only schedule + manual triggers.

- Add a **Webhook trigger node** to that workflow (n8n UI or API) wired into the
  same entry point as the manual trigger, and note its production URL.
- Add env var `N8N_FIND_SLACK_ID_WEBHOOK_URL` to `.env.local` and Vercel.
- The fix action treats an unset URL as "sync not configured" (button disabled
  with a tooltip), so the rest of the feature ships without it.

*(Controller handles this; not a code task. If deferred, Task 6's sync button
degrades gracefully.)*

---

## Task 1: Audit engine (pure, TDD)

The core: given a resolved project config, return typed issues. No I/O.

**Files:**
- Create: `src/lib/comms-audit.ts`
- Test: `src/lib/__tests__/comms-audit.test.ts`

**Step 1: Write the failing test** — `src/lib/__tests__/comms-audit.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { auditProject, type ProjectCommsConfig } from "@/lib/comms-audit";

function base(over: Partial<ProjectCommsConfig> = {}): ProjectCommsConfig {
  return {
    listId: "L1",
    clientName: "Acme",
    projectName: "Acme Brand Video",
    contacts: [{ name: "Jane", email: "jane@acme.com", role: "Primary" }],
    slackChannelId: null,
    slackChannelName: null,
    botInChannel: null, // null = not applicable / unknown
    projectPlanLink: "https://clickup.com/plan",
    hasTemplateForDeliverable: true,
    ...over,
  };
}
const types = (cfg: ProjectCommsConfig) => auditProject(cfg).map((i) => i.type);

describe("mode inference", () => {
  it("is an email client when no contact has a Slack handle", () => {
    expect(auditProject(base()).find((i) => i.type === "no_slack_channel")).toBeUndefined();
  });
  it("is a Slack client when any contact has a Slack handle", () => {
    const cfg = base({
      contacts: [{ name: "Jane", email: "j@a.com", role: "Primary", slackHandle: "@jane" }],
    });
    expect(types(cfg)).toContain("no_slack_channel"); // slack client, channel missing
  });
});

describe("email-client checks", () => {
  it("flags a contact with no email", () => {
    const cfg = base({ contacts: [{ name: "Jane", email: "", role: "Primary" }] });
    expect(types(cfg)).toContain("contact_missing_email");
  });
});

describe("slack-client checks", () => {
  const slack = (over: Partial<ProjectCommsConfig> = {}) =>
    base({
      contacts: [{ name: "Jane", email: "j@a.com", role: "Primary", slackHandle: "@jane", slackUserId: "U1" }],
      slackChannelId: "C1",
      slackChannelName: "acme-consume",
      botInChannel: true,
      ...over,
    });

  it("is healthy when channel set, bot in channel, user IDs present", () => {
    expect(auditProject(slack())).toEqual([]);
  });
  it("flags missing Slack channel (the #1 gap)", () => {
    expect(types(slack({ slackChannelId: null, botInChannel: null }))).toContain("no_slack_channel");
  });
  it("flags bot not in channel", () => {
    expect(types(slack({ botInChannel: false }))).toContain("bot_not_in_channel");
  });
  it("flags a Slack contact with a handle but no user ID", () => {
    const cfg = slack({
      contacts: [{ name: "Jane", email: "j@a.com", role: "Primary", slackHandle: "@jane" }],
    });
    expect(types(cfg)).toContain("contact_missing_slack_user_id");
  });
});

describe("both modes", () => {
  it("flags no contacts", () => {
    expect(types(base({ contacts: [] }))).toContain("no_contacts");
  });
  it("flags no primary contact", () => {
    const cfg = base({ contacts: [{ name: "Jane", email: "j@a.com", role: "Standard" }] });
    expect(types(cfg)).toContain("no_primary_contact");
  });
  it("flags missing project plan link", () => {
    expect(types(base({ projectPlanLink: null }))).toContain("no_project_plan");
  });
  it("flags missing template mapping", () => {
    expect(types(base({ hasTemplateForDeliverable: false }))).toContain("no_template");
  });
  it("assigns blocker severity to a missing Slack channel", () => {
    const issue = auditProject(base({
      contacts: [{ name: "J", email: "j@a.com", role: "Primary", slackHandle: "@j" }],
    })).find((i) => i.type === "no_slack_channel");
    expect(issue?.severity).toBe("blocker");
  });
});
```

**Step 2: Run — expect FAIL** (`npx vitest run src/lib/__tests__/comms-audit.test.ts`).

**Step 3: Implement** — `src/lib/comms-audit.ts`:

```typescript
export interface AuditContact {
  name: string;
  email: string;
  role: string; // "Primary" | "Standard" | "Log"
  slackHandle?: string;
  slackUserId?: string;
}

export interface ProjectCommsConfig {
  listId: string;
  clientName: string;
  projectName: string;
  contacts: AuditContact[];
  slackChannelId: string | null;
  slackChannelName: string | null;
  /** true/false when a Slack channel is set and membership was checked; null otherwise. */
  botInChannel: boolean | null;
  projectPlanLink: string | null;
  hasTemplateForDeliverable: boolean;
}

export type AuditSeverity = "blocker" | "warning";

export type AuditIssueType =
  | "no_contacts"
  | "no_primary_contact"
  | "multiple_primary_contacts"
  | "contact_missing_email"
  | "no_slack_channel"
  | "bot_not_in_channel"
  | "contact_missing_slack_user_id"
  | "no_project_plan"
  | "no_template";

export interface AuditIssue {
  type: AuditIssueType;
  severity: AuditSeverity;
  message: string;
  /** Contact name(s) the issue is about, when per-contact. */
  detail?: string;
}

const NON_LOG = (c: AuditContact) => c.role !== "Log";

export function isSlackClient(contacts: AuditContact[]): boolean {
  return contacts.some((c) => NON_LOG(c) && !!c.slackHandle?.trim());
}

export function auditProject(cfg: ProjectCommsConfig): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const contacts = cfg.contacts.filter(NON_LOG);
  const slackClient = isSlackClient(cfg.contacts);

  // Both modes
  if (contacts.length === 0) {
    issues.push({ type: "no_contacts", severity: "blocker", message: "No project contacts configured." });
  } else {
    const primaries = contacts.filter((c) => c.role === "Primary");
    if (primaries.length === 0) {
      issues.push({ type: "no_primary_contact", severity: "blocker", message: "No Primary contact set." });
    } else if (primaries.length > 1) {
      issues.push({
        type: "multiple_primary_contacts",
        severity: "warning",
        message: `${primaries.length} Primary contacts — all will be addressed.`,
        detail: primaries.map((c) => c.name).join(", "),
      });
    }
  }
  if (!cfg.projectPlanLink) {
    issues.push({ type: "no_project_plan", severity: "warning", message: "No project plan link." });
  }
  if (!cfg.hasTemplateForDeliverable) {
    issues.push({ type: "no_template", severity: "warning", message: "No delivery template for this deliverable type." });
  }

  if (slackClient) {
    if (!cfg.slackChannelId) {
      issues.push({ type: "no_slack_channel", severity: "blocker", message: "Slack client, but no Slack delivery channel is set." });
    } else if (cfg.botInChannel === false) {
      issues.push({
        type: "bot_not_in_channel",
        severity: "blocker",
        message: `The n8n bot is not in #${cfg.slackChannelName ?? cfg.slackChannelId}.`,
      });
    }
    for (const c of contacts) {
      if (c.slackHandle?.trim() && !c.slackUserId?.trim()) {
        issues.push({
          type: "contact_missing_slack_user_id",
          severity: "blocker",
          message: `${c.name} has a Slack handle but no Slack user ID.`,
          detail: c.name,
        });
      }
    }
  } else {
    for (const c of contacts) {
      if (!c.email?.trim()) {
        issues.push({ type: "contact_missing_email", severity: "blocker", message: `${c.name} has no email address.`, detail: c.name });
      }
    }
  }

  return issues;
}
```

**Step 4: Run — expect PASS.** **Step 5: Commit** (`feat(audit): comms audit engine`).

---

## Task 2: Project comms resolver (TDD)

Resolve a ClickUp list's tasks into a `ProjectCommsConfig` (minus Slack
membership, added by the scan). Mirrors the detail route's sibling logic.

**Files:**
- Create: `src/lib/project-comms.ts`
- Test: `src/lib/__tests__/project-comms.test.ts`

**Behavior:** `resolveProjectComms(tasks: ClickUpTask[]): { contacts, slackChannelId, slackChannelName?, projectPlanLink, deliverableTypes: string[] }`.
- Walk tasks, matching `PROJECT_TASK_TYPES.PROJECT_CONTACT / SLACK_CHANNEL / PROJECT_PLAN` (by resolved name or raw option value, as the detail route does).
- Contacts: extract name/email/role/slackHandle/slackUserId via `extractCustomFieldValue` + `CUSTOM_FIELDS.*` (copy the block from detail route lines 74-90).
- `slackChannelId` from `CUSTOM_FIELDS.SLACK_DELIVERY_CHANNEL_ID`; `projectPlanLink` from `extractCustomFieldUrl(..., CUSTOM_FIELDS.PROJECT_PLAN_LINK)`.
- `deliverableTypes`: the set of `CUSTOM_FIELDS.DELIVERABLE_TYPE` values across Delivery Deadline tasks in the list (used later to check template mapping).

Test with hand-built `ClickUpTask` fixtures (custom_fields arrays) asserting a
Slack contact + channel resolve correctly, and an email-only contact resolves
with no channel. Import `CUSTOM_FIELDS` for the field ids in fixtures.

Commit: `feat(audit): project comms resolver`.

---

## Task 3: Slack membership + join helpers (TDD-light)

**Files:**
- Create: `src/lib/slack-audit.ts`

```typescript
const SLACK = "https://slack.com/api";
function authHeader() {
  return { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN ?? ""}` };
}

export interface ChannelMembership {
  channelId: string;
  name: string | null;
  isMember: boolean;
  isPrivate: boolean;
  /** true when Slack couldn't return the channel (e.g. private + bot not in). */
  notVisible: boolean;
}

export async function getChannelMembership(channelId: string): Promise<ChannelMembership> {
  const res = await fetch(`${SLACK}/conversations.info?channel=${encodeURIComponent(channelId)}`, {
    headers: authHeader(),
  });
  const data = await res.json();
  if (!data.ok) {
    // channel_not_found on a private channel the bot isn't in → not visible.
    return { channelId, name: null, isMember: false, isPrivate: false, notVisible: true };
  }
  return {
    channelId,
    name: data.channel?.name ?? null,
    isMember: data.channel?.is_member ?? false,
    isPrivate: data.channel?.is_private ?? false,
    notVisible: false,
  };
}

export async function joinChannel(channelId: string): Promise<{ ok: boolean; error?: string }> {
  // conversations.join only works for public channels (bot self-join).
  const res = await fetch(`${SLACK}/conversations.join`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ channel: channelId }),
  });
  const data = await res.json();
  return { ok: !!data.ok, error: data.ok ? undefined : data.error };
}
```

Optional focused test with a mocked `fetch` for the `notVisible` and `isMember`
mapping. Commit: `feat(audit): slack membership + join helpers`.

---

## Task 4: Neon AuditResult cache + scan + API

**Files:**
- Modify: `prisma/schema.prisma` (add model) → `npx prisma db push` → `npx prisma generate`
- Create: `src/lib/audit-scan.ts` (the sweep)
- Create: `src/app/api/audit/scan/route.ts` (POST full / `?listId=` single)
- Create: `src/app/api/audit/route.ts` (GET cached results)

**Model:**
```prisma
model AuditResult {
  listId       String   @id
  clientName   String
  projectName  String
  data         Json     // { config summary + issues + scannedAt }
  scannedAt    DateTime @updatedAt
}
```
(Per-project rows so a single-project re-scan updates just one row.)

**`audit-scan.ts`:**
- `scanProject(listId, clientName, projectName)`: `getListTasks(listId, true)` →
  `resolveProjectComms` → if `slackChannelId`, `getChannelMembership` →
  `hasTemplateForDeliverable` (does a Delivery Snippet template exist for the
  project's deliverable types — reuse `getListTasks(LISTS.DELIVERY_SNIPPETS,false)`
  once per sweep and match) → build `ProjectCommsConfig` → `auditProject` →
  upsert `AuditResult` row with `{ mode, slackChannelId, slackChannelName,
  botInChannel, isPrivate, issues }`. Wrap in try/catch; on failure store an
  `issues:[{type:"scan_failed",severity:"warning",...}]` marker so the row shows
  "couldn't check" rather than vanishing.
- `scanAllProjects()`: enumerate folders via `getSpaceFolders(SPACES.PROJECTS)` +
  `getFolderlessLists`, map to `{listId, clientName=folderName, projectName=listName}`,
  run `scanProject` in batches (BATCH ~8 to respect Slack/ClickUp limits).

**`/api/audit/scan` (POST):** `?listId=X` → `scanProject`; else `scanAllProjects`.
Returns `{ ok, scanned }`.

**`/api/audit` (GET):** read all `AuditResult` rows (DB-safe try/catch → `[]`),
return `{ results, lastScannedAt }`. No live fetch here — page reads cache.

Commit: `feat(audit): AuditResult cache, scan engine, audit API`.

---

## Task 5: Audit page + nav

**Files:**
- Create: `src/app/audit/page.tsx`
- Create: `src/components/audit/audit-table.tsx`
- Modify: `src/components/layout/sidebar.tsx` (add nav item)

**Nav:** add to `navItems` (after Analytics):
`{ href: "/audit", label: "Audit", icon: "/icons/rules.svg" }` (reuse an existing
icon; swap later).

**Page/table (client component, React Query):**
- `useQuery(["audit"], () => fetch("/api/audit").then(r=>r.json()))`.
- Header: last-scan timestamp + **Re-scan** button → `POST /api/audit/scan` then
  invalidate `["audit"]`. Show a spinner while scanning (it's a full sweep).
- Filter toggle "Only projects with issues" (default on).
- Table row per result: client / project, derived **mode** badge, a status pill
  (green ✓ Healthy / red "N blockers" / amber "N warnings" from issue severities),
  and Slack bot status when applicable. Expand → issue list, each with its Fix
  control (Task 6). Empty state when no scan yet: "No scan yet — run one."

Mirror styling/query patterns from `client-preferences-section.tsx`. Build must
pass (`npx next build`). Commit: `feat(audit): audit page + nav`.

---

## Task 6: Fix actions

**Files:**
- Create: `src/app/api/audit/fix/join-channel/route.ts` (POST `{channelId}` → `joinChannel`)
- Create: `src/app/api/audit/fix/sync-user-ids/route.ts` (POST → `fetch(process.env.N8N_FIND_SLACK_ID_WEBHOOK_URL)`; 501 if unset)
- Modify: `src/components/audit/audit-table.tsx` (wire Fix controls)

**Fix control per issue type:**
- `bot_not_in_channel` **and channel public** (`!isPrivate`) → **Join** button →
  `POST /api/audit/fix/join-channel` → on success `POST /api/audit/scan?listId=…`
  → invalidate `["audit"]`. If private/`notVisible` → render the channel name + a
  copyable `` `/invite @n8n` `` snippet instead of a button.
- `contact_missing_slack_user_id` → **Run Slack user-ID sync** →
  `POST /api/audit/fix/sync-user-ids` (once, top-level or per row) → toast "sync
  started; re-scan in a minute". Disabled with tooltip if the webhook env is unset.
- `no_slack_channel`, `no_primary_contact`, `contact_missing_email`,
  `no_project_plan` → **Open in ClickUp** link. Use the project/contact ClickUp
  URL: `https://app.clickup.com/t/<taskId>` (contact issues link the contact task;
  channel/plan issues link the list). Store the needed `taskId`s in the
  `AuditResult` `data` during the scan so the UI can build the link.

Each fix reports success/failure via `toast` and re-scans its project. Build +
tests green. Commit: `feat(audit): fix actions (join channel, sync user IDs, ClickUp links)`.

---

## Task 7: E2E verification + push

- `npx vitest run` (all green) + `npx next build` (EXIT 0).
- Manual E2E: open `/audit` → Re-scan → confirm KeyBank/Goldie-type rows show the
  expected issues; a public channel shows a working **Join**; an external channel
  shows the `/invite` snippet; ClickUp links open the right task.
- Confirm `AuditResult` rows are written (the `db push` applied the table to prod).
- `git push`. Seed nothing — the first Re-scan populates the cache.

---

## Notes / gotchas

- **DB-safe:** all cache reads/writes are try/caught; a scan failure marks a row,
  never breaks the page; sends are unaffected (this feature is read-only w.r.t.
  deliveries).
- **Rate limits:** batch the sweep (~8 concurrent) — ~30 projects × (ClickUp list
  + one Slack call) is fine batched; a full sweep is a few seconds.
- **Bot self-join** is public-only; the design already routes private/external to
  guided invite — do not attempt `conversations.join` on private channels.
- **Scan cost / Neon burn:** on-demand only (no cron), so negligible; keep-warm
  already holds Neon awake during business hours.
- **Template check** reuses the Delivery Snippets list already fetched elsewhere;
  fetch it once per sweep, not per project.
