# Add-on Delivery (Multi-Project Merge) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When two projects share the same primary contact, allow users to combine both into a single delivery message with per-project scope/timeline and review links.

**Architecture:** A new API endpoint detects eligible add-on projects by comparing primary contacts across projects in the same client folder. The delivery form gets an "Add Project" button that opens a modal for selecting the add-on project and its deliverable type. The template merge engine combines both project sections. On send, both projects get ClickUp tasks marked complete and delivery records logged.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, ClickUp API, Prisma/Neon, shadcn/ui, React Query

---

### Task 1: API — Eligible Add-on Projects Endpoint

**Files:**
- Create: `src/app/api/projects/[listId]/eligible-addons/route.ts`

This endpoint receives the current project's listId and returns other projects in the same client folder that share the same primary contact (by email OR name).

**Step 1: Create the endpoint**

```typescript
// src/app/api/projects/[listId]/eligible-addons/route.ts
import { NextResponse } from "next/server";
import {
  getList,
  getSpaceFolders,
  getListTasks,
  extractCustomFieldValue,
} from "@/lib/clickup";
import {
  CUSTOM_FIELDS,
  PROJECT_TASK_TYPES,
  SPACES,
} from "@/lib/custom-field-ids";

interface EligibleProject {
  listId: string;
  projectName: string;
  clientName: string;
  primaryContactName: string;
  primaryContactEmail: string;
  hasActiveDeliveryDeadlines: boolean;
}

/**
 * GET /api/projects/[listId]/eligible-addons
 *
 * Returns sibling projects (same client folder) that share the same primary
 * contact as the given project. Used to power the "Add Project" button in
 * the delivery editor.
 *
 * Matching is resilient: compares by email (case-insensitive) OR by name
 * (case-insensitive, trimmed). This handles Slack-only projects that may
 * not have email populated, as well as email-only projects without Slack IDs.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ listId: string }> }
) {
  const { listId } = await params;

  try {
    // Get current project's folder info
    const listInfo = await getList(listId);
    const folderId = listInfo.folder.id;
    const clientName = listInfo.folder.name;

    if (!folderId || folderId === "0") {
      // Folderless project — no siblings to match
      return NextResponse.json({ projects: [] });
    }

    // Get all folders to find sibling lists in the same folder
    const foldersRes = await getSpaceFolders(SPACES.PROJECTS);
    const folder = foldersRes.folders.find(
      (f: { id: string }) => f.id === folderId
    );
    if (!folder) {
      return NextResponse.json({ projects: [] });
    }

    const siblingLists = folder.lists.filter(
      (l: { id: string }) => l.id !== listId
    );
    if (siblingLists.length === 0) {
      return NextResponse.json({ projects: [] });
    }

    // Fetch current project's contacts to find primary
    const currentTasksRes = await getListTasks(listId, true);
    let currentPrimaryEmail = "";
    let currentPrimaryName = "";

    for (const task of currentTasksRes.tasks) {
      const rawType = task.custom_fields.find(
        (f: { id: string }) => f.id === CUSTOM_FIELDS.PROJECT_TASK_TYPE
      )?.value;
      const taskType = extractCustomFieldValue(
        task.custom_fields,
        CUSTOM_FIELDS.PROJECT_TASK_TYPE
      );

      const isContact =
        taskType === "Project Contact" ||
        String(rawType) === PROJECT_TASK_TYPES.PROJECT_CONTACT;
      if (!isContact) continue;

      const role =
        extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.CONTACT_ROLE) ?? "";
      if (role !== "Primary") continue;

      currentPrimaryEmail = (
        extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.CONTACT_EMAIL) ?? ""
      ).toLowerCase().trim();
      currentPrimaryName = (
        extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.CONTACT_FIRST_NAME) ??
        task.name
      ).toLowerCase().trim();
      break;
    }

    if (!currentPrimaryEmail && !currentPrimaryName) {
      // No primary contact found — can't match
      return NextResponse.json({ projects: [] });
    }

    // Check each sibling project for matching primary contact
    const eligible: EligibleProject[] = [];

    // Process in parallel batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < siblingLists.length; i += BATCH_SIZE) {
      const batch = siblingLists.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (sibList: { id: string; name: string }) => {
          const tasksRes = await getListTasks(sibList.id, true);
          let primaryEmail = "";
          let primaryName = "";
          let hasActiveDeliveryDeadlines = false;

          for (const task of tasksRes.tasks) {
            const rawType = task.custom_fields.find(
              (f: { id: string }) => f.id === CUSTOM_FIELDS.PROJECT_TASK_TYPE
            )?.value;
            const taskType = extractCustomFieldValue(
              task.custom_fields,
              CUSTOM_FIELDS.PROJECT_TASK_TYPE
            );

            const isContact =
              taskType === "Project Contact" ||
              String(rawType) === PROJECT_TASK_TYPES.PROJECT_CONTACT;
            const isDeliveryDeadline =
              taskType === "Delivery Deadline" ||
              String(rawType) === PROJECT_TASK_TYPES.DELIVERY_DEADLINE;

            if (isContact) {
              const role =
                extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.CONTACT_ROLE) ?? "";
              if (role === "Primary") {
                primaryEmail = (
                  extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.CONTACT_EMAIL) ?? ""
                ).toLowerCase().trim();
                primaryName = (
                  extractCustomFieldValue(task.custom_fields, CUSTOM_FIELDS.CONTACT_FIRST_NAME) ??
                  task.name
                ).toLowerCase().trim();
              }
            }

            if (isDeliveryDeadline) {
              const status = task.status.status.toLowerCase();
              if (status !== "complete" && status !== "closed") {
                hasActiveDeliveryDeadlines = true;
              }
            }
          }

          // Match by email OR name (resilient to Slack vs email projects)
          const emailMatch =
            currentPrimaryEmail &&
            primaryEmail &&
            currentPrimaryEmail === primaryEmail;
          const nameMatch =
            currentPrimaryName &&
            primaryName &&
            currentPrimaryName === primaryName;

          if (emailMatch || nameMatch) {
            return {
              listId: sibList.id,
              projectName: sibList.name,
              clientName,
              primaryContactName: primaryName || primaryEmail,
              primaryContactEmail: primaryEmail,
              hasActiveDeliveryDeadlines,
            } as EligibleProject;
          }
          return null;
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          eligible.push(result.value);
        }
      }
    }

    return NextResponse.json({ projects: eligible });
  } catch (error) {
    console.error("Failed to fetch eligible add-on projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch eligible add-on projects" },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors related to this file

**Step 3: Commit**

```bash
git add src/app/api/projects/\[listId\]/eligible-addons/route.ts
git commit -m "feat: add eligible add-on projects API endpoint"
```

---

### Task 2: Add-on Project Modal Component

**Files:**
- Create: `src/components/delivery-form/addon-project-modal.tsx`

A dialog that shows eligible projects and lets the user pick one + a deliverable type for it.

**Step 1: Create the modal**

```typescript
// src/components/delivery-form/addon-project-modal.tsx
"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/shared/searchable-select";

