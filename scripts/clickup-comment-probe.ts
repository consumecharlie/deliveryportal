/**
 * Live probe for ClickUp comment mentions (standalone; the app has no delete
 * helper on purpose). Creates a throwaway task in a scratch list, posts a
 * comment through createTaskComment, posts the comment_text fallback body
 * directly, reads both back, prints the chunk shapes, and deletes the task.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/clickup-comment-probe.ts [listId]
 *
 * Default list is "Delivery Automation Slack Test Grounds" (Process Playground
 * space), never a client project list.
 *
 * Result on 2026-09-03 (task 86akbk2ee, deleted afterwards):
 * - Structured `comment` array: accepted. Read-back shows each member as
 *   `{ type: "tag", user: { id, username, email, ... }, text: "@Name" }` and
 *   `group_assignee` resolved to the Project Management group. This is the
 *   path that renders mention chips.
 * - `comment_text` with "@Name" per member: accepted (assignee set) but
 *   stored as a single plain-text chunk, so it does not render chips. It is
 *   only the 4xx fallback in createTaskComment.
 */
import { createTask, createTaskComment, buildTextCommentBody, getUserGroupMembers } from "../src/lib/clickup";
import { USER_GROUPS } from "../src/lib/custom-field-ids";

const API = "https://api.clickup.com/api/v2";
const SCRATCH_LIST_ID = "901308463139";

function headers() {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) throw new Error("CLICKUP_API_TOKEN is not set");
  return { Authorization: token, "Content-Type": "application/json" };
}

async function main() {
  const listId = process.argv[2] ?? SCRATCH_LIST_ID;
  const members = await getUserGroupMembers(USER_GROUPS.PROJECT_MANAGEMENT);
  console.log("PM group members:", members);

  const task = await createTask(listId, { name: "Client portal comment probe (safe to delete)" });
  console.log("scratch task:", task.id, task.url);
  try {
    const structured = await createTaskComment(task.id, {
      text: "portal mention test (structured)",
      mentions: members,
      groupAssignee: USER_GROUPS.PROJECT_MANAGEMENT,
    });
    console.log("structured comment id:", structured.id);

    const fallback = await fetch(`${API}/task/${task.id}/comment`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(buildTextCommentBody({ text: "portal mention test (text fallback)", mentions: members })),
    });
    console.log("text fallback:", fallback.status, (await fallback.text()).slice(0, 200));

    const back = await fetch(`${API}/task/${task.id}/comment`, { headers: headers() });
    const { comments } = (await back.json()) as { comments: Array<Record<string, unknown>> };
    for (const c of comments) {
      console.log("comment", c.id, JSON.stringify({ comment_text: c.comment_text, assignee: c.assignee, group_assignee: c.group_assignee, comment: c.comment }));
    }
  } finally {
    const del = await fetch(`${API}/task/${task.id}`, { method: "DELETE", headers: headers() });
    console.log("deleted scratch task:", task.id, del.status);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
