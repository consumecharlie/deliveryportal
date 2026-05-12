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

/**
 * Hex versions of the department colors above, for use anywhere that
 * needs a raw color string (e.g. Recharts `fill`, inline `backgroundColor`).
 * Kept in lockstep with `departmentColors` — update both together.
 */
export const departmentChartColors: Record<string, string> = {
  "Post": "#FA0000",
  "Post-Production": "#FA0000",
  "Pre-Pro": "#0084BD",
  "Pre-Production": "#0084BD",
  "Design": "#854AFF",
  "Production": "#16A34A", // matches Tailwind's green-600
  "Project Management": "#627885",
};

/** Look up a department's chart color with a neutral gray fallback. */
export function getDepartmentChartColor(department: string): string {
  return departmentChartColors[department] ?? "#94A3B8"; // slate-400
}

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
