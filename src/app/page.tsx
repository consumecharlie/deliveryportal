"use client";

import { TaskTable } from "@/components/dashboard/task-table";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-eighties text-2xl">Dashboard</h1>
        <p className="text-muted-foreground">
          Manage deliverable reviews and client communications.
        </p>
      </div>

      <TaskTable />
    </div>
  );
}
