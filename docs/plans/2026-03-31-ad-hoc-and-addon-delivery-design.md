# Ad Hoc Delivery & Add-on Delivery — Design

## Feature 1: Ad Hoc Delivery ("New Delivery")

### Problem
Currently, deliveries can only be sent from existing ClickUp "Delivery Deadline" tasks. Sometimes the team needs to send a delivery that doesn't have a pre-existing task — an ad hoc communication to a client.

### Flow

1. **Dashboard** — "New Delivery" button (green #6AC387) in top-right corner
2. **New Delivery page** (`/deliverable/new`) — A setup form:
   - **Project selector** — dropdown of all projects (reuse the projects API). Selecting a project loads its contacts, Slack channel, and project metadata.
   - **Deliverable Type** — dropdown of templates. Selecting one loads the template snippet.
   - **Department** — auto-populated from template, editable
3. After selecting project + type, the **full delivery editor** appears (same UI as `/deliverable/[taskId]`) with:
   - Template merged with project contacts/variables
   - All standard fields: review links, scope, version notes, recipients, Slack channel
   - Rushed project / repeat client toggles
4. **On send:**
   - Create a ClickUp task in the project's list:
     - Name: "Share [Deliverable Type] with Client"
     - Project Task Type: "Delivery Deadline"
     - Department: selected department
     - Deliverable Type: selected type
     - Status: "complete" (immediately, since we're sending now)
   - Write review links and other fields to the new task
   - Post to Slack / create email draft via n8n
   - Log delivery to portal DB (linked to the new task ID and project list)
   - Delete draft if any
   - Redirect to sent confirmation

### Data considerations
- The ad hoc task needs custom field values set (same as the template create flow — resolve dropdown option IDs)
- The delivery record uses the new task's ID as `taskId`
- Project links and delivery history work normally since we have `projectListId`
- Auto-save drafts work with a temporary ID until the task is created

### UI layout
- The setup form (project + type selection) is a compact card at the top
- Once both are selected, the full editor renders below
- The "Back" button goes to Dashboard

---

## Feature 2: Add-on Delivery (Multi-Project Merge)

### Problem
Sometimes two projects for the same client overlap and share the same primary contact. Instead of sending two separate delivery messages, the team wants to send one combined message covering both projects.

### Flow

1. **Detection** — In the delivery editor, check if the current project's primary contact has other active projects with the same primary contact. If yes, show an "Add-on Delivery" button.
2. **Add-on selection** — Clicking the button shows:
   - A list of eligible projects (same client, same primary contact)
   - For the selected project, a deliverable type dropdown to choose which template
3. **Merge** — The add-on template's content sections are merged into the current editor:
   - Auto-generates a transition intro: "We also have [Deliverable Type] for [Project B] ready for your review!" — user can edit
   - "What You're Receiving" and "We Need Your Feedback" sections are stripped from both (same as repeat client mode) to keep the message compact
   - Each project keeps its own Scope & Timeline (different timelines/deadlines) and Review Links
   - Shared sections (How to Submit Feedback, Project Plan) appear once at the end
4. **On send:**
   - The primary task (original) gets marked complete as usual
   - A second ClickUp task in the add-on project's list also gets created/marked complete (or if an existing Delivery Deadline task, mark that complete)
   - Delivery logged to both project lists in the portal DB
   - Review links from both projects are saved

### Merge format

The add-on automatically strips "What You're Receiving" and "We Need Your Feedback"
sections (same as repeat client mode) to keep the message compact. Each project gets
its own Scope & Timeline and Review Links since they may be on different timelines.

```
Hey [contacts]!

[Auto-generated intro: "We have deliverables for Project A and Project B
ready for your review!"] — user can edit this

🔔 Scope & Timeline — Project A
- Revision Rounds, Feedback Windows, Deadline for Project A

🔗 Review Links — Project A
- [Project A links]

🔔 Scope & Timeline — Project B
- Revision Rounds, Feedback Windows, Deadline for Project B

🔗 Review Links — Project B
- [Project B links]

📫 How to Submit Feedback (shared, appears once)
📁 Project Plan (shared, appears once)
Closing
```

### Eligibility check
- Same client folder (ClickUp folder ID match)
- Same primary contact (contact name or email match)
- Project has active (non-complete) delivery deadline tasks
- The button only appears when eligible projects exist

### Data model
- The add-on delivery creates a `DeliveryAddon` record or uses a `relatedDeliveryId` on the second delivery record
- Both project list IDs are tracked so project links shows the delivery under both projects

---

## Implementation priority

**Feature 1 (Ad Hoc)** is higher priority and more self-contained. Feature 2 (Add-on) builds on top of the delivery editor that Feature 1 also uses.

Recommended order:
1. Ad Hoc Delivery
2. Add-on Delivery
