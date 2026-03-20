"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const departmentColors: Record<string, string> = {
  "Post": "bg-[#D63638] text-[#FBBC05] border-[#D63638]",
  "Post-Production": "bg-[#D63638] text-[#FBBC05] border-[#D63638]",
  "Pre-Pro": "bg-[#4A7CB5] text-white border-[#4A7CB5]",
  "Pre-Production": "bg-[#4A7CB5] text-white border-[#4A7CB5]",
  "Design": "bg-[#9B6BCD] text-white border-[#9B6BCD]",
  "Production": "bg-green-600 text-white border-green-600",
  "Project Management": "bg-[#6B8399] text-white border-[#6B8399]",
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
