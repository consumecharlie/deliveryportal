"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
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

// Dashboard auto-filters to the logged-in user's own deliveries on first
// load so each person lands on their queue. Admins listed here are exempt —
// they default to "All Assignees". Manual changes stick once made.
const ADMIN_EMAILS = new Set<string>(["michael@consume-media.com"]);

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
  const { data: session } = useSession();
  const userEmail = session?.user?.email?.toLowerCase() ?? "";
  const [assigneeFilter, setAssigneeFilter] = useState("");
  // Tracks whether we've already applied the per-user default so a tasks
  // refetch doesn't re-snap the filter back over a manual user change.
  const appliedUserDefault = useRef(false);

  const { data, isLoading, error } = useQuery<{ tasks: DeliverableTask[] }>({
    queryKey: ["tasks"],
    queryFn: async () => {
      const res = await fetch("/api/tasks");
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return res.json();
    },
  });

  const allTasks = data?.tasks ?? [];

  // Default the assignee filter to the logged-in user once tasks load — by
  // matching the session email against assignee.email in the task list and
  // picking up their ClickUp user id from there. Admins are skipped (they
  // see all by default). Only runs once per mount.
  useEffect(() => {
    if (appliedUserDefault.current) return;
    if (!userEmail) return; // wait for session
    if (ADMIN_EMAILS.has(userEmail)) {
      appliedUserDefault.current = true;
      return;
    }
    if (allTasks.length === 0) return; // wait for tasks
    const mine = allTasks.find(
      (t) => t.assignee?.email?.toLowerCase() === userEmail
    );
    if (mine?.assignee) {
      setAssigneeFilter(String(mine.assignee.id));
    }
    appliedUserDefault.current = true;
  }, [userEmail, allTasks]);

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
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <PacmanLoader size={120} />
        <span className="font-pixel text-[13px]" style={{ color: "#6AC387" }}>LOADING DASHBOARD</span>
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
