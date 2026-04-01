"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/shared/searchable-select";
import { DeliveryForm } from "@/components/delivery-form/delivery-form";
import PacmanLoader from "@/components/ui/pacman-loader";
import type { TaskDetail } from "@/lib/types";

interface ClientWithProjects {
  folderId: string;
  name: string;
  archived: boolean;
  projects: Array<{
    listId: string;
    name: string;
    archived: boolean;
  }>;
}

export default function NewDeliveryPage() {
  const [selectedListId, setSelectedListId] = useState("");
  const [selectedDeliverableType, setSelectedDeliverableType] = useState("");

  // Fetch all projects (including those without deliveries)
  const { data: projectsData } = useQuery<{
    clients: ClientWithProjects[];
    folderlessProjects: Array<{ listId: string; name: string; archived: boolean }>;
  }>({
    queryKey: ["projects-all"],
    queryFn: async () => {
      const res = await fetch("/api/projects?all=true");
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
    staleTime: 10 * 60_000,
  });

  // Fetch deliverable types
  const { data: deliverableTypesData } = useQuery<{
    options: Array<{ id: string; name: string; orderindex: number }>;
  }>({
    queryKey: ["deliverable-types"],
    queryFn: async () => {
      const res = await fetch("/api/deliverable-types");
      if (!res.ok) throw new Error("Failed to fetch deliverable types");
      return res.json();
    },
    staleTime: 30 * 60_000,
  });

  // Flatten clients + projects into searchable list
  const projectOptions = useMemo(() => {
    if (!projectsData) return [];
    const options: Array<{ value: string; label: string }> = [];

    for (const client of projectsData.clients) {
      for (const project of client.projects) {
        options.push({
          value: project.listId,
          label: `${client.name} — ${project.name}`,
        });
      }
    }

    for (const project of projectsData.folderlessProjects) {
      options.push({
        value: project.listId,
        label: project.name,
      });
    }

    return options;
  }, [projectsData]);

  // Deliverable type options
  const deliverableTypeOptions = useMemo(() => {
    const options = deliverableTypesData?.options ?? [];
    return options.map((o) => ({ value: o.name, label: o.name }));
  }, [deliverableTypesData]);

  // Auto-fetch project detail when project AND deliverable type are selected
  const shouldFetchDetail = !!selectedListId && !!selectedDeliverableType;

  const {
    data: taskDetail,
    isLoading: isLoadingDetail,
    error: detailError,
  } = useQuery<TaskDetail>({
    queryKey: ["project-detail", selectedListId, selectedDeliverableType],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${selectedListId}/detail?deliverableType=${encodeURIComponent(selectedDeliverableType)}`
      );
      if (!res.ok) throw new Error("Failed to load project detail");
      return res.json();
    },
    enabled: shouldFetchDetail,
    staleTime: 60_000,
  });

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </Link>
        <h1 className="text-xl font-bold">New Delivery</h1>
      </div>

      {/* Selection Card */}
      <div className="rounded-lg border border-border/50 bg-card p-6">
        <h2 className="mb-4 text-base font-semibold">Select Project & Template</h2>
        <div className="grid grid-cols-2 gap-4">
          {/* Project */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Project</label>
            <SearchableSelect
              options={projectOptions}
              value={selectedListId}
              onValueChange={setSelectedListId}
              placeholder="Select project..."
              searchPlaceholder="Search projects..."
              emptyMessage="No projects found."
            />
          </div>

          {/* Deliverable Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Deliverable Type</label>
            <SearchableSelect
              options={deliverableTypeOptions}
              value={selectedDeliverableType}
              onValueChange={setSelectedDeliverableType}
              placeholder="Select type..."
              searchPlaceholder="Search types..."
              emptyMessage="No types found."
            />
          </div>
        </div>

        {/* Loading state */}
        {shouldFetchDetail && isLoadingDetail && (
          <div className="flex items-center justify-center py-8">
            <PacmanLoader size={48} />
          </div>
        )}

        {/* Error state */}
        {detailError && (
          <div className="mt-4 text-sm text-destructive">
            Failed to load project details. Please try again.
          </div>
        )}
      </div>

      {/* Phase 2: Full Editor */}
      {taskDetail && (
        <DeliveryForm
          taskDetail={taskDetail}
          adhocMode
          adhocListId={selectedListId}
          adhocDeliverableType={selectedDeliverableType}
          adhocDepartment={taskDetail.template?.department ?? ""}
        />
      )}
    </div>
  );
}
