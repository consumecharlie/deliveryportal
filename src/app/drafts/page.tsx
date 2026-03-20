"use client";

import { DraftsTable } from "@/components/dashboard/drafts-table";

export default function DraftsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-eighties text-2xl">Drafts</h1>
        <p className="text-muted-foreground">
          In-progress deliverables saved as drafts.
        </p>
      </div>

      <DraftsTable />
    </div>
  );
}
