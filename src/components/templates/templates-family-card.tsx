"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TemplateVariantItem } from "./template-variant-item";
import type { DeliverySnippetTemplate } from "@/lib/types";

interface TemplatesFamilyCardProps {
  familyName: string;
  templates: DeliverySnippetTemplate[];
  onSelectTemplate: (taskId: string) => void;
}

export function TemplatesFamilyCard({
  familyName,
  templates,
  onSelectTemplate,
}: TemplatesFamilyCardProps) {
  return (
    <Card className="py-4 gap-3">
      <CardHeader className="pb-0">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{familyName}</CardTitle>
          <span className="inline-flex items-center justify-center rounded-full bg-muted px-2 min-w-[22px] text-[11px] font-semibold text-muted-foreground">
            {templates.length}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-3">
        <div className="flex flex-col gap-0.5">
          {templates.map((t) => (
            <TemplateVariantItem
              key={t.taskId}
              template={t}
              onSelect={onSelectTemplate}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
