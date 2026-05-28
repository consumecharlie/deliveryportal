# 2026-05-27 — Edit-template model, merged-delivery fixes, drafts avatar

Session progress log / recovery doc. All work below is **committed and pushed to `main`** and is live (or building) on Vercel. Verification = full `vitest` (165 passing) + `next build` clean; **end-to-end manual testing on the live deploy is still pending** (Michael will confirm).

## Commits (in order)

| Commit | What |
|---|---|
| `e531e26` | Merge delivery fixes: modal scroll, draft round-trip, transition wording, plan dedup |
| `dcef57e` | Edit-the-template model (stop freezing variable replacement after editing) + combined editable template |
| `294f074` | Docs: document edit-the-template model + add-on namespacing in CLAUDE.md |
| `f1d7be5` | Drafts: show each saved-by user's real avatar (was always logged-in user's) |
| `2ed26e3` | Merged send: complete the EXISTING add-on share task instead of creating a duplicate (2026-05-28) |
| `72ea560` | Merged add-on: pull review links + scope from the real ClickUp task (2026-05-28) |

Branch: `main`. Base before this session: `7dcc5bc`.

---

## Issue 1 — Variable replacement froze after editing the message (FIXED)

**Symptom:** If you opened a delivery, used "Edit Message" before filling in fields, then went back and changed a review link / scope field, the change never appeared in the message. Editing permanently severed reactivity.

**Root cause:** The editor captured a frozen snapshot of the *merged* output into `editedEmailContent`, and `displayEmailContent = editedEmailContent ?? mergedContent.emailContent` short-circuited to it. Also, merge strips empty-link lines (`template-merge.ts` `if (!url) return ""`), so an edited snapshot had no token left to re-fill.

**Fix (chosen approach: "edit the template, not the snapshot"):** The editor now edits the per-delivery **template** (with `[tokens]`); `mergedContent` is recomputed over `displayTemplate = editedSnippet ?? defaultTemplate` every render, so links/scope stay reactive after editing. `editedSnippet`/`editedSubject` are per-delivery only and never written back to the shared ClickUp template.

Key fact: a delivery is **email XOR Slack** (`showEmail`/`showSlack` mutually exclusive in `delivery-form.tsx`), so one edited body feeds the active channel — no divergent email/Slack editing needed. The old `editedEmailContent`/`editedSlackContent` dual state was vestigial.

## Issue 2 — Merged ("Add Project") delivery cluster

- **2.1 Modal cut off (FIXED):** `addon-project-modal.tsx` `DialogContent` is now `flex max-h-[85vh] flex-col` with a scrollable body, so Cancel/Add Project stay pinned regardless of list length.
- **2.2 Same freeze on merged (FIXED):** covered by the edit-template model below.
- **2.3 Draft lost merge state (FIXED):** draft *save* included add-on fields but *restore* read none, so resuming collapsed to a single delivery. Restore now reconstructs `addonProject` + add-on links/labels/scope; `DeliveryFormState` gained `addonLinkLabels`/`addonRevisionRounds`/`addonFeedbackWindows`; a `addonDraftRestored` ref guards the prefill effect from clobbering restored values.
- **2.4 Transition wording (FIXED):** same-project merge now reads `Second, we also have the **<DeliverableType>** ready for your review!` (deliverable type, not repeated project name). Different-project keeps the project-name phrasing. (Wording confirmed by Michael: "for your review", not "your final review".)
- **2.5 Duplicate project plan (FIXED):** shared plan dedupes by URL; same-project collapses to one plan link.

**User chose the full combined-editable rewrite** (informed of the higher regression risk) over the lower-risk "primary-editable only" option.

---

## Architecture of the edit-template / combined merge

All in `src/lib/template-merge.ts`.