interface EligibleProject {
  listId: string;
  projectName: string;
  clientName: string;
  primaryContactName: string;
  primaryContactEmail: string;
  hasActiveDeliveryDeadlines: boolean;
}

export interface AddonSelection {
  listId: string;
  projectName: string;
  deliverableType: string;
}

interface AddonProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentListId: string;
  deliverableTypeOptions: Array<{ value: string; label: string }>;
  onConfirm: (selection: AddonSelection) => void;
}

export function AddonProjectModal({
  open,
  onOpenChange,
  currentListId,
  deliverableTypeOptions,
  onConfirm,
}: AddonProjectModalProps) {
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");

  // Reset on open
  useEffect(() => {
    if (open) {
      setSelectedListId("");
      setSelectedType("");
    }
  }, [open]);

  const { data, isLoading } = useQuery<{ projects: EligibleProject[] }>({
    queryKey: ["eligible-addons", currentListId],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(currentListId)}/eligible-addons`
      );
      if (!res.ok) throw new Error("Failed to fetch eligible projects");
      return res.json();
    },
    enabled: open && !!currentListId,
    staleTime: 5 * 60_000,
  });

  const projects = data?.projects ?? [];
  const selectedProject = projects.find((p) => p.listId === selectedListId);

  const handleConfirm = () => {
    if (!selectedProject || !selectedType) return;
    onConfirm({
      listId: selectedProject.listId,
      projectName: selectedProject.projectName,
      deliverableType: selectedType,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Project to Delivery
          </DialogTitle>
          <DialogDescription>
            Combine another project into this delivery. Both projects share the
            same primary contact.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : projects.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No eligible projects found. Projects must be in the same client
            folder and share the same primary contact.
          </p>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Project</Label>
              <SearchableSelect
                options={projects.map((p) => ({
                  value: p.listId,
                  label: p.projectName,
                }))}
                value={selectedListId}
                onValueChange={setSelectedListId}
                placeholder="Select project..."
                searchPlaceholder="Search projects..."
              />
            </div>

            {selectedListId && (
              <div className="space-y-2">
                <Label>Deliverable Type</Label>
                <SearchableSelect
                  options={deliverableTypeOptions}
                  value={selectedType}
                  onValueChange={setSelectedType}
                  placeholder="Select deliverable type..."
                  searchPlaceholder="Search types..."
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedListId || !selectedType}
            className="bg-[#6AC387] hover:bg-[#5aad74] text-[#151919]"
          >
            Add Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/components/delivery-form/addon-project-modal.tsx
git commit -m "feat: add-on project selection modal component"
```

---

### Task 3: Add-on State + Button in Delivery Form

**Files:**
- Modify: `src/components/delivery-form/delivery-form.tsx`
- Modify: `src/components/delivery-form/scope-section.tsx`

Add state for the add-on project, the "Add Project" button (in the scope section, next to the toggles), and fetch the add-on project's TaskDetail when selected.

**Key changes to delivery-form.tsx:**

1. Import `AddonProjectModal` and `AddonSelection` type
2. Add state:
   - `addonProject: AddonSelection | null` — the selected add-on project
   - `addonTaskDetail: TaskDetail | null` — fetched detail for the add-on project
   - `addonReviewLinks: Record<string, string>` — add-on project's review links
   - `addonLinkLabels: Record<string, string>` — add-on project's link labels
   - `addonRevisionRounds: string`
   - `addonFeedbackWindows: string`
   - `showAddonModal: boolean`
3. Add React Query to fetch add-on project detail when addonProject is set
4. Add React Query to detect eligible add-on projects (to show/hide the button)
5. Pass addon state to the merge function
6. Show the AddonProjectModal
7. Add "Add Project" button near scope section
8. When addon is active, show a second set of scope/review link fields for Project B
9. Pass addon data through the send flow

**Step 1: Add addon types to types.ts**

Add to `src/lib/types.ts`:

```typescript
export interface AddonProjectData {
  listId: string;
  projectName: string;
  deliverableType: string;
  reviewLinks: Record<string, string>;
  linkLabels: Record<string, string>;
  revisionRounds: string;
  feedbackWindows: string;
  nextFeedbackDeadline: string;
  projectPlanLink: string;
  contacts: ProjectContact[];
  templateSnippet: string;
  subjectLine: string;
}
```

**Step 2: Add addon state and UI to delivery-form.tsx**

In `delivery-form.tsx`, add the following state variables after the existing state block (~line 95):

```typescript
// ── Add-on project state ──
const [addonProject, setAddonProject] = useState<AddonSelection | null>(null);
const [showAddonModal, setShowAddonModal] = useState(false);
const [addonReviewLinks, setAddonReviewLinks] = useState<Record<string, string>>({});
const [addonLinkLabels, setAddonLinkLabels] = useState<Record<string, string>>({});
const [addonRevisionRounds, setAddonRevisionRounds] = useState("");
const [addonFeedbackWindows, setAddonFeedbackWindows] = useState("");
```

Add a query to check for eligible add-on projects:

```typescript
const { data: eligibleAddonsData } = useQuery<{
  projects: Array<{ listId: string; projectName: string }>;
}>({
  queryKey: ["eligible-addons", task.listId],
  queryFn: async () => {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(task.listId)}/eligible-addons`
    );
    if (!res.ok) throw new Error("Failed");
    return res.json();
  },
  staleTime: 5 * 60_000,
  enabled: !!task.listId && task.listId !== "__adhoc__",
});

