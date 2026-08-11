# Template Versioning — Design

**Date:** 2026-08-11
**Status:** Approved, ready for implementation plan

## Goal

Let the user create a new delivery template from an existing one in one quick step:
"this is the V1, generate a V2" (or V3, or Final). The tool copies the source
template's content into a new template for the target deliverable type, creating
that deliverable type in ClickUp if it does not already exist.

## Background

- Delivery templates are ClickUp tasks in the `DELIVERY_SNIPPETS` list
  (`901312119609`), named by deliverable type, carrying snippet body + subject +
  department custom fields.
- The `DELIVERABLE_TYPE` dropdown field (`bd34f878-d41d-416e-92c4-7d6d5b378442`)
  has ~185 options. Version families (V1 / V2 / Final) exist as separate options,
  but not every family is complete (e.g. `Generative Stills V2` exists,
  `Generative Stills Final` does not).
- The existing create flow (`src/app/api/templates/create/route.ts`) creates a
  template task and resolves the `DELIVERABLE_TYPE` + `DEPARTMENT` dropdowns by
  orderindex. It can only *set* an existing option; it cannot create one.

## Decisions

- **B1 — auto-create the deliverable type when missing.** Fully hands-off; the
  tool adds the dropdown option itself (guarded, see below). Chosen over a manual
  "add it in ClickUp" fallback.
- **A — derive-and-confirm the target name.** User picks a version label; the tool
  proposes the target deliverable-type name; user confirms or edits before commit.
- **Straight copy** of the source snippet + subject + department into the new
  template. No AI rewrite.

## UX

Entry point: a **"New version"** button on the template detail page
(`/templates/[taskId]`), where the source snippet/subject/department are already
loaded.

Modal flow:

1. Pick a version label — **V2 / V3 / Final**, plus a free-text fallback.
2. Tool proposes the target name by rewriting the source's version token in place
   (not appending):
   - `Generative Stills` → `Generative Stills V2`
   - `Storyboards V1` → `Storyboards V2` / `Storyboards Final`
   - `AV Script V1 + Loom` → `AV Script V2 + Loom` (suffix preserved)
3. Proposed name shown in an **editable field**, checked live against the existing
   `DELIVERABLE_TYPE` options → indicator reads **"type exists"** vs
   **"will create new type"**.
4. Confirm → create the new template task (copied content, retagged to the target
   type), adding the deliverable-type option first if it is missing.

## Name derivation

Pure function, unit-tested. Rules:

- Detect an existing version token (`V\d+` or `Final`, case-insensitive) in the
  source name and **replace** it with the target label.
- If no version token is present, **append** the target label (` V2`, ` Final`).
- Preserve any trailing suffix such as `+ Loom`, `& Animatic` — only the version
  token is rewritten, its position in the string kept.
- Whatever the derivation, the result is editable before commit (safety net for
  the messy `+ Loom` / `& Animatic` names).

## The guarded option-add (only when target type is new)

The ClickUp API offers no dedicated add-option endpoint. The single-field v3
endpoint (`/api/v3/workspaces/{team}/fields/{fieldId}`) allows only `PUT`
(confirmed via `OPTIONS` → `allow: PUT`); v2 cannot modify field options; v3 GET
is 405. So adding an option means a full-config `PUT` of the entire field — the
one hazardous operation, guarded by:

1. **Backup** — read the field's full current option list (id / name / color /
   orderindex) via v2.
2. **Append-only PUT** — `PUT` the field with `options = [...all originals
   unchanged, + new option]`.
3. **Verify** — re-read; assert every original option's id / name / orderindex is
   intact and the new option is present.
4. **Restore on mismatch** — if verification fails, `PUT` the backup to restore,
   abort, and surface an error. Never tag a template against a field that failed
   verification.

The exact v3 PUT body will be nailed down in a controlled first implementation
step (idempotent PUT of the current config + verify) before it ever appends for
real.

## Error handling

- Name collision (target type already has a template task) → surface, offer to
  open the existing template instead of creating a duplicate.
- Option-add verification failure → restore + abort with a clear message; template
  is not created.
- Template creation failure after a successful option-add → leave the new option
  in place (harmless, append-only) and report the create error.

## Testing

- Unit tests for name derivation: `V1→V2`, `V2→Final`, no-token append,
  `+ Loom` / `& Animatic` suffix preservation, case-insensitivity.
- The guarded option-add uses the backup/verify/restore protocol rather than a
  live CI test.

## Files (anticipated)

- `src/lib/template-version.ts` (new) — name derivation + target-type resolution.
- `src/lib/clickup.ts` — add the guarded `appendDropdownOption` helper.
- `src/app/api/templates/version/route.ts` (new) — the create-new-version endpoint.
- `src/app/templates/[taskId]/…` — "New version" button + modal.
- Tests under `src/lib/__tests__/`.
