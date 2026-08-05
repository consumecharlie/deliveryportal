"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface AuditIssue {
  type: string;
  severity: "blocker" | "warning";
  message: string;
  detail?: string;
}

interface ProjectAudit {
  listId: string;
  clientName: string;
  projectName: string;
  mode: "email" | "slack";
  slackChannelId: string | null;
  slackChannelName: string | null;
  botInChannel: boolean | null;
  channelPrivate: boolean;
  channelNotVisible: boolean;
  contacts: Array<{ taskId: string; name: string; role: string }>;
  issues: AuditIssue[];
  scanError?: string;
}

interface AuditResponse {
  results: ProjectAudit[];
  lastScannedAt: string | null;
}

function countIssues(issues: AuditIssue[]) {
  let blockers = 0;
  let warnings = 0;
  for (const issue of issues) {
    if (issue.severity === "blocker") blockers += 1;
    else warnings += 1;
  }
  return { blockers, warnings };
}

// Sort rank: lower sorts first. Blockers before warnings before healthy.
// scanError rows sort after healthy (can't determine health).
function sortRank(row: ProjectAudit): number {
  if (row.scanError) return 3;
  const { blockers, warnings } = countIssues(row.issues);
  if (blockers > 0) return 0;
  if (warnings > 0) return 1;
  return 2;
}

function StatusPill({ row }: { row: ProjectAudit }) {
  if (row.scanError) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        Couldn&apos;t check
      </span>
    );
  }
  const { blockers, warnings } = countIssues(row.issues);
  if (blockers > 0) {
    return (
      <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
        {blockers} blocker{blockers === 1 ? "" : "s"}
      </span>
    );
  }
  if (warnings > 0) {
    return (
      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
        {warnings} warning{warnings === 1 ? "" : "s"}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
      Healthy
    </span>
  );
}

function ModeBadge({ mode }: { mode: ProjectAudit["mode"] }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {mode === "slack" ? "Slack" : "Email"}
    </span>
  );
}

export function AuditTable() {
  const queryClient = useQueryClient();
  const [onlyIssues, setOnlyIssues] = useState(true);

  const { data, isLoading, isError } = useQuery<AuditResponse>({
    queryKey: ["audit"],
    queryFn: async () => {
      const res = await fetch("/api/audit");
      if (!res.ok) throw new Error("Failed to fetch audit");
      return res.json();
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/audit/scan", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || "Scan failed");
      }
      return res.json() as Promise<{ ok: true; scanned: number }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast.success("Scan complete");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Scan failed");
    },
  });

  const results = data?.results ?? [];
  const lastScannedAt = data?.lastScannedAt ?? null;

  const sortedResults = useMemo(() => {
    const filtered = onlyIssues
      ? results.filter((r) => r.scanError || r.issues.length > 0)
      : results;
    return [...filtered].sort((a, b) => {
      const rankDiff = sortRank(a) - sortRank(b);
      if (rankDiff !== 0) return rankDiff;
      return a.clientName.localeCompare(b.clientName);
    });
  }, [results, onlyIssues]);

  const scanButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => scanMutation.mutate()}
      disabled={scanMutation.isPending}
    >
      {scanMutation.isPending ? "Scanning…" : "Re-scan"}
    </Button>
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          {lastScannedAt
            ? `Last scanned ${new Date(lastScannedAt).toLocaleString()}`
            : "No scan yet"}
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={onlyIssues}
              onChange={(e) => setOnlyIssues(e.target.checked)}
            />
            Only projects with issues
          </label>
          {scanButton}
        </div>
      </div>

      {isLoading ? (
        <Card className="px-6 py-4 text-sm text-muted-foreground">
          Loading…
        </Card>
      ) : isError ? (
        <Card className="px-6 py-4 text-sm text-destructive">
          Failed to load audit
        </Card>
      ) : results.length === 0 ? (
        <Card className="flex-row items-center justify-between gap-4 px-6 py-4">
          <span className="text-sm text-muted-foreground">
            No scan yet — run one.
          </span>
          {scanButton}
        </Card>
      ) : sortedResults.length === 0 ? (
        <Card className="px-6 py-4 text-sm text-muted-foreground">
          No projects with issues. 🎉
        </Card>
      ) : (
        <div className="space-y-2">
          {sortedResults.map((row) => (
            <Card key={row.listId} className="gap-3 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{row.clientName}</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-sm">{row.projectName}</span>
                <ModeBadge mode={row.mode} />
                <span className="ml-auto">
                  <StatusPill row={row} />
                </span>
              </div>

              {row.scanError ? (
                <p className="text-xs text-muted-foreground">{row.scanError}</p>
              ) : row.issues.length > 0 ? (
                <ul className="space-y-1.5">
                  {row.issues.map((issue, i) => (
                    <li
                      key={`${issue.type}-${i}`}
                      className={
                        issue.severity === "blocker"
                          ? "text-sm text-red-600 dark:text-red-400"
                          : "text-sm text-amber-600 dark:text-amber-400"
                      }
                    >
                      <span className="font-medium">{issue.message}</span>
                      {issue.detail ? (
                        <span className="block text-xs opacity-80">
                          {issue.detail}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
