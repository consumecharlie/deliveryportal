# Ad Hoc Delivery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to create and send deliveries that aren't tied to existing ClickUp tasks — pick a project, pick a template, fill in the form, and send.

**Architecture:** A new `/deliverable/new` page with a two-phase UI: first a project+template selector, then the full delivery editor. On send, a ClickUp task is created in the selected project's list with all fields set, then the normal send flow runs. A new API route `/api/deliverable/new` handles the project data assembly (contacts, channel, metadata) without requiring an existing task.

**Tech Stack:** Next.js App Router, React Query, ClickUp API, existing DeliveryForm component, Prisma for delivery logging

---

### Task 1: API Route — Get Project Detail for Ad Hoc Delivery

**Files:**
- Create: `src/app/api/projects/[listId]/detail/route.ts`

This route assembles the same `TaskDetail`-like data that the existing `/api/tasks/[taskId]` returns, but using a project list ID instead of a task ID. It fetches contacts, Slack channel, project plan link, and project metadata from the list's sibling tasks.

**Step 1: Create the route**

The route should:
1. Accept `GET /api/projects/[listId]/detail?deliverableType=...`
2. Call `getListTasks(listId, true)` to get all tasks in the project
3. Extract contacts (PROJECT_CONTACT type), Slack channel (SLACK_CHANNEL type), project plan link (PROJECT_PLAN type) from sibling tasks — same logic as the task detail route
4. Get the list name (project name) and folder name (client name) from the ClickUp list API
5. Fetch the matching template from DELIVERY_SNIPPETS by deliverable type
6. Look for a matching feedback deadline task by deliverable type
7. Return a `TaskDetail`-compatible object with a synthetic task (no real task ID yet)

Key fields in the response:
```typescript
{
  task: {
    id: "__adhoc__",  // Placeholder until task is created
    name: "Share [deliverableType] with Client",
    status: "open",
    deliverableType: string,
    department: string,
    clientName: string,
    projectName: string,
    listId: string,
    folderId: string,
    // review links empty (no existing task)
  },
  contacts: ProjectContact[],
  feedbackDeadline: FeedbackDeadline | null,
  template: DeliverySnippetTemplate | null,
  slackChannelId: string | null,
  projectPlanLink: string | null,
  reviewLinks: {},
  revisionRounds: "",
  feedbackWindows: "",
  versionNotes: "",
}
```

Reference `src/app/api/tasks/[taskId]/route.ts` lines 40-200 for the sibling task extraction logic. Reuse the same helper functions.

**Step 2: Verify**

Run: `npx next build`
Expected: Success

**Step 3: Commit**

```
feat: add project detail API for ad hoc deliveries
```

---

### Task 2: API Route — Create Task on Ad Hoc Send

**Files:**
- Create: `src/app/api/deliverable/adhoc-send/route.ts`

This route handles the "create task + send" flow for ad hoc deliveries. It:

1. Creates a new ClickUp task in the project's list:
   - Name: `"Share [deliverableType] with Client"`
   - Custom fields: `PROJECT_TASK_TYPE` = "Delivery Deadline" option ID, `DELIVERABLE_TYPE`, `DEPARTMENT`, review link fields, `VERSION_NOTES`, `REVISION_ROUNDS`, `FEEDBACK_WINDOWS`
2. Resolves dropdown option IDs from list field definitions (same pattern as template create)
3. Delegates to the existing send logic: n8n webhook, ClickUp status update, delivery logging

The request body extends the existing `SendRequestBody` with:
```typescript
{
  listId: string;          // Project list to create task in
  deliverableType: string; // For task name and field
  department: string;      // For custom field
  ...existingSendFields    // formState, mergedContent, emails, etc.
}
```

The response returns `{ taskId, deliveryId }`.

Reference:
- `src/app/api/tasks/[taskId]/send/route.ts` for the send flow
- `src/app/api/templates/create/route.ts` for dropdown option ID resolution pattern
- `src/lib/custom-field-ids.ts` for PROJECT_TASK_TYPES.DELIVERY_DEADLINE

**Step 2: Verify**

Run: `npx next build`
Expected: Success

**Step 3: Commit**

```
feat: add adhoc-send API that creates ClickUp task and sends delivery
```

---

### Task 3: New Delivery Page — Project + Template Selector

