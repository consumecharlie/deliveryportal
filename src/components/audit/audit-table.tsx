"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AtSign,
  Check,
  AlertCircle,
  Copy,
  ExternalLink,
  FileText,
  Hash,
  Loader2,
  Mail,
  Map as MapIcon,
  MessageSquare,
  RefreshCw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Users,
  UserX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfigureWizard } from "@/components/setup/configure-wizard";
import { WORKSPACE_ID } from "@/lib/custom-field-ids";

const GREEN = "#6AC387";

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

type Health = "blocker" | "warning" | "healthy" | "error";

function clickupLinkFor(issue: AuditIssue, row: ProjectAudit): string {
  if (issue.detail) {
    const c = row.contacts.find((c) => c.name === issue.detail);
    if (c) return `https://app.clickup.com/t/${c.taskId}`;
  }
  return `https://app.clickup.com/${WORKSPACE_ID}/v/li/${row.listId}`;
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

function health(row: ProjectAudit): Health {
  if (row.scanError) return "error";
  const { blockers, warnings } = countIssues(row.issues);
  if (blockers > 0) return "blocker";
  if (warnings > 0) return "warning";
  return "healthy";
}

const RANK: Record<Health, number> = { blocker: 0, warning: 1, healthy: 2, error: 3 };

const ISSUE_ICON: Record<string, LucideIcon> = {
  no_slack_channel: Hash,
  bot_not_in_channel: MessageSquare,
  contact_missing_slack_user_id: AtSign,
  no_contacts: Users,
  no_primary_contact: UserX,
  multiple_primary_contacts: Users,
  contact_missing_email: Mail,
  no_project_plan: MapIcon,
  no_template: FileText,
};

// Health → accent styling (bar + pill).
const ACCENT: Record<Health, { bar: string; pillBg: string; pillText: string; label: string; Icon: LucideIcon }> = {
  blocker: { bar: "bg-red-500", pillBg: "bg-red-500/15", pillText: "text-red-400", label: "blocker", Icon: ShieldAlert },
  warning: { bar: "bg-[#DBEF00]", pillBg: "bg-[#DBEF00]/15", pillText: "text-[#DBEF00]", label: "warning", Icon: AlertTriangle },
  healthy: { bar: "bg-[#6AC387]", pillBg: "bg-[#6AC387]/15", pillText: "text-[#6AC387]", label: "Healthy", Icon: ShieldCheck },
  error: { bar: "bg-muted-foreground/40", pillBg: "bg-muted", pillText: "text-muted-foreground", label: "Couldn't check", Icon: AlertCircle },
};

function StatusPill({ row }: { row: ProjectAudit }) {
  const h = health(row);
  const a = ACCENT[h];
  const { blockers, warnings } = countIssues(row.issues);
  const text =
    h === "blocker"
      ? `${blockers} blocker${blockers === 1 ? "" : "s"}`
      : h === "warning"
        ? `${warnings} warning${warnings === 1 ? "" : "s"}`
        : a.label;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${a.pillBg} ${a.pillText}`}>
      <a.Icon className="h-3.5 w-3.5" />
      {text}
    </span>
  );
}

function ModeBadge({ mode }: { mode: ProjectAudit["mode"] }) {
  const slack = mode === "slack";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        slack
          ? "border-[#6AC387]/40 bg-[#6AC387]/10 text-[#6AC387]"
          : "border-border bg-muted/60 text-muted-foreground"
      }`}
    >
      {slack ? <MessageSquare className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
      {slack ? "Slack" : "Email"}
    </span>
  );
}

