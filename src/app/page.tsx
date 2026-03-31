"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskTable } from "@/components/dashboard/task-table";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-eighties text-2xl">Dashboard</h1>
          <p className="text-muted-foreground">
            Manage deliverable reviews and client communications.
          </p>
        </div>
        <Link href="/deliverable/new">
          <Button className="bg-[#6AC387] hover:bg-[#5aad74] text-[#151919] font-medium">
            <Plus className="mr-2 h-4 w-4" />
            New Delivery
          </Button>
        </Link>
      </div>

      <TaskTable />
    </div>
  );
}
