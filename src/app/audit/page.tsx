"use client";

import { AuditTable } from "@/components/audit/audit-table";

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-eighties text-2xl">Audit</h1>
        <p className="text-muted-foreground">
          Project communication config health.
        </p>
      </div>
      <AuditTable />
    </div>
  );
}
