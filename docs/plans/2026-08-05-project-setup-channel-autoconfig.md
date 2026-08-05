# Project Setup: Configure-from-Channel — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A "Configure from channel" wizard that derives a project's contacts (name + email + Slack user ID) and channel from its Slack channel and writes them to ClickUp, replacing manual entry — inside a renamed **Project Setup** tab that also hosts the existing health audit.

**Architecture:** Pure, tested libs rank channel candidates and match channel members to existing contacts. A Slack helper turns a channel into a people directory (`conversations.members` → `users.info` → name/email/user-ID/external). Setup APIs suggest channels, return matched people, and apply writes (create/update contacts + set channel + join bot) via existing ClickUp helpers, then re-scan. The Audit tab is renamed Project Setup; each Slack project launches a 3-step review-and-confirm wizard.

**Tech Stack:** Next.js 16 App Router, Prisma/Neon (audit cache already exists), React Query, Slack Web API, ClickUp API, Vitest.

**Design doc:** `docs/plans/2026-08-05-project-setup-channel-autoconfig-design.md`

**Verified anchors:**
- `createTask(listId, { name, custom_fields: [{id, value}] })` and `updateTaskCustomField(taskId, fieldId, value)` in `src/lib/clickup.ts`.
- Field IDs (`src/lib/custom-field-ids.ts`): `CUSTOM_FIELDS.PROJECT_TASK_TYPE`, `CONTACT_FIRST_NAME` (short_text), `CONTACT_EMAIL` (email), `SLACK_USER_ID` (short_text), `CONTACT_ROLE` (drop_down), `SLACK_DELIVERY_CHANNEL_ID`. Task-type option ids in `PROJECT_TASK_TYPES` (`PROJECT_CONTACT` = `0e2eb10c-…`, `SLACK_CHANNEL` = `17ca0f13-…`).
- CONTACT_ROLE dropdown option ids: **Primary** `91b18aff-3125-489b-b694-58597311020b`, **Standard** `5309f153-79f4-453f-b74f-cbb8d10bd7d0`, **Log** `cabd0435-f2d5-4de7-9449-2d182a9022ea`.
- Our Slack team id (external filter): `T03GRFC97` (from `auth.test`; resolve dynamically, fall back to this).
- Slack helpers live in `src/lib/slack-audit.ts` (`getChannelMembership`, `joinChannel`) using `SLACK_BOT_TOKEN`.
- Audit UI: `src/components/audit/audit-table.tsx`, page `src/app/audit/page.tsx`, nav `src/components/layout/sidebar.tsx`. Resolver: `src/lib/project-comms.ts` (`resolveProjectComms`). Scan/re-scan: `src/lib/audit-scan.ts` (`scanProject`).

Tests: `npx vitest run`. Build: `npx next build`.

---

## Task 1: Role constants + ClickUp contact/channel write helpers

**Files:**
- Modify: `src/lib/custom-field-ids.ts` (add `CONTACT_ROLES`)
- Create: `src/lib/project-write.ts`

**Step 1:** In `custom-field-ids.ts`, add:
```typescript
export const CONTACT_ROLES = {
  Primary: "91b18aff-3125-489b-b694-58597311020b",
  Standard: "5309f153-79f4-453f-b74f-cbb8d10bd7d0",
  Log: "cabd0435-f2d5-4de7-9449-2d182a9022ea",
} as const;
```

