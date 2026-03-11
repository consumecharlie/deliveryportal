"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskTable } from "@/components/dashboard/task-table";
import { DraftsTable } from "@/components/dashboard/drafts-table";
import { SentTable } from "@/components/dashboard/sent-table";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Manage deliverable reviews and client communications.
        </p>
      </div>

      <Tabs defaultValue="deliverables">
        <TabsList>
          <TabsTrigger value="deliverables">Deliverables</TabsTrigger>
          <TabsTrigger value="drafts">Drafts</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
        </TabsList>

        <TabsContent value="deliverables" className="mt-4">
          <TaskTable />
        </TabsContent>

        <TabsContent value="drafts" className="mt-4">
          <DraftsTable />
        </TabsContent>

        <TabsContent value="sent" className="mt-4">
          <SentTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
