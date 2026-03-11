"use client";

import { TemplatesFamilyCard } from "./templates-family-card";
import type { TemplateFamily } from "@/lib/template-families";

interface TemplatesGridProps {
  families: TemplateFamily[];
  onSelectTemplate: (taskId: string) => void;
}

export function TemplatesGrid({
  families,
  onSelectTemplate,
}: TemplatesGridProps) {
  if (families.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        No templates in this department.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {families.map((family) => (
        <TemplatesFamilyCard
          key={family.familyName}
          familyName={family.familyName}
          templates={family.templates}
          onSelectTemplate={onSelectTemplate}
        />
      ))}
    </div>
  );
}