function StatTile({
  label,
  value,
  color,
  Icon,
}: {
  label: string;
  value: number;
  color: string;
  Icon: LucideIcon;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-3xl font-semibold tabular-nums" style={{ color }}>
          {value}
        </span>
        <Icon className="h-5 w-5 opacity-70" style={{ color }} />
      </div>
      <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function InviteSnippet({ channel }: { channel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Ask a channel admin to run</span>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText("/invite @n8n");
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 font-mono text-[11px] text-foreground transition hover:border-[#6AC387]/50"
      >
        /invite @n8n
        {copied ? <Check className="h-3 w-3 text-[#6AC387]" /> : <Copy className="h-3 w-3 opacity-60" />}
      </button>
      <span>in #{channel}</span>
    </div>
  );
}

export function AuditTable() {
  const queryClient = useQueryClient();
  const [onlyIssues, setOnlyIssues] = useState(true);
  const [wizardTarget, setWizardTarget] = useState<{
    listId: string;
    clientName: string;
    projectName: string;
  } | null>(null);

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
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Scan failed");
      }
      return res.json() as Promise<{ ok: true; scanned: number }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast.success("Scan complete");
    },
    onError: (error: Error) => toast.error(error.message || "Scan failed"),
  });

  const rescanProject = async (listId: string) => {
    await fetch(`/api/audit/scan?listId=${encodeURIComponent(listId)}`, { method: "POST" });
    queryClient.invalidateQueries({ queryKey: ["audit"] });
  };

  const joinMutation = useMutation({
    mutationFn: async (v: { channelId: string; listId: string }) => {
      const res = await fetch("/api/audit/fix/join-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: v.channelId }),
      });
      if (!res.ok) {
        throw new Error(
          ((await res.json().catch(() => ({}))) as { error?: string }).error || "Join failed"
        );
      }
      return res.json();
    },
    onSuccess: async (_d, v) => {
      toast.success("Bot joined the channel");
      await rescanProject(v.listId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/audit/fix/sync-user-ids", { method: "POST" });
      if (!res.ok) {
        throw new Error(
          ((await res.json().catch(() => ({}))) as { error?: string }).error || "Sync failed"
        );
      }
      return res.json();
    },
    onSuccess: () => toast.success("Slack user-ID sync started; re-scan in a minute."),
    onError: (e: Error) => toast.error(e.message),
  });

  // The private/external bot case renders a wide inline snippet (below the
  // message) rather than a compact right-aligned control.
  const isInviteFix = (issue: AuditIssue, row: ProjectAudit) =>
    issue.type === "bot_not_in_channel" &&
    !(!!row.slackChannelId && !row.channelPrivate && !row.channelNotVisible);

  // Compact control shown on the right of the issue row. null when the fix is
  // the inline invite snippet.
  const controlFor = (issue: AuditIssue, row: ProjectAudit) => {
    if (issue.type === "bot_not_in_channel") {
      if (isInviteFix(issue, row)) return null;
      return (
        <Button
          size="sm"
          className="h-7 bg-[#6AC387] text-[#151919] hover:bg-[#5aad74]"
          disabled={joinMutation.isPending}
          onClick={() =>
            joinMutation.mutate({ channelId: row.slackChannelId as string, listId: row.listId })
          }
        >
          {joinMutation.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Hash className="mr-1.5 h-3.5 w-3.5" />
          )}
          Join
        </Button>
      );
    }
    if (issue.type === "contact_missing_slack_user_id") {
      return (
        <Button
          size="sm"
          variant="outline"
          className="h-7 whitespace-nowrap border-[#6AC387]/50 text-[#6AC387] hover:bg-[#6AC387]/10"
          disabled={syncMutation.isPending}
          onClick={() => syncMutation.mutate()}
        >
          {syncMutation.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          Sync IDs
        </Button>
      );
    }
    return (
      <a
        href={clickupLinkFor(issue, row)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        ClickUp
      </a>
    );
  };

  const results = data?.results ?? [];
  const lastScannedAt = data?.lastScannedAt ?? null;

  const summary = useMemo(() => {
    let blocker = 0, warning = 0, healthy = 0, error = 0;
    for (const r of results) {
      const h = health(r);
      if (h === "blocker") blocker += 1;
      else if (h === "warning") warning += 1;
      else if (h === "healthy") healthy += 1;
      else error += 1;
    }
    return { total: results.length, blocker, warning, healthy, error };
  }, [results]);

  const sortedResults = useMemo(() => {
    const filtered = onlyIssues
      ? results.filter((r) => r.scanError || r.issues.length > 0)
      : results;
    return [...filtered].sort((a, b) => {
      const rankDiff = RANK[health(a)] - RANK[health(b)];
      if (rankDiff !== 0) return rankDiff;
      return a.clientName.localeCompare(b.clientName);
    });
  }, [results, onlyIssues]);

  const scanButton = (
    <Button
      onClick={() => scanMutation.mutate()}
      disabled={scanMutation.isPending}
      className="bg-[#6AC387] text-[#151919] hover:bg-[#5aad74]"
    >
      {scanMutation.isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="mr-2 h-4 w-4" />
      )}
      {scanMutation.isPending ? "Scanning…" : "Re-scan"}
    </Button>
  );

  return (
    <section className="space-y-5">
      {/* Summary strip */}
      {results.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Projects" value={summary.total} color="var(--foreground)" Icon={Users} />
          <StatTile label="Blockers" value={summary.blocker} color="#ef4444" Icon={ShieldAlert} />
          <StatTile label="Warnings" value={summary.warning} color="#DBEF00" Icon={AlertTriangle} />
          <StatTile label="Healthy" value={summary.healthy} color={GREEN} Icon={ShieldCheck} />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#6AC387]" />
          {lastScannedAt ? `Scanned ${new Date(lastScannedAt).toLocaleString()}` : "No scan yet"}
        </div>
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-[#6AC387]"
              checked={onlyIssues}
              onChange={(e) => setOnlyIssues(e.target.checked)}
            />
            Only projects with issues
          </label>
          {scanButton}
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-6 py-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading audit…
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-6 py-5 text-sm text-red-400">
          Failed to load audit.
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No scan yet. Run one to check every project&apos;s comms config.</p>
          {scanButton}
        </div>
      ) : sortedResults.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-[#6AC387]/30 bg-[#6AC387]/5 px-6 py-12 text-center">
          <ShieldCheck className="h-8 w-8 text-[#6AC387]" />
          <p className="text-sm font-medium text-[#6AC387]">All clear — no projects with issues.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedResults.map((row) => {
            const h = health(row);
            const a = ACCENT[h];
            return (
              <div
                key={row.listId}
                className="relative overflow-hidden rounded-xl border border-border bg-card transition hover:border-foreground/20"
              >
                <span className={`absolute left-0 top-0 h-full w-1 ${a.bar}`} />
                <div className="grid grid-cols-1 md:grid-cols-[minmax(200px,240px)_1fr]">
                  {/* Left: project identity */}
                  <div className="flex flex-col gap-2 py-3.5 pl-5 pr-4 md:border-r md:border-border/60">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {row.clientName}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {row.projectName}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ModeBadge mode={row.mode} />
                      <StatusPill row={row} />
                    </div>
                    {row.mode === "slack" ? (
                      <Button
                        size="xs"
                        variant="outline"
                        className="w-fit whitespace-nowrap border-[#6AC387]/50 text-[#6AC387] hover:bg-[#6AC387]/10"
                        onClick={() =>
                          setWizardTarget({
                            listId: row.listId,
                            clientName: row.clientName,
                            projectName: row.projectName,
                          })
                        }
                      >
                        <Settings2 className="mr-1 h-3 w-3" />
                        Configure from channel
                      </Button>
                    ) : null}
                  </div>

                  {/* Right: issues */}
                  <div className="py-3.5 pl-5 pr-4 md:pl-4">
                    {row.scanError ? (
                      <p className="text-xs text-muted-foreground">{row.scanError}</p>
                    ) : row.issues.length > 0 ? (
                      <ul className="divide-y divide-border/50">
                        {row.issues.map((issue, i) => {
                          const Icon = ISSUE_ICON[issue.type] ?? AlertCircle;
                          const isBlocker = issue.severity === "blocker";
                          const control = controlFor(issue, row);
                          return (
                            <li
                              key={`${issue.type}-${i}`}
                              className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0"
                            >
                              <div className="flex min-w-0 items-start gap-2.5">
                                <span
                                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded ${
                                    isBlocker
                                      ? "bg-red-500/15 text-red-400"
                                      : "bg-[#DBEF00]/15 text-[#DBEF00]"
                                  }`}
                                >
                                  <Icon className="h-3 w-3" />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-sm leading-snug text-foreground">
                                    {issue.message}
                                  </p>
                                  {issue.detail ? (
                                    <p className="text-xs text-muted-foreground">
                                      {issue.detail}
                                    </p>
                                  ) : null}
                                  {isInviteFix(issue, row) ? (
                                    <InviteSnippet
                                      channel={row.slackChannelName ?? row.slackChannelId ?? ""}
                                    />
                                  ) : null}
                                </div>
                              </div>
                              {control ? <div className="shrink-0">{control}</div> : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="flex items-center gap-1.5 text-xs text-[#6AC387]">
                        <Check className="h-3.5 w-3.5" /> Fully configured.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {wizardTarget ? (
        <ConfigureWizard
          listId={wizardTarget.listId}
          clientName={wizardTarget.clientName}
          projectName={wizardTarget.projectName}
          open={!!wizardTarget}
          onOpenChange={(v) => {
            if (!v) setWizardTarget(null);
          }}
        />
      ) : null}
    </section>
  );
}