- **`performMerge`** gained an optional `projectNameFor(varName)` resolver (additive; single-delivery behavior unchanged). Default uses `replacements.projectName`.
- Lifted `stripRepeatClientSections(content, repeatClient)` and `injectRushedNotice(content, opts)` to **module scope** so both the single and combined merge paths share them (behavior-preserving refactor; existing tests still pass).
- **`buildCombinedTemplate({ primaryTemplate, addonTemplate, addonProjectName, addonDeliverableType, sameProject })`** → assembles ONE editable template: primary greeting + primary sections + transition + add-on sections + shared plan + closing. Mirrors `mergeAddonDelivery`'s structure but on raw templates. The add-on's **per-project tokens are namespaced** with the `addon:` prefix (e.g. `[Final Cut | addon:googleDeliverableLink]`, `[addon:revisionRounds]`). Contact tokens are shared (merged deliveries share one primary contact) and are **not** namespaced. Same-project drops the add-on plan (dedup at template level).
  - `PER_PROJECT_VARS` (namespaced): googleDeliverableLink, frameReviewLink, animaticReviewLink, loomReviewLink, flexLink, projectPlanLink, revisionRounds, feedbackWindows, nextFeedbackDeadline, feedbackDeadline, projectName, versionNotes. (sorted longest-first when rewriting).
- **`mergeCombinedTemplate({ combinedTemplate, subjectLine, primaryProjectName, addonProjectName, primaryVariables, addonVariables })`** → resolves primary tokens from `primaryVariables` and `addon:` tokens from `addonVariables`; `projectNameFor` enriches each standalone link with the owning project's name. Reuses the lifted strip/rushed/review-bullet helpers. Returns `{ emailContent, slackContent, subjectLine }` like `mergeTemplate`.
- **`mergeAddonDelivery` is now `@deprecated`** — the form no longer calls it; retained for reference + its existing tests (`template-merge-addon.test.ts`).

### Why namespacing was necessary
Primary and add-on each have their own value for the same variable name (both have `googleDeliverableLink`, etc.). The old code merged each side separately then stitched the *merged* strings — which is why the stitched result couldn't be re-merged/edited. Namespacing lets one combined template hold both projects' tokens without collision, so the whole combined message (incl. transition + add-on prose) is free-text editable AND stays reactive.

## Wiring (`src/components/delivery-form/`)

`delivery-form.tsx`:
- State: replaced `editedEmailContent`/`editedSlackContent`/`editedSubjectLine` with `editedSnippet` + `editedSubject`.
- `defaultTemplate` memo: single → `activeTemplate.snippet`; merged → `buildCombinedTemplate(...)`. `displayTemplate = editedSnippet ?? defaultTemplate`, `displaySubject = editedSubject ?? activeTemplate.subjectLine`.
- `mergedContent` memo: merged → `mergeCombinedTemplate`; single → `mergeTemplate(displayTemplate, ...)`. `displayEmailContent/Slack/Subject` now just read `mergedContent.*` (no more `editedX ??` freeze).
- `editedSnippet`/`editedSubject` reset on: template-type change, add-on add/remove, reset-to-ClickUp, reset-to-template.
- Draft save: `formState` writes `editedSnippet`/`editedSubject` (legacy `editedEmailContent`/Slack/Subject set to `null`). Draft restore reads `editedSnippet`/`editedSubject`.

`preview-panel.tsx`:
- New props `templateContent` / `templateSubject` (editable, with tokens) + `onTemplateChange` / `onSubjectChange`. Removed `onEmailContentChange`/`onSlackContentChange`/`onSubjectLineChange`.
- Edit mode → edits `templateContent` with `enableTemplateVariables` (token chips) + mentions. Preview mode → unchanged, shows merged `emailContent`/`slackContent`.

