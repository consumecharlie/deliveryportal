"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const departmentColors: Record<string, string> = {
  "Post": "bg-[#FA0000] text-white border-[#FA0000]",
  "Post-Production": "bg-[#FA0000] text-white border-[#FA0000]",
  "Pre-Pro": "bg-[#0084BD] text-white border-[#0084BD]",
  "Pre-Production": "bg-[#0084BD] text-white border-[#0084BD]",
  "Design": "bg-[#854AFF] text-white border-[#854AFF]",
  "Production": "bg-green-600 text-white border-green-600",
  "Project Management": "bg-[#627885] text-white border-[#627885]",
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
