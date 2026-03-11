"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  departmentColors,
  DEPARTMENT_ORDER,
} from "@/components/dashboard/department-badge";
import { TemplatesGrid } from "@/components/templates/templates-grid";
import { groupTemplatesByFamily } from "@/lib/template-families";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { DeliverySnippetTemplate } from "@/lib/types";

export default function TemplatesPage() {
  const router = useRouter();
  const [activeDept, setActiveDept] = useState<string>("All");

  const { data, isLoading, error } = useQuery<{
    templates: DeliverySnippetTemplate[];
  }>({
    queryKey: ["templates"],
    queryFn: async () => {
      const res = await fetch("/api/templates");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to fetch templates");
      }
      return res.json();
    },
  });

  const templates = data?.templates ?? [];

  // Extract unique departments, ordered by DEPARTMENT_ORDER
  const departments = useMemo(() => {
    const present = new Set<string>();
    for (const t of templates) {
      if (t.department) present.add(t.department);
    }
    const ordered = DEPARTMENT_ORDER.filter((d) => present.has(d));
    const extras = Array.from(present)
      .filter((d) => !DEPARTMENT_ORDER.includes(d))
      .sort();
    return ["All", ...ordered, ...extras];
  }, [templates]);

  // Filtered templates
  const filtered = useMemo(() => {
    if (activeDept === "All") return templates;
    return templates.filter((t) => t.department === activeDept);
  }, [templates, activeDept]);

  // Group filtered templates into families
  const families = useMemo(
    () => groupTemplatesByFamily(filtered),
    [filtered]
  );

  // Count per department for badge numbers
  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = { All: templates.length };
    for (const t of templates) {
      if (t.department) {
        counts[t.department] = (counts[t.department] || 0) + 1;
      }
    }
    return counts;
  }, [templates]);

  const handleSelectTemplate = useCallback(
    (taskId: string) => router.push(`/templates/${taskId}`),
    [router]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground">
            Manage delivery snippet templates used for client communications.
          </p>
        </div>
        <Button onClick={() => router.push("/templates/new")}>
          <Plus className="mr-2 h-4 w-4" />
          Create Template
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Loading templates...
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center py-12 gap-1">
          <p className="text-destructive font-medium">
            Failed to load templates
          </p>
          <p className="text-sm text-muted-foreground max-w-lg text-center">
            {error instanceof Error
              ? error.message
              : "Check your ClickUp API connection."}
          </p>
        </div>
      )}

      {!isLoading && !error && templates.length === 0 && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          No templates found in the Delivery Snippets list.
        </div>
      )}

      {templates.length > 0 && (
        <>
          {/* Department filter tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {departments.map((dept) => {
              const isActive = activeDept === dept;
              const deptColor =
                dept === "All"
                  ? "bg-gray-100 text-gray-800 border-gray-200"
                  : departmentColors[dept] ??
                    "bg-gray-100 text-gray-800 border-gray-200";

              return (
                <button
                  key={dept}
                  onClick={() => setActiveDept(dept)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-all",
                    isActive
                      ? cn(deptColor, "ring-2 ring-offset-1 ring-current/25 shadow-sm")
                      : cn(deptColor, "opacity-60 hover:opacity-90")
                  )}
                >
                  {dept === "All" ? "All" : dept}
                  <span
                    className={cn(
                      "inline-flex items-center justify-center rounded-full px-1.5 min-w-[18px] text-[10px] font-semibold",
                      isActive
                        ? "bg-black/10"
                        : "bg-black/5"
                    )}
                  >
                    {deptCounts[dept] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Templates grid grouped by family */}
          <TemplatesGrid
            families={families}
            onSelectTemplate={handleSelectTemplate}
          />
        </>
      )}
    </div>
  );
}
