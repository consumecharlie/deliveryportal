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

  const handleConfirm = () => {
    if (!selectedProject || !selectedType) return;
    onConfirm({
      listId: selectedProject.listId,
      projectName: selectedProject.projectName,
      deliverableType: selectedType,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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

            {/* Clickable delivery deadlines — selecting one sets the type directly */}
            {selectedProject?.activeDeliveryDeadlines?.length ? (
              <div className="space-y-2">
                <Label>Select a delivery to combine</Label>
                <div className="space-y-1.5">
                  {selectedProject.activeDeliveryDeadlines.map((d) => (
                    <button
                      key={d.taskId}
                      type="button"
                      onClick={() => setSelectedType(d.deliverableType || "")}
                      className={`w-full flex items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors min-w-0 ${
                        selectedType === d.deliverableType
                          ? "border-[#6AC387] bg-[#6AC387]/10"
                          : "border-border/50 hover:border-border hover:bg-muted/30"
                      }`}
                    >
                      <span className="font-medium flex-1 truncate">
                        {d.deliverableType || d.taskName}
                      </span>
                      {d.dueDate && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDueDate(d.dueDate)}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground capitalize">
                        {d.status}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : selectedProject ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  No active delivery deadlines — select a template type manually.
                </p>
                <SearchableSelect
                  options={deliverableTypeOptions}
                  value={selectedType}
                  onValueChange={setSelectedType}
                  placeholder="Select deliverable type..."
                  searchPlaceholder="Search types..."
                />
              </div>
            ) : null}
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
