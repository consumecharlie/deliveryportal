"use client";

import { useState } from "react";
import { DepartmentBadge } from "@/components/dashboard/department-badge";
import { extractVersionSuffix } from "@/lib/template-families";
import { CheckCircle2, AlertCircle, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import type { DeliverySnippetTemplate } from "@/lib/types";

interface TemplateVariantItemProps {
  template: DeliverySnippetTemplate;
  onSelect: (taskId: string) => void;
}

/** A template is "complete" when it has both a subject line and body snippet. */
function isComplete(t: DeliverySnippetTemplate): boolean {
  const hasSubject = !!t.subjectLine?.trim();
  const hasBody = !!t.snippet?.trim();
  return hasSubject && hasBody;
}

export function TemplateVariantItem({
  template,
  onSelect,
}: TemplateVariantItemProps) {
  const [expanded, setExpanded] = useState(false);
  const suffix = extractVersionSuffix(template.deliverableType || "");
  const complete = isComplete(template);

  return (
    <div className="rounded-md transition-colors hover:bg-muted/40">
      {/* ── Main row — click anywhere to open editor ────────── */}
      <div
        className="flex w-full items-center gap-2 px-3 py-2.5 text-sm cursor-pointer"
        onClick={() => onSelect(template.taskId)}
      >
        {/* Completeness indicator */}
        {complete ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
        ) : (
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
        )}

        {/* Version badge */}
        <span className="inline-flex min-w-[90px] shrink-0 items-center justify-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {suffix ?? "Base"}
        </span>

        {/* Template name */}
        <span className="flex-1 truncate font-medium">{template.name}</span>

        {/* Department badge */}
        {template.department && (
          <DepartmentBadge department={template.department} />
        )}

        {/* Expand/collapse toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((prev) => !prev);
          }}
          className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={expanded ? "Collapse details" : "Expand details"}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* ── Expanded details ─────────────────────────────────── */}
      {expanded && (
        <div className="mx-3 mb-2.5 ml-9 rounded-md border bg-muted/30 px-3 py-2.5 text-xs space-y-1.5">
          <div className="flex items-start gap-1.5">
            <span className="font-medium text-muted-foreground w-16 shrink-0">Subject</span>
            <span className={template.subjectLine?.trim() ? "text-foreground" : "italic text-muted-foreground"}>
              {template.subjectLine?.trim() || "Not set"}
            </span>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="font-medium text-muted-foreground w-16 shrink-0">Sender</span>
            <span className={template.senderName || template.senderEmail ? "text-foreground" : "italic text-muted-foreground"}>
              {template.senderName || template.senderEmail || "Not set"}
            </span>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="font-medium text-muted-foreground w-16 shrink-0">Body</span>
            <span className={template.snippet?.trim() ? "text-foreground line-clamp-2" : "italic text-muted-foreground"}>
              {template.snippet?.trim()
                ? template.snippet.trim().slice(0, 160) + (template.snippet.trim().length > 160 ? "…" : "")
                : "Empty"}
            </span>
          </div>

          {/* Open / Edit button */}
          <button
            type="button"
            onClick={() => onSelect(template.taskId)}
            className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ExternalLink className="h-3 w-3" />
            Open Template
          </button>
        </div>
      )}
    </div>
  );
}
