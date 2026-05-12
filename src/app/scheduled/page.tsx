"use client";

import { ScheduledList } from "@/components/scheduled/scheduled-list";

export default function ScheduledPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-eighties text-2xl">Scheduled</h1>
        <p className="text-muted-foreground">
          Deliveries queued to send automatically. Edit, reschedule, or cancel any item below.
        </p>
      </div>

      <ScheduledList />
    </div>
  );
}