const hasEligibleAddons = (eligibleAddonsData?.projects?.length ?? 0) > 0;
```

Add a query to fetch the add-on project's TaskDetail when selected:

```typescript
const { data: addonTaskDetail } = useQuery<TaskDetail>({
  queryKey: ["addon-detail", addonProject?.listId, addonProject?.deliverableType],
  queryFn: async () => {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(addonProject!.listId)}/detail?deliverableType=${encodeURIComponent(addonProject!.deliverableType)}`
    );
    if (!res.ok) throw new Error("Failed to fetch add-on project detail");
    return res.json();
  },
  enabled: !!addonProject?.listId && !!addonProject?.deliverableType,
  staleTime: 5 * 60_000,
});
```

Handle addon selection callback:

```typescript
const handleAddonConfirm = useCallback((selection: AddonSelection) => {
  setAddonProject(selection);
  // Reset addon form fields — they'll be populated from the fetched TaskDetail
  setAddonReviewLinks({});
  setAddonLinkLabels({});
  setAddonRevisionRounds("");
  setAddonFeedbackWindows("");
}, []);

const handleRemoveAddon = useCallback(() => {
  setAddonProject(null);
  setAddonReviewLinks({});
  setAddonLinkLabels({});
  setAddonRevisionRounds("");
  setAddonFeedbackWindows("");
}, []);
```

Pre-fill addon fields when TaskDetail loads (useEffect):

```typescript
useEffect(() => {
  if (addonTaskDetail) {
    setAddonRevisionRounds(addonTaskDetail.revisionRounds || "");
    setAddonFeedbackWindows(addonTaskDetail.feedbackWindows || "");
    setAddonReviewLinks({
      googleDeliverableLink: addonTaskDetail.reviewLinks.googleDeliverableLink ?? "",
      frameReviewLink: addonTaskDetail.reviewLinks.frameReviewLink ?? "",
      loomReviewLink: addonTaskDetail.reviewLinks.loomReviewLink ?? "",
      animaticReviewLink: addonTaskDetail.reviewLinks.animaticReviewLink ?? "",
      flexLink: addonTaskDetail.reviewLinks.flexLink ?? "",
    });
  }
}, [addonTaskDetail]);
```

**Step 3: Update the scope section to include the "Add Project" button**

In `scope-section.tsx`, add a new optional prop and button:

```typescript
interface ScopeSectionProps {
  // ... existing props ...
  showAddonButton?: boolean;
  addonProjectName?: string;
  onAddProject?: () => void;
  onRemoveAddon?: () => void;
}
```

Add after the Rushed Project checkbox:

```tsx
{showAddonButton && !addonProjectName && (
  <button
    type="button"
    onClick={onAddProject}
    className="flex items-center gap-1.5 text-sm text-[#6AC387] hover:text-[#5aad74] transition-colors mt-1"
  >
    <Plus className="h-3.5 w-3.5" />
    Add Project (same contact)
  </button>
)}
{addonProjectName && (
  <div className="flex items-center gap-2 mt-1 rounded-md border border-[#6AC387]/30 bg-[#6AC387]/5 px-3 py-1.5">
    <span className="text-sm">
      📎 Combined with <strong>{addonProjectName}</strong>
    </span>
    <button
      type="button"
      onClick={onRemoveAddon}
      className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors"
    >
      Remove
    </button>
  </div>
)}
```

**Step 4: Wire addon props through delivery-form.tsx JSX**

Pass the new props to ScopeSection:

```tsx
<ScopeSection
  revisionRounds={revisionRounds}
  feedbackWindows={feedbackWindows}
  rushedProject={rushedProject}
  repeatClient={repeatClient}
  onRevisionRoundsChange={setRevisionRounds}
  onFeedbackWindowsChange={setFeedbackWindows}
  onRushedProjectChange={setRushedProject}
  onRepeatClientChange={setRepeatClient}
  showAddonButton={hasEligibleAddons}
  addonProjectName={addonProject?.projectName}
  onAddProject={() => setShowAddonModal(true)}
  onRemoveAddon={handleRemoveAddon}
/>
```

Add the modal near the end of the JSX (before SendBar):

```tsx
<AddonProjectModal
  open={showAddonModal}
  onOpenChange={setShowAddonModal}
  currentListId={task.listId}
  deliverableTypeOptions={deliverableTypeOptions}
  onConfirm={handleAddonConfirm}
/>
```

When addon is active, show a second set of review links and scope fields below the primary ones. Add after the main ReviewLinksSection:

```tsx
{/* Add-on project fields */}
{addonProject && addonTaskDetail && (
  <div className="space-y-6 rounded-lg border border-[#6AC387]/30 bg-[#6AC387]/5 p-4">
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">
        📎 {addonProject.projectName} — {addonProject.deliverableType}
      </span>
    </div>

    <ReviewLinksSection
      requiredFields={addonTaskDetail.template ? getRequiredLinkFields(addonTaskDetail.template.snippet) : []}
      reviewLinks={addonReviewLinks}
      linkLabels={addonLinkLabels}
      defaultLinkLabels={addonTaskDetail.template ? getLinkLabelsFromTemplate(addonTaskDetail.template.snippet) : {}}
      extraLinks={[]}
      onReviewLinkChange={(field, value) =>
        setAddonReviewLinks((prev) => ({ ...prev, [field]: value }))
      }
      onLinkLabelChange={(field, value) =>
        setAddonLinkLabels((prev) => ({ ...prev, [field]: value }))
      }
      onAddExtraLink={() => {}}
      onExtraLinkChange={() => {}}
      onRemoveExtraLink={() => {}}
    />

    <div className="grid grid-cols-2 gap-4">
      <div>
        <Label className="text-xs text-muted-foreground">Revision Rounds</Label>
        <SearchableSelect
          options={[{ value: "1", label: "1" }, { value: "2", label: "2" }]}
          value={addonRevisionRounds}
          onValueChange={setAddonRevisionRounds}
          placeholder="Select..."
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Feedback Windows</Label>
        <SearchableSelect
          options={[
            { value: "Same day", label: "Same day" },
            { value: "24 Hours", label: "24 Hours" },
            { value: "48 Hours", label: "48 Hours" },
          ]}
          value={addonFeedbackWindows}
          onValueChange={setAddonFeedbackWindows}
          placeholder="Select..."
        />
      </div>
    </div>
  </div>
)}
```

**Step 5: Commit**

```bash
git add src/lib/types.ts src/components/delivery-form/delivery-form.tsx src/components/delivery-form/scope-section.tsx
git commit -m "feat: add-on project state, button, and addon fields in delivery form"
```

---

### Task 4: Template Merge — Multi-Project Content

**Files:**
- Modify: `src/lib/template-merge.ts`

Add a new function `mergeAddonDelivery()` that takes the primary and add-on project data and produces a combined message. The function:

1. Merges the primary template normally
2. Strips "What You're Receiving", "We Need Your Feedback", and "Typical feedback" sections from BOTH projects (same as repeat client)
3. Extracts each project's scope/timeline and review links sections
4. Builds the combined format:
   - Shared greeting (primary contact's name)
   - Auto-generated intro: "We have deliverables for Project A and Project B ready for your review!"
   - 🔔 Scope & Timeline — Project A (with scope content)
   - 🔗 Review Links — Project A (with links)
   - 🔔 Scope & Timeline — Project B (with scope content)
   - 🔗 Review Links — Project B (with links)
   - 📫 How to Submit Feedback (shared, once)
   - 📁 Project Plan (shared, once — with both links)
   - Closing

**Step 1: Add the mergeAddonDelivery function**

Add to `src/lib/template-merge.ts` (exported):

```typescript
export interface AddonMergeInput {
  primaryProjectName: string;
  primaryMergedContent: string;
  primaryReviewLinksMarkdown: string; // Pre-built markdown for project A's links
  addonProjectName: string;
  addonDeliverableType: string;
  addonTemplate: string;
  addonContacts: ProjectContact[];
  addonReviewLinks: Record<string, string>;
  addonLinkLabels?: Record<string, string>;
  addonExtraLinks?: Array<{ url: string; label: string }>;
  addonRevisionRounds: string;
  addonFeedbackWindows: string;
  addonNextFeedbackDeadline: string;
  addonProjectPlanLink?: string;
  // Shared
  contacts: ProjectContact[];
  projectPlanLink?: string;
}

/**
 * Merges two project deliveries into a single combined message.
 *
 * Strategy: Rather than trying to parse and recombine arbitrary templates,
 * we take the already-merged primary content and the add-on template,
 * then build a combined structure.
 */
export function mergeAddonDelivery(
  input: AddonMergeInput
): { emailContent: string; slackContent: string } {
  // ... implementation in the actual code
}
```

The actual implementation will:
- Use helper functions to extract sections between headers
- Build the combined content string
- Return both email and slack versions

**Step 2: Integrate into the mergedContent useMemo in delivery-form.tsx**

When `addonProject` and `addonTaskDetail` are set, call the addon merge function instead of the simple merge.

**Step 3: Commit**

```bash
git add src/lib/template-merge.ts src/components/delivery-form/delivery-form.tsx
git commit -m "feat: multi-project template merge for add-on deliveries"
```

---

### Task 5: Send Flow — Handle Add-on Project

**Files:**
- Modify: `src/app/api/tasks/[taskId]/send/route.ts`
- Modify: `src/components/delivery-form/send-bar.tsx`
- Modify: `src/components/delivery-form/delivery-form.tsx`
- Modify: `src/lib/types.ts`

When sending a combined delivery:
1. The send payload includes addon project data (listId, deliverableType, department, review links)
2. The send route creates a ClickUp task in the addon project's list (or finds existing delivery deadline)
3. Both tasks get marked complete
4. Two Delivery records are logged to the DB (one per project, same email/slack content)

**Step 1: Add addon fields to SendRequestBody and SendBar props**

In `types.ts`, add to `DeliveryFormState`:

```typescript
// Add-on project data (when combining projects)
addonListId?: string;
addonDeliverableType?: string;
addonDepartment?: string;
addonReviewLinks?: Record<string, string>;
addonProjectName?: string;
```

**Step 2: Update send route to handle addon**

After the primary task is sent and logged, if `addonListId` is present:
- Create a task in the addon project's list
- Set its custom fields (deliverable type, department, review links)
- Mark it complete
- Log a second Delivery record with `projectListId = addonListId`
- Save the addon's review links to DeliveryLink

**Step 3: Update SendBar to pass addon data**

Pass addon fields through the send body.

**Step 4: Update delivery-form.tsx to include addon in formState**

When building formState, add the addon fields:

```typescript
const formState: DeliveryFormState = {
  // ... existing fields ...
  ...(addonProject ? {
    addonListId: addonProject.listId,
    addonDeliverableType: addonProject.deliverableType,
    addonDepartment: addonTaskDetail?.task.department,
    addonReviewLinks,
    addonProjectName: addonProject.projectName,
  } : {}),
};
```

**Step 5: Commit**

```bash
git add src/lib/types.ts src/app/api/tasks/\[taskId\]/send/route.ts src/components/delivery-form/send-bar.tsx src/components/delivery-form/delivery-form.tsx
git commit -m "feat: send flow handles add-on project task creation and logging"
```

---

### Task 6: Integration Testing & Build Verification

**Files:**
- No new files

**Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Run existing tests**

Run: `npx vitest run`
Expected: All existing tests pass

**Step 4: Manual verification checklist**

1. Open a delivery editor for a project that shares a primary contact with another project
2. Verify "Add Project (same contact)" button appears in the Scope section
3. Click it — modal shows eligible projects
4. Select a project + deliverable type → addon section appears with review links and scope fields
5. Preview shows combined format with both projects
6. "Remove" button removes the addon
7. Send works and creates tasks in both projects

**Step 5: Final commit (if any fixes needed)**

```bash
git commit -m "fix: address integration issues in add-on delivery feature"
```
