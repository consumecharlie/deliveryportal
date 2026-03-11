"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const departmentColors: Record<string, string> = {
  "Post": "bg-red-100 text-red-800 border-red-200",
  "Post-Production": "bg-red-100 text-red-800 border-red-200",
  "Pre-Pro": "bg-blue-100 text-blue-800 border-blue-200",
  "Pre-Production": "bg-blue-100 text-blue-800 border-blue-200",
  "Design": "bg-purple-100 text-purple-800 border-purple-200",
  "Production": "bg-green-100 text-green-800 border-green-200",
  "Project Management": "bg-amber-100 text-amber-800 border-amber-200",
};

/** Canonical display order for departments */
export const DEPARTMENT_ORDER = [
  "Project Management",
  "Pre-Production",
  "Pre-Pro",
  "Design",
  "Post-Production",
  "Post",
  "Production",
];

export function DepartmentBadge({ department }: { department: string }) {
  const colorClass = departmentColors[department] ?? "bg-gray-100 text-gray-800 border-gray-200";

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium justify-center w-[118px]",
        colorClass
      )}
    >
      {department || "—"}
    </Badge>
  );
}