**Files:**
- Create: `src/app/deliverable/new/page.tsx`

A client component with two phases:

**Phase 1: Selection UI**
- Project dropdown (fetches from `/api/projects`, flattened to a searchable list of `{ listId, name, clientName }`)
- Deliverable Type dropdown (fetches from `/api/deliverable-types`)
- Department dropdown (same options as template editor)
- Once all three are selected, fetch project detail from `/api/projects/[listId]/detail?deliverableType=...`

**Phase 2: Full Delivery Editor**
- Render `<DeliveryForm>` with the assembled `TaskDetail`
- The form works identically to the existing editor, but:
  - The send bar calls `/api/deliverable/adhoc-send` instead of `/api/tasks/[taskId]/send`
  - The "Back" button goes to Dashboard
  - No "Edit Template" link (template is selected in Phase 1)

**Layout:**
- Header: "New Delivery" title with Back button
- Phase 1 shows a compact card with the three dropdowns
- Phase 2 replaces Phase 1 with the full editor (or Phase 1 collapses above it)

**Key consideration:** The `DeliveryForm` component currently expects a `TaskDetail` with a real task ID. For ad hoc, the task ID is `"__adhoc__"` until send time. The `SendBar` needs to detect this and route to the adhoc-send endpoint.

**Step 2: Verify**

Run: `npx next build`
Expected: Success

**Step 3: Commit**

```
feat: add New Delivery page with project + template selector
```

---

### Task 4: Modify SendBar for Ad Hoc Mode

**Files:**
- Modify: `src/components/delivery-form/send-bar.tsx`
- Modify: `src/components/delivery-form/delivery-form.tsx`

**Step 1: Add `adhocMode` prop to SendBar**

```typescript
interface SendBarProps {
  // ... existing props
  adhocMode?: boolean;
  adhocListId?: string;
  adhocDeliverableType?: string;
  adhocDepartment?: string;
}
```

When `adhocMode` is true, the send handler:
1. POSTs to `/api/deliverable/adhoc-send` instead of `/api/tasks/${taskId}/send`
2. Includes `listId`, `deliverableType`, `department` in the body
3. On success, redirects to `/deliverable/${newTaskId}/sent` (using the task ID returned from the API)

**Step 2: Pass adhoc props from DeliveryForm**

Add optional `adhocMode` props to `DeliveryFormProps` and thread them through to `SendBar`.

**Step 3: Disable auto-save for ad hoc mode**

The auto-save hook uses `taskId` to save drafts. For ad hoc (`taskId === "__adhoc__"`), disable auto-save or use a temporary key.

**Step 4: Verify**

Run: `npx next build`
Expected: Success

**Step 5: Commit**

```
feat: SendBar supports adhoc mode with task creation on send
```

---

### Task 5: Dashboard "New Delivery" Button

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Add button to dashboard header**

Add a "New Delivery" button to the right side of the dashboard header, styled with the brand green:

```tsx
<Link href="/deliverable/new">
  <Button className="bg-[#6AC387] hover:bg-[#5aad74] text-[#151919]">
    <Plus className="mr-2 h-4 w-4" />
    New Delivery
  </Button>
</Link>
```

**Step 2: Add to sidebar navigation**

Optionally, add a "New Delivery" quick-access link in the sidebar or as a prominent action.

**Step 3: Verify**

Run: `npx next build`
Expected: Success

**Step 4: Commit**

```
feat: add "New Delivery" button to dashboard
```

---

### Task 6: Update Middleware & Test End-to-End

**Files:**
- Modify: `src/middleware.ts` (if needed for new routes)

**Step 1: Verify all new routes work with auth middleware**

The new routes (`/deliverable/new`, `/api/projects/[listId]/detail`, `/api/deliverable/adhoc-send`) should be protected by the existing auth middleware. Verify they're not accidentally excluded.

**Step 2: Manual end-to-end test**

1. Go to Dashboard → click "New Delivery"
2. Select a project, deliverable type, department
3. Verify contacts, Slack channel, and template load correctly
4. Fill in review links and version notes
5. Send (test mode first)
6. Verify:
   - ClickUp task created in the correct list with correct fields
   - Slack message posted (or email draft created)
   - Delivery logged in portal DB
   - Shows in Sent page and Project Links

**Step 3: Commit**

```
feat: ad hoc delivery end-to-end verified
```
