"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import PacmanLoader from "@/components/ui/pacman-loader";
import { DepartmentBadge } from "@/components/dashboard/department-badge";
import type { LintIssue } from "@/lib/template-lint";

interface AuditedTemplate {
  taskId: string;
  name: string;
  deliverableType: string;
  department: string;
  errors: number;
  warnings: number;
  issues: LintIssue[];
}

interface PreviewResponse {
  taskId: string;
  name: string;
  deliverableType: string;
  department: string;
  before: string;
  after: string;
  beforeIssues: LintIssue[];
  afterIssues: LintIssue[];
  unchanged: boolean;
}

type FilterMode = "all" | "issues" | "errors" | "clean";

export default function TemplatesAuditPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterMode>("issues");
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<{
    templates: AuditedTemplate[];
  }>({
    queryKey: ["templates-audit"],
    queryFn: async () => {
      const res = await fetch("/api/templates/audit");
      if (!res.ok) throw new Error("Failed to load audit");
      return res.json();
    },
  });

  const templates = data?.templates ?? [];

  const filtered = useMemo(() => {
    switch (filter) {
      case "errors":
        return templates.filter((t) => t.errors > 0);
      case "issues":
        return templates.filter((t) => t.errors + t.warnings > 0);
      case "clean":
        return templates.filter((t) => t.errors + t.warnings === 0);
      default:
        return templates;
    }
  }, [templates, filter]);

  const summary = useMemo(() => {
    const withErrors = templates.filter((t) => t.errors > 0).length;
    const withWarnings = templates.filter(
      (t) => t.errors === 0 && t.warnings > 0
    ).length;
    const clean = templates.filter((t) => t.errors + t.warnings === 0).length;
    return { total: templates.length, withErrors, withWarnings, clean };
  }, [templates]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/templates")}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="font-eighties text-2xl">Template Audit</h1>
          <p className="text-sm text-muted-foreground">
            Scans every delivery snippet for formatting issues, deprecated
            variables, and drift from the Magic Cleanup standard.
          </p>
        </div>
      </div>

      {/* Summary cards */}
      {!isLoading && !error && templates.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <SummaryCard
            label="Templates"
            value={summary.total}
            icon={null}
            tone="neutral"
          />
          <SummaryCard
            label="With Errors"
            value={summary.withErrors}
            icon={<AlertCircle className="h-4 w-4" />}
            tone="error"
          />
          <SummaryCard
            label="With Warnings"
            value={summary.withWarnings}
            icon={<AlertTriangle className="h-4 w-4" />}
            tone="warning"
          />
          <SummaryCard
            label="Clean"
            value={summary.clean}
            icon={<CheckCircle2 className="h-4 w-4" />}
            tone="success"
          />
        </div>
      )}

      {/* Filter chips */}
      {!isLoading && !error && templates.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ["issues", `Has issues (${summary.withErrors + summary.withWarnings})`],
              ["errors", `Errors only (${summary.withErrors})`],
              ["clean", `Clean (${summary.clean})`],
              ["all", `All (${summary.total})`],
            ] as Array<[FilterMode, string]>
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-all ${
                filter === mode
                  ? "bg-[#6AC387]/20 border-[#6AC387]/40 text-foreground"
                  : "bg-muted border-border text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <PacmanLoader size={32} />
          <span className="font-pixel text-[13px]" style={{ color: "#6AC387" }}>
            AUDITING TEMPLATES
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center py-12 text-destructive text-sm">
          Failed to audit templates. Check the ClickUp connection.
        </div>
      )}

      {/* Table */}
      {!isLoading && !error && filtered.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Template</TableHead>
                  <TableHead>Deliverable Type</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Errors</TableHead>
                  <TableHead>Warnings</TableHead>
                  <TableHead className="text-right pr-4">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.taskId}>
                    <TableCell className="pl-4 font-medium">
                      <button
                        onClick={() => router.push(`/templates/${t.taskId}`)}
                        className="hover:underline text-left"
                      >
                        {t.name}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {t.deliverableType || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {t.department ? (
                        <DepartmentBadge department={t.department} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {t.errors > 0 ? (
                        <Badge className="bg-red-500/15 text-red-700 border-red-500/30 hover:bg-red-500/20">
                          {t.errors}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {t.warnings > 0 ? (
                        <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 hover:bg-amber-500/20">
                          {t.warnings}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      {t.errors + t.warnings > 0 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPreviewTaskId(t.taskId)}
                        >
                          Preview Fix
                        </Button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#6AC387]" />
                          Clean
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          {filter === "clean"
            ? "No clean templates yet."
            : "Nothing matches this filter."}
        </div>
      )}

      {/* Preview Fix dialog */}
      {previewTaskId && (
        <PreviewFixDialog
          taskId={previewTaskId}
          onClose={() => setPreviewTaskId(null)}
          onApplied={() => {
            setPreviewTaskId(null);
            refetch();
            queryClient.invalidateQueries({ queryKey: ["templates"] });
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "neutral" | "error" | "warning" | "success";
}) {
  const toneClass = {
    neutral: "text-muted-foreground",
    error: "text-red-600",
    warning: "text-amber-600",
    success: "text-[#6AC387]",
  }[tone];
  return (
    <Card>
      <CardContent className="pt-3 pb-3">
        <div className="flex items-center gap-2">
          <span className={toneClass}>{icon}</span>
          <div>
            <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
            <p className="text-[11px] text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewFixDialog({
  taskId,
  onClose,
  onApplied,
}: {
  taskId: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { data, isLoading, error } = useQuery<PreviewResponse>({
    queryKey: ["preview-cleanup", taskId],
    queryFn: async () => {
      const res = await fetch(`/api/templates/preview-cleanup/${taskId}`);
      if (!res.ok) throw new Error("Failed to load preview");
      return res.json();
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("no preview data");
      const res = await fetch(`/api/templates/edit/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snippet: data.after }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to apply cleanup");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Cleanup applied", {
        description: data?.name ?? "Template",
      });
      onApplied();
    },
    onError: (e) => {
      toast.error("Couldn't apply cleanup", {
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[min(1700px,95vw)] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{data?.name ?? "Preview cleanup"}</DialogTitle>
          <DialogDescription>
            Side-by-side: current snippet vs. what Magic Cleanup would save.
            Nothing is written to ClickUp until you click Apply.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <PacmanLoader size={24} />
          </div>
        )}
        {error && (
          <div className="text-destructive text-sm py-4">
            Failed to load preview.
          </div>
        )}
        {data && (
          <div className="flex-1 min-h-0 overflow-hidden grid grid-cols-2 gap-3">
            <DiffPanel title="Before" issues={data.beforeIssues} text={data.before} />
            <DiffPanel title="After (Magic Cleanup)" issues={data.afterIssues} text={data.after} />
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!data || data.unchanged || applyMutation.isPending}
            onClick={() => applyMutation.mutate()}
          >
            {data?.unchanged
              ? "No changes to apply"
              : applyMutation.isPending
                ? "Applying…"
                : "Apply & Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DiffPanel({
  title,
  text,
  issues,
}: {
  title: string;
  text: string;
  issues: LintIssue[];
}) {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  // Group line-anchored issues by line number for fast lookup. Issues
  // without a lineNumber (e.g. the `not-cleanup-compliant` whole-doc
  // rule) are surfaced as a callout above the preview, since there's
  // no specific row to highlight.
  const issuesByLine = new Map<number, LintIssue[]>();
  const wholeDocIssues: LintIssue[] = [];
  for (const issue of issues) {
    if (issue.lineNumber === undefined) {
      wholeDocIssues.push(issue);
      continue;
    }
    const existing = issuesByLine.get(issue.lineNumber) ?? [];
    existing.push(issue);
    issuesByLine.set(issue.lineNumber, existing);
  }

  const lines = text.split("\n");

  return (
    <div className="flex flex-col min-h-0 border rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b shrink-0">
        <span className="text-xs font-semibold">{title}</span>
        <div className="flex items-center gap-1">
          {errors.length > 0 && (
            <Badge className="bg-red-500/15 text-red-700 border-red-500/30 text-[10px]">
              {errors.length} error{errors.length === 1 ? "" : "s"}
            </Badge>
          )}
          {warnings.length > 0 && (
            <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 text-[10px]">
              {warnings.length} warning{warnings.length === 1 ? "" : "s"}
            </Badge>
          )}
          {issues.length === 0 && (
            <Badge className="bg-[#6AC387]/20 text-[#3a7a48] border-[#6AC387]/40 text-[10px]">
              clean
            </Badge>
          )}
        </div>
      </div>

      {wholeDocIssues.length > 0 && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 shrink-0">
          {wholeDocIssues.map((issue, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto text-[12px] leading-snug font-mono">
        {lines.map((line, i) => {
          const lineIssues = issuesByLine.get(i + 1) ?? [];
          const hasError = lineIssues.some((x) => x.severity === "error");
          const hasWarning =
            !hasError && lineIssues.some((x) => x.severity === "warning");
          const tooltip = lineIssues
            .map((x) => `${x.severity.toUpperCase()}: ${x.message}`)
            .join("\n");

          return (
            <div
              key={i}
              title={tooltip || undefined}
              className={
                hasError
                  ? "border-l-2 border-red-500 bg-red-500/10 pl-2 pr-3 py-0.5 whitespace-pre-wrap break-words"
                  : hasWarning
                    ? "border-l-2 border-amber-500 bg-amber-500/10 pl-2 pr-3 py-0.5 whitespace-pre-wrap break-words"
                    : "border-l-2 border-transparent pl-2 pr-3 py-0.5 whitespace-pre-wrap break-words"
              }
            >
              {line.length > 0 ? line : " "}
            </div>
          );
        })}
      </div>
    </div>
  );
}
