"use client";

import { AuditTable } from "@/components/audit/audit-table";

export default function ProjectSetupPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-eighties text-2xl">Project Setup</h1>
        <p className="text-muted-foreground">
          Configure and monitor project communications.
        </p>
      </div>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Health</h2>
        <AuditTable />
      </div>
    </div>
  );
}
