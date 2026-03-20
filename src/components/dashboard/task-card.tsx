"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DepartmentBadge } from "./department-badge";
import { Avatar } from "./assignee-filter";
import type { DeliverableTask } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(timestamp: string | null): string {
  if (!timestamp) return "—";
  const date = new Date(Number(timestamp));
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function isOverdue(timestamp: string | null): boolean {
  if (!timestamp) return false;
  const d = new Date(Number(timestamp));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

/* ------------------------------------------------------------------ */
/*  Task Row — 5-column layout                                         */
/*  Client/Project | Dept | Deliverable/Type | Due Date | Assignee     */
/* ------------------------------------------------------------------ */

function TaskRow({
  task,
  onClick,
}: {
  task: DeliverableTask;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      className="grid items-center gap-x-4 rounded-md px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ gridTemplateColumns: "1fr 126px 1fr 64px 100px" }}
    >
      {/* Column 1: Client / Project — left-aligned */}
      <div className="min-w-0">
        <div className="truncate font-medium">{task.clientName || "—"}</div>
        <div className="truncate text-xs text-muted-foreground">
          {task.projectName}
        </div>
      </div>

      {/* Column 2: Department — centered */}
      <div className="flex justify-center">
        {task.department ? (
          <DepartmentBadge department={task.department} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>

      {/* Column 3: Deliverable / Type — centered */}
      <div className="min-w-0 text-center">
        <div className="truncate font-medium">{task.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {task.deliverableType || "—"}
        </div>
      </div>

      {/* Column 4: Due Date — centered */}
      <div className="text-center">
        <span
          className={
            isOverdue(task.dueDate)
              ? "text-sm font-medium text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {formatDate(task.dueDate)}
        </span>
      </div>

      {/* Column 5: Assignee — left-aligned for avatar alignment */}
      <div className="flex items-center gap-1.5">
        {task.assignee && (
          <Avatar
            src={task.assignee.avatar}
            name={task.assignee.name}
            size={18}
          />
        )}
        <span className="text-sm">
          {task.assignee?.name?.split(" ")[0] ?? "—"}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Card                                                               */
/* ------------------------------------------------------------------ */

interface TaskCardProps {
  title: string;
  icon: LucideIcon | string;
  tasks: DeliverableTask[];
  maxHeight?: string;
  accentClass?: string;
}

export function TaskCard({
  title,
  icon,
  tasks,
  maxHeight,
  accentClass,
}: TaskCardProps) {
  const router = useRouter();

  return (
    <Card className="py-4 gap-3">
      <CardHeader className="pb-0">
        <div className="flex items-center gap-2">
          {typeof icon === "string" ? (
            <Image src={icon} alt="" width={18} height={18} className="flex-shrink-0" />
          ) : (
            (() => { const Icon = icon; return <Icon className={`h-4 w-4 ${accentClass ?? "text-muted-foreground"}`} />; })()
          )}
          <CardTitle className="text-base">{title}</CardTitle>
          <span className="inline-flex items-center justify-center rounded-full bg-muted px-2 min-w-[22px] text-[11px] font-semibold text-muted-foreground">
            {tasks.length}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-2">
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            No deliveries
          </div>
        ) : (
          <div
            className="flex flex-col gap-0.5 overflow-y-auto"
            style={maxHeight ? { maxHeight } : undefined}
          >
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onClick={() => router.push(`/deliverable/${task.id}`)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