**Step 2:** Create `src/lib/project-write.ts`:
```typescript
import {
  createTask,
  updateTaskCustomField,
  getListTasks,
  extractCustomFieldValue,
} from "@/lib/clickup";
import { CUSTOM_FIELDS, PROJECT_TASK_TYPES, CONTACT_ROLES } from "@/lib/custom-field-ids";

export interface NewContact {
  name: string;
  email?: string;
  userId?: string;
  role: keyof typeof CONTACT_ROLES; // "Primary" | "Standard" | "Log"
}

/** Create a Project Contact task in the project list. */
export async function createProjectContact(listId: string, c: NewContact): Promise<string> {
  const custom_fields: Array<{ id: string; value: unknown }> = [
    { id: CUSTOM_FIELDS.PROJECT_TASK_TYPE, value: PROJECT_TASK_TYPES.PROJECT_CONTACT },
    { id: CUSTOM_FIELDS.CONTACT_FIRST_NAME, value: c.name },
    { id: CUSTOM_FIELDS.CONTACT_ROLE, value: CONTACT_ROLES[c.role] },
  ];
  if (c.email) custom_fields.push({ id: CUSTOM_FIELDS.CONTACT_EMAIL, value: c.email });
  if (c.userId) custom_fields.push({ id: CUSTOM_FIELDS.SLACK_USER_ID, value: c.userId });
  const task = await createTask(listId, { name: "Project Contact", custom_fields });
  return task.id;
}

/** Fill missing email / user ID on an existing contact task. */
export async function updateContactFields(
  taskId: string,
  fields: { email?: string; userId?: string }
): Promise<void> {
  if (fields.email) await updateTaskCustomField(taskId, CUSTOM_FIELDS.CONTACT_EMAIL, fields.email);
  if (fields.userId) await updateTaskCustomField(taskId, CUSTOM_FIELDS.SLACK_USER_ID, fields.userId);
}

/** Set the project's Slack delivery channel — updates the existing Slack Channel
 *  task, or creates one if none exists. */
export async function setSlackChannel(listId: string, channelId: string): Promise<void> {
  const { tasks } = await getListTasks(listId, true);
  const existing = tasks.find((t) => {
    const resolved = extractCustomFieldValue(t.custom_fields, CUSTOM_FIELDS.PROJECT_TASK_TYPE);
    const raw = t.custom_fields.find((f) => f.id === CUSTOM_FIELDS.PROJECT_TASK_TYPE)?.value;
    return resolved === "Slack Channel" || String(raw) === PROJECT_TASK_TYPES.SLACK_CHANNEL;
  });
  if (existing) {
    await updateTaskCustomField(existing.id, CUSTOM_FIELDS.SLACK_DELIVERY_CHANNEL_ID, channelId);
  } else {
    await createTask(listId, {
      name: "Slack Channel",
      custom_fields: [
        { id: CUSTOM_FIELDS.PROJECT_TASK_TYPE, value: PROJECT_TASK_TYPES.SLACK_CHANNEL },
        { id: CUSTOM_FIELDS.SLACK_DELIVERY_CHANNEL_ID, value: channelId },
      ],
    });
  }
}
```

**Step 3:** `npx next build` → EXIT 0. **Commit:** `feat(setup): ClickUp contact/channel write helpers`.

*(No unit test — thin I/O wrappers over tested helpers; exercised in Task 5 + E2E.)*

---

## Task 2: Channel ranking (pure, TDD)

**Files:** Create `src/lib/channel-suggest.ts` + `src/lib/__tests__/channel-suggest.test.ts`.

`rankChannels(clientName, contactNames, channels)` returns channels sorted by a
score = name-token overlap with the client name + count of `contactNames` that
appear in the channel's member display names. Signature:

```typescript
export interface ChannelCandidate {
  id: string;
  name: string;
  isMember: boolean;
  memberNames?: string[]; // display names, when known (for overlap scoring)
}
export function rankChannels(
  clientName: string,
  contactNames: string[],
  channels: ChannelCandidate[]
): Array<ChannelCandidate & { score: number }>;
```

Scoring (keep simple, documented):
- Normalize to lowercase tokens (split on non-alphanumerics); drop the token `consume`.
- `nameScore` = shared tokens between client name and channel name × 2.
- `overlapScore` = number of `contactNames` whose first token appears in any `memberNames`.
- `score = nameScore + overlapScore`. Sort desc; tie-break by name length asc.

Tests: "iterable-consume" ranks first for client "Iterable"; a channel containing
a known contact outranks a name-only match; empty inputs → empty. **Commit:**
`feat(setup): channel ranking`.

---

## Task 3: Member ↔ contact matcher (pure, TDD)

**Files:** Create `src/lib/channel-people.ts` + test.

