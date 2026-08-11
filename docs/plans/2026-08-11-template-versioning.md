# Template Versioning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan task-by-task.

**Goal:** Add a "New Version" action to the template editor that creates a new delivery template from the current one for a target deliverable type (V2 / V3 / Final), auto-creating the deliverable-type dropdown option in ClickUp when it doesn't already exist.

**Architecture:** A pure name-derivation helper proposes the target deliverable-type name (rewriting the source's version token in place). A guarded ClickUp v3 helper appends a new option to the `DELIVERABLE_TYPE` dropdown with a back-up → append-only → verify → restore-on-mismatch protocol (the one hazardous op). A new API route copies the source template's snippet/subject/department into a new task in the Delivery Snippets list, tagged to the target type. A modal on the template detail page drives the flow with a live "type exists / will create" indicator.

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, TanStack Query, Shadcn/ui (Dialog), Vitest, ClickUp API v2 (read/create/set) + v3 (field option PUT).

**Naming note (disambiguation):** The detail page already has a "Version History" feature — edit-snapshots of a *single* template task, backed by the `TemplateVersion` Prisma model. THIS feature is unrelated: it spins off a *new* template task for a *new deliverable type*. Keep them distinct in code and copy. The user-facing button label ("New Version") is flagged as an open confirmation item in the design; default to "New Version" but the controller should confirm with Michael before finalizing copy.

**Reference:** Design doc at `docs/plans/2026-08-11-template-versioning-design.md`.

---

## ⚠️ Controller-only hazardous step (Task 2, do NOT delegate blindly)

Adding a `DELIVERABLE_TYPE` option requires a full-config `PUT` of the entire field (v3 endpoint `/api/v3/workspaces/{team}/fields/{fieldId}` allows only `PUT`; no add-option endpoint exists). A bad write corrupts every project's deliverable type. The exact v3 PUT body is NOT yet confirmed. **Task 2a is a controller-run validation spike (idempotent PUT + verify) against prod with the field backed up — run it yourself, watching output, before any real append.** Do not let a subagent perform live PUTs to that field until 2a has confirmed the exact body shape and the verify passes.

---

### Task 1: Name-derivation helper

**Files:**
- Create: `src/lib/template-version.ts`
- Test: `src/lib/__tests__/template-version.test.ts`

**Step 1: Write the failing tests**

```ts
// src/lib/__tests__/template-version.test.ts
import { describe, it, expect } from "vitest";
import { deriveVersionName } from "@/lib/template-version";

describe("deriveVersionName", () => {
  it("appends when the source has no version token", () => {
    expect(deriveVersionName("Generative Stills", "V2")).toBe("Generative Stills V2");
    expect(deriveVersionName("Generative Stills", "Final")).toBe("Generative Stills Final");
  });

  it("replaces an existing V-number token in place", () => {
    expect(deriveVersionName("Storyboards V1", "V2")).toBe("Storyboards V2");
    expect(deriveVersionName("Storyboards V1", "Final")).toBe("Storyboards Final");
    expect(deriveVersionName("Storyboards V2", "V3")).toBe("Storyboards V3");
  });

  it("replaces a 'Final' token in place", () => {
    expect(deriveVersionName("Storyboards Final", "V2")).toBe("Storyboards V2");
  });

  it("preserves a trailing suffix after the version token", () => {
    expect(deriveVersionName("AV Script V1 + Loom", "V2")).toBe("AV Script V2 + Loom");
    expect(deriveVersionName("Storyboards V1 + Loom & Animatic", "Final")).toBe(
      "Storyboards Final + Loom & Animatic"
    );
  });

  it("is case-insensitive when matching the source token", () => {
    expect(deriveVersionName("Storyboards v1", "V2")).toBe("Storyboards V2");
    expect(deriveVersionName("Storyboards final", "V2")).toBe("Storyboards V2");
  });

  it("only replaces the first version token", () => {
    // pathological, but must be deterministic
    expect(deriveVersionName("V1 Draft V1", "V2")).toBe("V2 Draft V1");
  });

  it("trims and collapses whitespace it introduces", () => {
    expect(deriveVersionName("Generative Stills ", "V2")).toBe("Generative Stills V2");
  });
});
```

**Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/template-version.test.ts`
Expected: FAIL — `deriveVersionName` is not defined.

**Step 3: Implement the minimal helper**

```ts
// src/lib/template-version.ts

/** Matches the first version token in a deliverable-type name: `V1`, `v12`, or `Final`. */
const VERSION_TOKEN = /\bV\d+\b|\bFinal\b/i;

/**
 * Propose a target deliverable-type name for a new version.
 *
 * If the source name already carries a version token (`V\d+` or `Final`),
 * that token is replaced IN PLACE with `targetLabel`, preserving any surrounding
 * text (e.g. a trailing `+ Loom`). Otherwise `targetLabel` is appended.
 *
 * The result is always shown to the user in an editable field before commit, so
 * this only needs to be right for the common cases — messy names get hand-fixed.
 */
export function deriveVersionName(sourceName: string, targetLabel: string): string {
  const src = sourceName.trim();
  const out = VERSION_TOKEN.test(src)
    ? src.replace(VERSION_TOKEN, targetLabel)
    : `${src} ${targetLabel}`;
  return out.replace(/\s+/g, " ").trim();
}
```

**Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/__tests__/template-version.test.ts`
Expected: PASS (all cases).

**Step 5: Commit**

```bash
git add src/lib/template-version.ts src/lib/__tests__/template-version.test.ts
git commit -m "feat: deriveVersionName helper for template versioning"
```

---

### Task 2a: Validate the v3 field-PUT body (controller-run spike)

**Files:**
- Create: `scripts/validate-field-put.mjs` (throwaway; deleted or kept as a documented probe)

**Purpose:** Discover and confirm the exact v3 `PUT` body for the `DELIVERABLE_TYPE` field WITHOUT changing it — an idempotent PUT of the current options, then verify nothing changed. This de-risks Task 2b. **Run manually by the controller against prod, with the field's current options logged as a backup first.**

**Step 1: Write the probe script**

```js
// scripts/validate-field-put.mjs
import fs from "fs";
const g = (k) => {
  const m = fs.readFileSync(".env.local", "utf8").match(new RegExp("^" + k + "=(.*)$", "m"));
  return m ? m[1].replace(/^"|"$/g, "").trim() : "";
};
const CU = g("CLICKUP_API_TOKEN");
const TEAM = g("CLICKUP_WORKSPACE_ID") || "9010023164";
const FIELD = "bd34f878-d41d-416e-92c4-7d6d5b378442"; // DELIVERABLE_TYPE
const LIST = "901312119609"; // DELIVERY_SNIPPETS
const H = { Authorization: CU, "Content-Type": "application/json" };

// 1. READ current options via v2 (source of truth + backup)
const listRes = await fetch(`https://api.clickup.com/api/v2/list/${LIST}/field`, { headers: H }).then((r) => r.json());
const field = listRes.fields.find((f) => f.id === FIELD);
const options = field.type_config.options; // [{id, name, orderindex, color}, ...]
fs.writeFileSync("scratch-field-backup.json", JSON.stringify(options, null, 2));
console.log("BACKUP written. option count =", options.length);

// 2. Idempotent v3 PUT — send the SAME options back, unchanged.
//    Try the most likely body shape; adjust from the error if it 400s.
const putBody = {
  name: field.name,
  type_config: {
    options: options.map((o) => ({ id: o.id, name: o.name, color: o.color ?? null, orderindex: o.orderindex })),
  },
};
const put = await fetch(`https://api.clickup.com/api/v3/workspaces/${TEAM}/fields/${FIELD}`, {
  method: "PUT",
  headers: H,
  body: JSON.stringify(putBody),
});
console.log("PUT status:", put.status, (await put.text()).slice(0, 300).replace(/\n/g, " "));

// 3. RE-READ and verify identical
const after = (await fetch(`https://api.clickup.com/api/v2/list/${LIST}/field`, { headers: H }).then((r) => r.json())).fields.find((f) => f.id === FIELD).type_config.options;
const same = after.length === options.length && after.every((o, i) =>
  o.id === options[i].id && o.name === options[i].name && String(o.orderindex) === String(options[i].orderindex));
console.log("VERIFY unchanged:", same, "| after count =", after.length);
if (!same) console.log("MISMATCH — inspect scratch-field-backup.json and restore if needed.");
```

**Step 2: Run manually (controller), read output carefully**

Run: `node scripts/validate-field-put.mjs`
Expected outcomes:
- If `PUT status: 200` and `VERIFY unchanged: true` → the body shape is confirmed. Record the confirmed shape in Task 2b.
- If `PUT status: 400/4xx` → the field is untouched (safe). Read the error body, adjust `putBody` shape (common variants: options without `orderindex`; wrapping under `type_config` vs top-level `options`; `label` vs `name`), and re-run until `200 + unchanged`.
- If `VERIFY unchanged: false` → STOP. Restore from `scratch-field-backup.json` by PUTting it back, and do not proceed to Task 2b until the shape is understood.

**Step 3: Record the confirmed body shape**

Update Task 2b's `appendDeliverableTypeOption` to use the exact shape confirmed here. Commit the probe script for provenance:

```bash
git add scripts/validate-field-put.mjs
git commit -m "chore: v3 field-PUT validation probe for template versioning"
```

---

### Task 2b: Guarded `appendDeliverableTypeOption` helper

**Files:**
- Modify: `src/lib/clickup.ts` (add a v3 fetch helper + the append function)
- Test: `src/lib/__tests__/clickup-append-option.test.ts` (pure-logic verification only; no live PUT)

Use the body shape confirmed in Task 2a. The function must: back up current options, PUT append-only, re-read, verify every original option intact + new present, restore + throw on any mismatch.

**Step 1: Write the failing test for the verify/build logic**

Extract the pure pieces so they can be unit-tested without hitting the network. Add to `template-version.ts` (pure) and test there:

```ts
// add to src/lib/__tests__/template-version.test.ts
import { buildAppendedOptions, verifyOptionsUnchanged } from "@/lib/template-version";

describe("buildAppendedOptions", () => {
  it("appends a new option after the highest orderindex, preserving originals", () => {
    const existing = [
      { id: "a", name: "Alpha", orderindex: 0, color: null },
      { id: "b", name: "Beta", orderindex: 1, color: null },
    ];
    const result = buildAppendedOptions(existing, "Gamma");
    expect(result.slice(0, 2)).toEqual(existing);
    expect(result[2].name).toBe("Gamma");
    expect(result[2].orderindex).toBe(2);
  });
});

describe("verifyOptionsUnchanged", () => {
  const before = [
    { id: "a", name: "Alpha", orderindex: 0 },
    { id: "b", name: "Beta", orderindex: 1 },
  ];
  it("passes when every original id/name/orderindex is intact and the new name is present", () => {
    const after = [...before, { id: "c", name: "Gamma", orderindex: 2 }];
    expect(verifyOptionsUnchanged(before, after, "Gamma")).toBe(true);
  });
  it("fails when an original option's orderindex shifted", () => {
    const after = [
      { id: "a", name: "Alpha", orderindex: 1 },
      { id: "b", name: "Beta", orderindex: 0 },
      { id: "c", name: "Gamma", orderindex: 2 },
    ];
    expect(verifyOptionsUnchanged(before, after, "Gamma")).toBe(false);
  });
  it("fails when the new option is absent", () => {
    expect(verifyOptionsUnchanged(before, before, "Gamma")).toBe(false);
  });
});
```

**Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/template-version.test.ts`
Expected: FAIL — `buildAppendedOptions` / `verifyOptionsUnchanged` not defined.

**Step 3: Implement the pure helpers in `template-version.ts`**

```ts
export interface DropdownOption {
  id: string;
  name: string;
  orderindex: number;
  color?: string | null;
}

/** Append a new option after the current max orderindex, leaving originals byte-for-byte. */
export function buildAppendedOptions(existing: DropdownOption[], newName: string): DropdownOption[] {
  const maxIdx = existing.reduce((m, o) => Math.max(m, o.orderindex), -1);
  return [...existing, { id: "", name: newName, orderindex: maxIdx + 1, color: null }];
}

/** True iff every `before` option is intact (id/name/orderindex) in `after` and `newName` is present. */
export function verifyOptionsUnchanged(
  before: Array<Pick<DropdownOption, "id" | "name" | "orderindex">>,
  after: Array<Pick<DropdownOption, "id" | "name" | "orderindex">>,
  newName: string
): boolean {
  const byId = new Map(after.map((o) => [o.id, o]));
  const allIntact = before.every((b) => {
    const a = byId.get(b.id);
    return a && a.name === b.name && String(a.orderindex) === String(b.orderindex);
  });
  const newPresent = after.some((o) => o.name.trim().toLowerCase() === newName.trim().toLowerCase());
  return allIntact && newPresent;
}
```

**Step 4: Run to verify pure helpers pass**

Run: `npx vitest run src/lib/__tests__/template-version.test.ts`
Expected: PASS.

**Step 5: Implement the network wrapper in `clickup.ts` (no unit test; guarded at runtime)**

Add near the other field helpers. Use the confirmed Task 2a body shape.

```ts
const CLICKUP_API_V3 = "https://api.clickup.com/api/v3";

async function clickupFetchV3<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${CLICKUP_API_V3}${endpoint}`, {
    ...options,
    headers: { Authorization: getToken(), "Content-Type": "application/json", ...options.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ClickUp v3 error ${res.status}: ${res.statusText} - ${body}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Append a single option to a drop_down custom field, safely.
 *
 * The only ClickUp endpoint that can add an option is a full-config v3 PUT of the
 * whole field, so this is guarded: back up current options, PUT append-only,
 * re-read, verify every original is intact and the new one is present, and
 * restore + throw on any mismatch. Returns the new option's orderindex (as the
 * string value used by updateTaskCustomField).
 *
 * @param listId  a list the field is attached to (used only to read options via v2)
 */
export async function appendDeliverableTypeOption(
  listId: string,
  fieldId: string,
  newName: string
): Promise<string> {
  const { buildAppendedOptions, verifyOptionsUnchanged } = await import("./template-version");

  const readOptions = async () => {
    const { fields } = await getListFields(listId);
    const field = fields.find((f) => f.id === fieldId);
    if (!field?.type_config?.options) throw new Error(`Field ${fieldId} has no options`);
    return field.type_config.options as Array<{ id: string; name: string; orderindex: number; color?: string | null }>;
  };

  const before = await readOptions();
  if (before.some((o) => o.name.trim().toLowerCase() === newName.trim().toLowerCase())) {
    // Already exists (race) — just resolve its orderindex.
    const existing = before.find((o) => o.name.trim().toLowerCase() === newName.trim().toLowerCase())!;
    return String(existing.orderindex);
  }

  const appended = buildAppendedOptions(before, newName);
  // NOTE: exact body shape confirmed in Task 2a — update if 2a differed.
  const putBody = {
    type_config: {
      options: appended.map((o) => ({ ...(o.id ? { id: o.id } : {}), name: o.name, color: o.color ?? null, orderindex: o.orderindex })),
    },
  };

  const workspace = WORKSPACE_ID;
  await clickupFetchV3(`/workspaces/${workspace}/fields/${fieldId}`, {
    method: "PUT",
    body: JSON.stringify(putBody),
  });

  const after = await readOptions();
  if (!verifyOptionsUnchanged(before, after, newName)) {
    // Restore originals, then abort — never proceed against a corrupted field.
    await clickupFetchV3(`/workspaces/${workspace}/fields/${fieldId}`, {
      method: "PUT",
      body: JSON.stringify({ type_config: { options: before.map((o) => ({ id: o.id, name: o.name, color: o.color ?? null, orderindex: o.orderindex })) } }),
    });
    throw new Error(`Option append verification failed for "${newName}"; field restored.`);
  }

  const created = after.find((o) => o.name.trim().toLowerCase() === newName.trim().toLowerCase())!;
  return String(created.orderindex);
}
```

Import `WORKSPACE_ID` from `./custom-field-ids` at the top of `clickup.ts` if not already imported.

**Step 6: Run the full unit suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS / no type errors.

**Step 7: Commit**

```bash
git add src/lib/clickup.ts src/lib/template-version.ts src/lib/__tests__/template-version.test.ts
git commit -m "feat: guarded appendDeliverableTypeOption (v3 append + verify + restore)"
```

---

### Task 3: `POST /api/templates/version` route

**Files:**
- Create: `src/app/api/templates/version/route.ts`
- Reference: `src/app/api/templates/create/route.ts` (mirror its dropdown-resolve pattern)

**Behavior:** Input `{ snippet, subjectLine, department, deliverableType }` where `deliverableType` is the confirmed target name. Steps:
1. Validate `deliverableType` non-empty (400 if not).
2. Collision check: `getListTasks(LISTS.DELIVERY_SNIPPETS, true)` → if any task `name` equals the target (case-insensitive, trimmed), return `409 { error, existingTaskId }`.
3. Resolve the `DELIVERABLE_TYPE` option orderindex via `getListFields`. If missing, call `appendDeliverableTypeOption(LISTS.DELIVERY_SNIPPETS, TEMPLATE_FIELDS.DELIVERABLE_TYPE, deliverableType)` to create it and get the orderindex.
4. `createTask(LISTS.DELIVERY_SNIPPETS, { name: deliverableType, custom_fields: [snippet, subjectLine text fields] })`.
5. Set `DELIVERABLE_TYPE` (resolved orderindex) and, if `department` resolves, `DEPARTMENT` via `updateTaskCustomField`.
6. Return `{ success: true, taskId, name, createdType: <bool> }`.

**Step 1: Write the route**

```ts
// src/app/api/templates/version/route.ts
import { NextResponse } from "next/server";
import {
  createTask,
  getListFields,
  getListTasks,
  updateTaskCustomField,
  appendDeliverableTypeOption,
} from "@/lib/clickup";
import { LISTS, TEMPLATE_FIELDS } from "@/lib/custom-field-ids";

export async function POST(req: Request) {
  try {
    const { snippet, subjectLine, department, deliverableType } = await req.json();
    const dt = typeof deliverableType === "string" ? deliverableType.trim() : "";
    if (!dt) {
      return NextResponse.json({ error: "deliverableType is required" }, { status: 400 });
    }

    // Collision: a template task for this type already exists.
    const { tasks } = await getListTasks(LISTS.DELIVERY_SNIPPETS, true);
    const clash = tasks.find((t) => t.name.trim().toLowerCase() === dt.toLowerCase());
    if (clash) {
      return NextResponse.json(
        { error: `A template named "${dt}" already exists.`, existingTaskId: clash.id },
        { status: 409 }
      );
    }

    // Resolve (or create) the deliverable-type dropdown option.
    const { fields } = await getListFields(LISTS.DELIVERY_SNIPPETS);
    const dtField = fields.find((f) => f.id === TEMPLATE_FIELDS.DELIVERABLE_TYPE);
    const existingOpt = dtField?.type_config?.options?.find(
      (o) => (o.name ?? o.label) === dt
    );
    let dtOrderIndex: string;
    let createdType = false;
    if (existingOpt) {
      dtOrderIndex = String(existingOpt.orderindex);
    } else {
      dtOrderIndex = await appendDeliverableTypeOption(
        LISTS.DELIVERY_SNIPPETS,
        TEMPLATE_FIELDS.DELIVERABLE_TYPE,
        dt
      );
      createdType = true;
    }

    // Create the task with the copied text fields.
    const customFields: Array<{ id: string; value: unknown }> = [];
    if (snippet) customFields.push({ id: TEMPLATE_FIELDS.DELIVERY_SNIPPET, value: snippet });
    if (subjectLine) customFields.push({ id: TEMPLATE_FIELDS.DELIVERY_SUBJECT_LINE, value: subjectLine });
    const newTask = await createTask(LISTS.DELIVERY_SNIPPETS, { name: dt, custom_fields: customFields });

    // Set the dropdowns.
    await updateTaskCustomField(newTask.id, TEMPLATE_FIELDS.DELIVERABLE_TYPE, dtOrderIndex);
    if (department) {
      const deptField = fields.find((f) => f.id === TEMPLATE_FIELDS.DEPARTMENT);
      const deptOpt = deptField?.type_config?.options?.find((o) => (o.name ?? o.label) === department);
      if (deptOpt) {
        await updateTaskCustomField(newTask.id, TEMPLATE_FIELDS.DEPARTMENT, String(deptOpt.orderindex));
      }
    }

    return NextResponse.json({ success: true, taskId: newTask.id, name: newTask.name, createdType });
  } catch (error) {
    console.error("Failed to create template version:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create template version" },
      { status: 500 }
    );
  }
}
```

**Step 2: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: no errors. (If `getListFields` option typing complains about `label`, mirror the cast used in `create/route.ts`.)

**Step 3: Commit**

```bash
git add src/app/api/templates/version/route.ts
git commit -m "feat: POST /api/templates/version — spin off a new-version template"
```

---

### Task 4: "New Version" modal on the template detail page

**Files:**
- Modify: `src/app/templates/[taskId]/page.tsx`
- Create: `src/components/templates/new-version-dialog.tsx`

**Behavior:** A "New Version" button in the header (next to History/Save). Opens a Dialog:
- Segmented choice: `V2` / `V3` / `Final`, plus a free-text input for anything else. Selecting one calls `deriveVersionName(templateName, label)` and fills an editable "Target name" input.
- Editable target-name input (user can fix `+ Loom` oddities).
- Live indicator computed from the already-loaded `fieldOptions.deliverableType`: if some option name equals the target (case-insensitive), show "Type exists"; else "Will create new deliverable type" (subtle amber).
- Primary button "Create version" → POST `/api/templates/version` with `{ snippet, subjectLine, department, deliverableType: targetName }` (all from current page state).
  - On success: `toast.success`, then `router.push(\`/templates/${data.taskId}\`)`.
  - On 409: `toast.error` with a "Open existing" action that pushes to `/templates/${existingTaskId}`.

**Step 1: Create the dialog component**

```tsx
// src/components/templates/new-version-dialog.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, GitBranch, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { deriveVersionName } from "@/lib/template-version";

const LABELS = ["V2", "V3", "Final"] as const;

export function NewVersionDialog({
  open, onOpenChange, sourceName, snippet, subjectLine, department, existingTypeNames,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceName: string;
  snippet: string;
  subjectLine: string;
  department: string;
  existingTypeNames: string[];
}) {
  const router = useRouter();
  const [targetName, setTargetName] = useState("");
  const [custom, setCustom] = useState("");

  // Default to a sensible first proposal when the dialog opens.
  useEffect(() => {
    if (open) { setCustom(""); setTargetName(deriveVersionName(sourceName, "V2")); }
  }, [open, sourceName]);

  const typeExists = existingTypeNames.some(
    (n) => n.trim().toLowerCase() === targetName.trim().toLowerCase()
  );

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/templates/version", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snippet, subjectLine, department, deliverableType: targetName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.error || "Failed"), { data });
      return data as { taskId: string; createdType: boolean };
    },
    onSuccess: (data) => {
      onOpenChange(false);
      toast.success("New version created", {
        description: data.createdType ? "New deliverable type added in ClickUp." : undefined,
      });
      router.push(`/templates/${data.taskId}`);
    },
    onError: (err: Error & { data?: { existingTaskId?: string } }) => {
      const existingTaskId = err.data?.existingTaskId;
      toast.error(err.message, existingTaskId ? {
        action: { label: "Open existing", onClick: () => router.push(`/templates/${existingTaskId}`) },
      } : undefined);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" /> New Version
          </DialogTitle>
          <DialogDescription>
            Create a new template from “{sourceName}”. Pick a version, confirm the name, and it’s copied for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            {LABELS.map((l) => (
              <Button
                key={l}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setCustom(""); setTargetName(deriveVersionName(sourceName, l)); }}
              >
                {l}
              </Button>
            ))}
            <Input
              value={custom}
              placeholder="Other…"
              className="h-8 w-24"
              onChange={(e) => {
                setCustom(e.target.value);
                if (e.target.value.trim()) setTargetName(deriveVersionName(sourceName, e.target.value.trim()));
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Target deliverable type</Label>
            <Input value={targetName} onChange={(e) => setTargetName(e.target.value)} />
            <p className={cn("flex items-center gap-1.5 text-xs",
              typeExists ? "text-muted-foreground" : "text-amber-600")}>
              {typeExists
                ? (<><Check className="h-3 w-3" /> Type exists — the template will be tagged to it.</>)
                : (<><AlertTriangle className="h-3 w-3" /> Will create a new deliverable type in ClickUp.</>)}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || targetName.trim() === "" ||
              targetName.trim().toLowerCase() === sourceName.trim().toLowerCase()}
          >
            {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitBranch className="mr-2 h-4 w-4" />}
            Create version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Wire the button + dialog into the detail page**

In `src/app/templates/[taskId]/page.tsx`:
- Add `const [newVersionOpen, setNewVersionOpen] = useState(false);` alongside the other state.
- Add the button in the header actions (near History), e.g. before the History button:

```tsx
<Button variant="outline" size="sm" onClick={() => setNewVersionOpen(true)}>
  <GitBranch className="mr-1 h-4 w-4" />
  New Version
</Button>
```

- Import `GitBranch` from `lucide-react` and `NewVersionDialog` from `@/components/templates/new-version-dialog`.
- Render the dialog near the other dialogs at the bottom of the return:

```tsx
<NewVersionDialog
  open={newVersionOpen}
  onOpenChange={setNewVersionOpen}
  sourceName={templateName}
  snippet={snippet}
  subjectLine={subjectLine}
  department={department}
  existingTypeNames={(fieldOptions?.deliverableType ?? []).map((o) => o.name)}
/>
```

**Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: compiles; no prerender errors. (Per project convention, `next build` catches prerender issues that lint/tsc miss.)

**Step 4: Commit**

```bash
git add src/app/templates/[taskId]/page.tsx src/components/templates/new-version-dialog.tsx
git commit -m "feat: New Version dialog on template editor"
```

---

### Task 5: Manual verification (live) + push

**Do NOT rely on CI for the ClickUp writes.** After Task 2a confirms the PUT shape:

1. Run `npx vitest run` — all unit tests green.
2. On the live Vercel deploy (project convention: test on prod, not localhost), open a template with a clean base name (e.g. one whose `... V2` type already exists) and create a `V2` → confirm the new template opens, content copied, type tagged, and NO new option was created (indicator said "Type exists").
3. Repeat for a base whose target type does NOT exist (e.g. a `... Final` that's missing) → confirm the new option is appended (check the `DELIVERABLE_TYPE` dropdown in ClickUp shows exactly one new option, all originals intact and correctly ordered) and the template is tagged to it.
4. Trigger the collision path (create the same version twice) → confirm the 409 toast with "Open existing".
5. Push:

```bash
git push
```

---

## Open items for the controller (not code)

- **Button label** — "New Version" vs an alternative that won't be confused with the existing "Version History" (edit-snapshots) panel. Confirm copy with Michael before final.
- **Task 2a** must be controller-run against prod with the backup file in hand before any real append ships.
