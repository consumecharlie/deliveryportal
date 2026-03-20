"use client";

import { SentTable } from "@/components/dashboard/sent-table";

export default function SentPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-eighties text-2xl">Sent</h1>
        <p className="text-muted-foreground">
          Previously sent client deliverables.
        </p>
      </div>

      <SentTable />
    </div>
  );
}