```typescript
export interface SlackPerson { userId: string; name: string; email?: string; isExternal: boolean; }
export interface ExistingContact { taskId: string; name: string; email?: string; userId?: string; }
export interface MatchPlan {
  create: Array<{ name: string; email?: string; userId: string }>;
  update: Array<{ taskId: string; name: string; email?: string; userId?: string }>;
  ambiguous: SlackPerson[]; // matched >1 existing contact — surface for manual confirm
}
export function isExternalMember(teamId: string | undefined, ourTeamId: string): boolean; // teamId !== ourTeamId
export function matchMembersToContacts(people: SlackPerson[], existing: ExistingContact[]): MatchPlan;
```

Matching rules (only external people are passed in):
- Match to an existing contact by **email (case-insensitive)** first; else by **name** (normalized first-token, case-insensitive).
- 1 match → `update` with whichever of email/userId the existing contact is missing.
- 0 matches → `create`.
- >1 match → `ambiguous` (don't guess).
Tests: email match updates missing userId; name match when no email; new person → create; two existing "Dana"s → ambiguous; external filter. **Commit:** `feat(setup): member-contact matcher`.

---

## Task 4: Slack channel-people helper

**Files:** Modify `src/lib/slack-audit.ts`.

Add (uses `SLACK_BOT_TOKEN`, `users:read.email` scope confirmed working):
```typescript
export async function getOurTeamId(): Promise<string | null> {
  const r = await fetch(`${SLACK}/auth.test`, { headers: authHeader() });
  const d = await r.json();
  return d.ok ? d.team_id : null;
}

export interface ChannelPerson { userId: string; name: string; email?: string; teamId?: string; isBot: boolean; }
/** All members of a channel, resolved to name/email/team. */
export async function listChannelPeople(channelId: string): Promise<ChannelPerson[]> {
  const people: ChannelPerson[] = [];
  let cursor = "";
  for (let i = 0; i < 10; i++) {
    const params = new URLSearchParams({ channel: channelId, limit: "200" });
    if (cursor) params.set("cursor", cursor);
    const r = await fetch(`${SLACK}/conversations.members?${params}`, { headers: authHeader() });
    const d = await r.json();
    if (!d.ok) break;
    for (const uid of d.members as string[]) {
      const u = await (await fetch(`${SLACK}/users.info?user=${uid}`, { headers: authHeader() })).json();
      if (!u.ok) continue;
      people.push({
        userId: uid,
        name: u.user.profile?.real_name || u.user.name,
        email: u.user.profile?.email || undefined,
        teamId: u.user.team_id,
        isBot: !!u.user.is_bot,
      });
    }
    cursor = d.response_metadata?.next_cursor || "";
    if (!cursor) break;
  }
  return people;
}

/** Channels the bot can see (public + shared, joined or not) for suggestion. */
export async function listVisibleChannels(): Promise<Array<{ id: string; name: string; isMember: boolean; isPrivate: boolean }>> {
  const out: Array<{ id: string; name: string; isMember: boolean; isPrivate: boolean }> = [];
  let cursor = "";
  for (let i = 0; i < 20; i++) {
    const params = new URLSearchParams({ types: "public_channel,private_channel", exclude_archived: "true", limit: "200" });
    if (cursor) params.set("cursor", cursor);
    const d = await (await fetch(`${SLACK}/conversations.list?${params}`, { headers: authHeader() })).json();
    if (!d.ok) break;
    for (const c of d.channels) out.push({ id: c.id, name: c.name, isMember: !!c.is_member, isPrivate: !!c.is_private });
    cursor = d.response_metadata?.next_cursor || "";
    if (!cursor) break;
  }
  return out;
}
```
**Commit:** `feat(setup): slack channel-people + channel list helpers`.

---

## Task 5: Setup APIs

**Files:** Create `src/app/api/setup/channels/suggest/route.ts`, `src/app/api/setup/channel-people/route.ts`, `src/app/api/setup/apply/route.ts` (`export const maxDuration = 60`).

- **suggest** (`GET ?listId=`): resolve the project (`getListTasks` + `resolveProjectComms`) for client name (folder) + existing contact names; `listVisibleChannels()`; `rankChannels(...)`; return top ~8 `{ id, name, isMember, score }`. (Member-overlap scoring is optional in v1 — pass `memberNames: []`; name ranking is the primary signal.)
- **channel-people** (`GET ?channelId=&listId=`): `getOurTeamId()`; `listChannelPeople(channelId)`; keep `isExternalMember(p.teamId, ourTeamId) && !p.isBot`; map to `SlackPerson`; load existing contacts via `resolveProjectComms`; `matchMembersToContacts(...)`; return `{ people, plan }`.
- **apply** (`POST { listId, channelId?, join?, contacts:[{action:"create"|"update", taskId?, name, email?, userId, role}] }`): if `channelId` → `setSlackChannel(listId, channelId)`; if `join` → `joinChannel(channelId)`; for each contact, `createProjectContact` / `updateContactFields`, collecting per-item `{ ok, error? }`; then `scanProject({listId, clientName, projectName})` (look up names from the AuditResult row or folders); return `{ results }`. Per-item try/catch — one failure doesn't abort.

Verify `npx next build` EXIT 0; routes appear under `/api/setup/*`. **Commit:** `feat(setup): suggest / channel-people / apply APIs`.

---

## Task 6: Rename Audit → Project Setup (nav + page)

**Files:** Modify `src/components/layout/sidebar.tsx`, `src/app/audit/page.tsx` (or move to `src/app/project-setup/page.tsx`).

- Nav item label `Audit` → `Project Setup`, `href: "/project-setup"`. Create `src/app/project-setup/page.tsx` (move the audit page content; keep `/audit` as a redirect or update the single nav link). Page header: "Project Setup" + subtitle "Configure and monitor project communications." Render the existing `AuditTable` under a "Health" heading.
- Keep `AuditTable` as-is (it's the Health function). Build EXIT 0. **Commit:** `feat(setup): rename Audit tab to Project Setup`.

---

## Task 7: Configure-from-channel wizard

**Files:** Create `src/components/setup/configure-wizard.tsx`; wire a **Configure from channel** button into each Slack project row in `audit-table.tsx`.

A modal (mirror the AlertDialog/Dialog pattern already used) with 3 steps and React Query:
1. **Channel** — `useQuery(["setup-suggest", listId])` → ranked candidates; render each with name, "not joined" badge, select radio; a search box filters the list; "Confirm channel" advances.
2. **People** — `useQuery(["setup-people", channelId, listId])` → `{ people, plan }`; a checkbox list of external people (name · email · user ID) with a create/update tag and a role `<select>` (default **Standard**); ambiguous ones flagged "confirm which contact". 
3. **Apply** — summary ("create N, update M, set channel, join bot"); `useMutation` → `POST /api/setup/apply`; on success toast the per-item result, invalidate `["audit"]`, close.

Launch: on rows where `mode === "slack"`, a "Configure from channel" button opens the wizard with that `listId`. Build EXIT 0. **Commit:** `feat(setup): configure-from-channel wizard`.

---

## Task 8: E2E verification + push

- `npx vitest run` (all green) + `npx next build` (EXIT 0).
- Manual E2E: open Project Setup → a Slack project → Configure from channel → confirm the suggested channel (joins bot) → review external people (correct create/update + roles) → Apply → confirm ClickUp got the contacts + channel and the Health row re-scans green.
- Push.

---

## Notes / gotchas

- **Dropdown writes:** contact role + task-type are set with the **option id** (not orderindex) in `createTask` custom_fields — validated the option ids above.
- **Channel task:** the channel ID lives on a "Slack Channel" project task; `setSlackChannel` updates it or creates one.
- **External filter:** `teamId !== ourTeamId` (resolve `ourTeamId` via `auth.test`; fallback `T03GRFC97`), plus drop bots.
- **Private channels the bot isn't in** can't be listed — the wizard's search covers visible ones; add a note "not seeing it? invite `@n8n` and retry."
- **Handles/workflow:** not written; the n8n workflow is left running, unused.
- **Rate limits:** `listChannelPeople` does one `users.info` per member — fine for ~15-member channels; batch if a channel is huge.
- **Nothing writes before Apply.**