`rich-text-editor.tsx`:
- Template-variable chip highlighting strips a leading `addon:` so namespaced add-on tokens still render as chips (via the base variable's metadata).

### Send path — no server changes needed
`/api/tasks/[taskId]/send/route.ts` uses `formState.editedX ?? mergedContent.X`, and the client always posts the client-computed `mergedContent`. Since `mergedContent` already reflects template edits, the edited content reaches send/schedule without any server merge. Legacy `editedEmailContent`/Slack/Subject kept `null` in `DeliveryFormState` for that `??` fallback.

## Drafts avatar fix (`src/components/dashboard/drafts-table.tsx`)
"Saved By" rendered `session.user.image` for every row → everyone showed the logged-in user's photo. Now fetches `/api/settings/workspace-members` (`{ email, profilePicture, initials }`), maps by email, and renders each `savedBy` user's real ClickUp avatar with an initials-chip fallback. Display name still derived from the email local part (matches prior UI).

---

## Tests
- `src/lib/__tests__/template-merge-combined.test.ts` (NEW, 8 cases): namespacing, same/diff transition, plan dedup, distinct per-project link resolution, per-project link enrichment, repeat-client stripping both sides.
- `template-merge-addon.test.ts`: +3 cases for the 2.4/2.5 fixes (still testing the now-deprecated `mergeAddonDelivery`).
- Full suite: **165 passing**, `npx tsc --noEmit` clean, `npx next build` clean, 0 new lint errors.

## PENDING / next steps
1. **Manual testing on live deploy (Michael):**
   - Single: edit message, then add/change a review link → link should appear in preview.
   - Merged same-project (GFB Voiceover Options + Voiceover Script): deliverable-type transition, one plan link, distinct review links, add-on section editable.
   - Draft round-trip: save a merged draft, resume from Drafts → stays merged with add-on links intact.
   - Long-list add-on modal: Add Project reachable.
   - Drafts page: avatars show the correct person (or initials).
2. If a merged preview looks off vs. the old output, tune `buildCombinedTemplate` (assembly/blank lines) — the combined path replaced the old merge-then-stitch for merged deliveries.
3. Optional cleanup later: remove `mergeAddonDelivery` + its tests once the new path is confirmed in production.

## 2026-05-28 follow-up — add-on task completion (commit `2ed26e3`)

Tony tested: merge worked, but on a merged delivery the add-on's share task did **not** get marked complete in ClickUp, so it kept showing in Slack and the portal.

**Cause:** the send route (`/api/tasks/[taskId]/send`, step 7) *created a new* `Share <type> with Client` task and completed that — the real delivery-deadline task the user combined from was never referenced, because the modal dropped its `taskId` on confirm.

**Fix:** capture the selected task id → `AddonSelection.taskId` (modal) → `DeliveryFormState.addonTaskId` (formState + scheduled payload + draft restore) → SendBar `addonFields` → send route `body.addonTaskId`. When present, the route writes the review-link fields onto that **existing** task and marks **it** complete. The create-new path is kept only for the manual-type case (no existing task). The modal now also tracks selection by `taskId` (not just deliverable type), so two deliveries sharing a type are distinguishable.

Files: `addon-project-modal.tsx`, `delivery-form.tsx`, `send-bar.tsx`, `types.ts`, `send/route.ts`.

Backward-compat: drafts saved before this change have no `addonTaskId` → fall back to the old create-new behavior (no regression).

## 2026-05-28 follow-up #2 — add-on scope/links not pulled from ClickUp (commit `72ea560`)

Tony also noticed the add-on's review link wasn't written back to ClickUp, and asked to confirm the merge auto-pulls revision rounds / windows / links from the add-on task rather than relying on manual entry.

**Cause:** `addonTaskDetail` comes from `GET /api/projects/[listId]/detail`, which was built for **ad-hoc** deliveries and returned hardcoded-empty `reviewLinks` / `revisionRounds` / `feedbackWindows` / `versionNotes`. So the add-on never auto-populated its existing values; an empty link also meant nothing was written back on send. (Separately, before `2ed26e3` the add-on links were written to the *duplicate* task, not the one being inspected.)

**Fix:** the detail endpoint now accepts a `taskId` query param; when present it finds that task among `siblings` and extracts its real review links + revision rounds + feedback windows + version notes (same `extractCustomFieldValue`/`extractCustomFieldUrl` as the main task-detail route). The form's add-on-detail query passes `addonProject.taskId` (+ in the query key). Pure ad-hoc (no `taskId`) is unchanged — the `deliverableType` fallback was deliberately NOT added to avoid changing ad-hoc behavior. `result.task.id` is now the real task id when found.

Net effect with `2ed26e3`: the add-on's Google/Frame/Loom links + scope prefill from ClickUp, appear in the merged message, and write back to that same existing task on send. Note: revision rounds / feedback windows are *read* but not written back — matching the primary's behavior (primary only writes links + version notes + slack channel).

Files: `app/api/projects/[listId]/detail/route.ts`, `delivery-form.tsx` (add-on-detail query).

## Known minor limitations
- Different-project merges with *coincidentally identical* plan URLs aren't deduped (template-level dedup only fires for same-project). Rare; acceptable.
- Add-on `flexLink` injection (when no inline placeholder) targets the primary review section only; `flexLink` is effectively unused (FLEX_LINK field empty).
