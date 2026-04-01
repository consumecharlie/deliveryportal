"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Calendar } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/shared/searchable-select";

interface ActiveDeliveryDeadline {
  taskId: string;
  taskName: string;
  deliverableType: string;
  department: string;
  dueDate: string | null;
  status: string;
}

interface EligibleProject {
  listId: string;
  projectName: string;
  clientName: string;
  primaryContactName: string;
  primaryContactEmail: string;
  hasActiveDeliveryDeadlines: boolean;
  activeDeliveryDeadlines: ActiveDeliveryDeadline[];
}

export interface AddonSelection {
  listId: string;
  projectName: string;
  deliverableType: string;
}

interface AddonProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentListId: string;
  deliverableTypeOptions: Array<{ value: string; label: string }>;
  onConfirm: (selection: AddonSelection) => void;
}

function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return "";
  const date = new Date(Number(dueDate));
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function AddonProjectModal({
  open,
  onOpenChange,
  currentListId,
  deliverableTypeOptions,
  onConfirm,
}: AddonProjectModalProps) {
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");

  const { data, isLoading } = useQuery<{ projects: EligibleProject[] }>({
    queryKey: ["eligible-addons", currentListId],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(currentListId)}/eligible-addons`
      );
      if (!res.ok) throw new Error("Failed to fetch eligible projects");
      return res.json();
    },
    enabled: open && !!currentListId,
    staleTime: 5 * 60_000,
  });

  const projects = data?.projects ?? [];
  // Prioritize projects with active delivery deadlines
  const sortedProjects = [...projects].sort((a, b) => {
    if (a.hasActiveDeliveryDeadlines && !b.hasActiveDeliveryDeadlines) return -1;
    if (!a.hasActiveDeliveryDeadlines && b.hasActiveDeliveryDeadlines) return 1;
    return 0;
  });

  const selectedProject = projects.find((p) => p.listId === selectedListId);

  // Auto-select project if there's exactly one with active deadlines
  useEffect(() => {
    if (!open) {
      setSelectedListId("");
      setSelectedType("");
      return;
    }
    const withDeadlines = projects.filter((p) => p.hasActiveDeliveryDeadlines);
    if (withDeadlines.length === 1 && !selectedListId) {
      setSelectedListId(withDeadlines[0].listId);
    }
  }, [open, projects, selectedListId]);

  // Auto-select deliverable type from the project's active deadline
  useEffect(() => {
    if (!selectedProject || selectedType) return;
    const deadlines = selectedProject.activeDeliveryDeadlines ?? [];
    if (deadlines.length === 1 && deadlines[0].deliverableType) {
      setSelectedType(deadlines[0].deliverableType);
    }
  }, [selectedProject, selectedType]);

  const handleConfirm = () => {
    if (!selectedProject || !selectedType) return;
    onConfirm({
      listId: selectedProject.listId,
      projectName: selectedProject.projectName,
      deliverableType: selectedType,
    });
    onOpenChange(false);
  };

  // Build suggested deliverable types: deadlines first, then all options
  const suggestedTypes =
    selectedProject?.activeDeliveryDeadlines
      ?.filter((d) => d.deliverableType)
      .map((d) => d.deliverableType) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Project to Delivery
          </DialogTitle>
          <DialogDescription>
            Combine another project into this delivery. Both projects share the
            same primary contact.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : projects.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No eligible projects found. Projects must be in the same client
            folder and share the same primary contact.
          </p>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Project</Label>
              <SearchableSelect
                options={sortedProjects.map((p) => ({
                  value: p.listId,
                  label: p.hasActiveDeliveryDeadlines
                    ? `${p.projectName}`
                    : `${p.projectName} (no pending deliveries)`,
                }))}
                value={selectedListId}
                onValueChange={(val) => {
                  setSelectedListId(val);
                  setSelectedType(""); // Reset type when project changes
                }}
                placeholder="Select project..."
                searchPlaceholder="Search projects..."
              />
            </div>

            {/* Show active delivery deadlines as context */}
            {selectedProject?.activeDeliveryDeadlines?.length ? (
              <div className="rounded-md border border-border/50 bg-muted/30 p-3 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Active delivery deadlines:
                </p>
                {selectedProject.activeDeliveryDeadlines.map((d) => (
                  <div
                    key={d.taskId}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="font-medium">{d.deliverableType || d.taskName}</span>
                    {d.dueDate && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {formatDueDate(d.dueDate)}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground capitalize">
                      ({d.status})
                    </span>
                  </div>
                ))}
              </div>
            ) : selectedProject ? (
              <p className="text-xs text-muted-foreground">
                No active delivery deadlines — you can still combine with a
                template of your choice.
              </p>
            ) : null}

            {selectedListId && (
              <div className="space-y-2">
                <Label>
                  Deliverable Type
                  {suggestedTypes.length > 0 && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      (auto-suggested from deadline)
                    </span>
                  )}
                </Label>
                <SearchableSelect
                  options={deliverableTypeOptions}
                  value={selectedType}
                  onValueChange={setSelectedType}
                  placeholder="Select deliverable type..."
                  searchPlaceholder="Search types..."
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedListId || !selectedType}
            className="bg-[#6AC387] hover:bg-[#5aad74] text-[#151919]"
          >
            Add Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
