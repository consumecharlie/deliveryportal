import { describe, it, expect } from "vitest";
import { selectFeedbackTasks } from "@/lib/portal-live";
import { CUSTOM_FIELDS, PROJECT_TASK_TYPES } from "@/lib/custom-field-ids";
import type { ClickUpTask } from "@/lib/types";

const TYPE_OPTIONS = [
  { id: PROJECT_TASK_TYPES.FEEDBACK_DEADLINE, name: "Feedback Deadline", orderindex: 3 },
  { id: PROJECT_TASK_TYPES.DELIVERY_DEADLINE, name: "Delivery Deadline", orderindex: 4 },
];
const DT_OPTIONS = [
  { id: "opt-av1", name: "AV Script V1", orderindex: 0 },
  { id: "opt-av2", name: "AV Script V2", orderindex: 1 },
];

function t(over: {
  id: string;
  taskType?: string | number | null;
  deliverableType?: string | number | null;
  due?: string | null;
  status?: string;
  statusType?: string;
}): ClickUpTask {
  return {
    id: over.id,
    name: `Task ${over.id}`,
    status: { status: over.status ?? "waiting on client", color: "", type: over.statusType ?? "custom" },
    due_date: over.due === undefined ? null : over.due,
    custom_fields: [
      { id: CUSTOM_FIELDS.PROJECT_TASK_TYPE, name: "Project Task Type", type: "drop_down", type_config: { options: TYPE_OPTIONS }, value: over.taskType === undefined ? 3 : over.taskType },
      { id: CUSTOM_FIELDS.DELIVERABLE_TYPE, name: "Deliverable Type", type: "drop_down", type_config: { options: DT_OPTIONS }, value: over.deliverableType === undefined ? 0 : over.deliverableType },
    ],
  } as unknown as ClickUpTask;
}

describe("selectFeedbackTasks", () => {
  it("keeps only Feedback Deadline tasks, keyed by deliverable type label", () => {
    const map = selectFeedbackTasks([t({ id: "a", due: "1000" }), t({ id: "b", taskType: 4 }), t({ id: "c", deliverableType: 1, due: "2000" })]);
    expect(Object.keys(map).sort()).toEqual(["AV Script V1", "AV Script V2"]);
    expect(map["AV Script V1"]).toEqual({ taskId: "a", name: "Task a", dueMs: 1000, isOpen: true });
    expect(map["AV Script V2"].taskId).toBe("c");
  });

  it("recognizes the type by option id as well as by label", () => {
    const map = selectFeedbackTasks([t({ id: "a", taskType: PROJECT_TASK_TYPES.FEEDBACK_DEADLINE })]);
    expect(map["AV Script V1"]?.taskId).toBe("a");
  });

  it("an open task beats a closed one even when the closed one is due sooner", () => {
    const map = selectFeedbackTasks([
      t({ id: "closed", due: "1000", status: "complete", statusType: "closed" }),
      t({ id: "open", due: "5000" }),
    ]);
    expect(map["AV Script V1"].taskId).toBe("open");
    expect(map["AV Script V1"].isOpen).toBe(true);
  });

  it("two open tasks: the soonest due date wins, and a missing due date sorts last", () => {
    const map = selectFeedbackTasks([t({ id: "later", due: "9000" }), t({ id: "soon", due: "3000" }), t({ id: "undated", due: null })]);
    expect(map["AV Script V1"].taskId).toBe("soon");
  });

  it("marks closed status names or types as not open", () => {
    expect(selectFeedbackTasks([t({ id: "a", status: "Complete" })])["AV Script V1"].isOpen).toBe(false);
    expect(selectFeedbackTasks([t({ id: "b", status: "whatever", statusType: "done" })])["AV Script V1"].isOpen).toBe(false);
    expect(selectFeedbackTasks([t({ id: "c", status: "in review", statusType: "custom" })])["AV Script V1"].isOpen).toBe(true);
  });

  it("skips tasks with no deliverable type", () => {
    expect(selectFeedbackTasks([t({ id: "a", deliverableType: null })])).toEqual({});
  });
});
