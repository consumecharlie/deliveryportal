"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CalendarOff,
} from "lucide-react";
import PacmanLoader from "@/components/ui/pacman-loader";
import { AssigneeFilter } from "./assignee-filter";
import { TaskCard } from "./task-card";
import type { DeliverableTask } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Date bucket helpers                                                */
/* ------------------------------------------------------------------ */

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function splitByTimeBucket(tasks: DeliverableTask[]) {
  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  const todayEnd = todayStart + 86_400_000; // +1 day
  const weekEnd = todayStart + 7 * 86_400_000; // +7 days

  const overdue: DeliverableTask[] = [];
  const today: DeliverableTask[] = [];
  const thisWeek: DeliverableTask[] = [];
  const upcoming: DeliverableTask[] = [];
  const unscheduled: DeliverableTask[] = [];

  for (const task of tasks) {
    if (!task.dueDate) {
      unscheduled.push(task);
      continue;
    }

    const ts = Number(task.dueDate);

    if (ts < todayStart && task.assignee) {
      // Past due (before start of today) — only if assigned to someone
      overdue.push(task);
    } else if (ts < todayStart && !task.assignee) {
      // Past due but no assignee — skip from overdue, treat as unscheduled
      unscheduled.push(task);
    } else if (ts < todayEnd) {
      // Due today (start of day ≤ ts < end of day)
      today.push(task);
    } else if (ts < weekEnd) {
      // Due within next 7 days (after today)
      thisWeek.push(task);
    } else {
      // Beyond 7 days
      upcoming.push(task);
    }
  }

  return { overdue, today, thisWeek, upcoming, unscheduled };
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function TaskTable() {
  const [assigneeFilter, setAssigneeFilter] = useState("");

  const { data, isLoading, error } = useQuery<{ tasks: DeliverableTask[] }>({
    queryKey: ["tasks"],
    queryFn: async () => {
      const res = await fetch("/api/tasks");
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return res.json();
    },
  });

  const allTasks = data?.tasks ?? [];

  // Filter by assignee
  const filtered = useMemo(() => {
    if (!assigneeFilter) return allTasks;
    return allTasks.filter(
      (t) => t.assignee && String(t.assignee.id) === assigneeFilter
    );
  }, [allTasks, assigneeFilter]);

  // Split into time buckets
  const { overdue, today, thisWeek, upcoming, unscheduled } = useMemo(
    () => splitByTimeBucket(filtered),
    [filtered]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <PacmanLoader size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        Failed to load deliverables. Check your ClickUp API connection.
      </div>
    );
  }

  if (allTasks.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        No deliverables found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Global assignee filter */}
      <div className="flex items-center gap-3">
        <AssigneeFilter
          tasks={allTasks}
          value={assigneeFilter}
          onValueChange={setAssigneeFilter}
        />
      </div>

      {/* Overdue — full width, only shown when there are overdue tasks */}
      {overdue.length > 0 && (
        <TaskCard
          title="Overdue"
          icon={AlertTriangle}
          tasks={overdue}
          maxHeight="300px"
          accentClass="text-destructive"
        />
      )}

      {/* Top row: Today + This Week side by side */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TaskCard
          title="Today"
          icon="/icons/bell-notification.svg"
          tasks={today}
          maxHeight="400px"
        />
        <TaskCard
          title="This Week"
          icon="/icons/calendar.svg"
          tasks={thisWeek}
          maxHeight="400px"
        />
      </div>

      {/* Bottom: Upcoming full width */}
      <TaskCard
        title="Upcoming"
        icon={CalendarRange}
        tasks={upcoming}
        maxHeight="500px"
      />

      {/* Unscheduled full width */}
      {unscheduled.length > 0 && (
        <TaskCard
          title="Unscheduled"
          icon={CalendarOff}
          tasks={unscheduled}
          maxHeight="400px"
        />
      )}
    </div>
  );
}
