"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { X, AlertCircle, Eye, Mail, MessageSquare, FlaskConical } from "lucide-react";
import { SchedulePreviewDialog } from "./schedule-preview-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ScheduledRow {
  id: string;
  taskId: string;
  savedBy: string;
  scheduledFor: string | null;
  isComplete: boolean;
  missing: string[];
  primaryEmail: string;
  ccEmails: string;
  senderEmail: string;
  deliverableType: string;
  postToSlack: boolean;
  slackChannelName: string;
  subjectLine: string;
  emailContent: string;
  slackContent: string;
  projectName: string;
  clientName: string;
  testMode: boolean;
}

function fmtET(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function ScheduledList() {
  const queryClient = useQueryClient();
  const [pendingCancel, setPendingCancel] = useState<ScheduledRow | null>(null);
  const [previewRow, setPreviewRow] = useState<ScheduledRow | null>(null);

  const { data, isLoading, isError } = useQuery<{ scheduled: ScheduledRow[] }>({
    queryKey: ["scheduled", "list"],
    queryFn: async () => {
      const res = await fetch("/api/scheduled");
      if (!res.ok) throw new Error("Failed to load scheduled");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const cancelMutation = useMutation({
    mutationFn: async (row: ScheduledRow) => {
      const res = await fetch(`/api/drafts/${row.taskId}/schedule`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to cancel schedule");
      }
    },
    onSuccess: () => {
      toast.success("Schedule cancelled — back in Drafts");
      queryClient.invalidateQueries({ queryKey: ["scheduled", "list"] });
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
      setPendingCancel(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <Card className="p-4 text-muted-foreground">Loading…</Card>;
  }
  if (isError) {
    return (
      <Card className="p-4 text-destructive">Failed to load scheduled items.</Card>
    );
  }

  const rows = data?.scheduled ?? [];
  if (rows.length === 0) {
    return (
      <Card className="p-6 text-muted-foreground">
        Nothing scheduled. Use Send → Schedule send on a delivery to queue one.
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {rows.map((row) => {
          const recipient = row.postToSlack
            ? row.slackChannelName
              ? `#${row.slackChannelName}`
              : "(Slack)"
            : row.primaryEmail || "(no recipient)";
          const projectLine = [row.clientName, row.projectName]
            .filter(Boolean)
            .join(" / ");
          return (
            <Card
              key={row.id}
              className="flex flex-row items-center gap-3 px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-base font-semibold truncate">
                    {projectLine || row.deliverableType || "(untitled)"}
                  </div>
                  {row.postToSlack ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-purple-500/30 shrink-0">
                      <MessageSquare className="h-3 w-3" />
                      Slack
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-sky-500/30 shrink-0">
                      <Mail className="h-3 w-3" />
                      Email
                    </span>
                  )}
                  {row.testMode && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-amber-500/30 shrink-0">
                      <FlaskConical className="h-3 w-3" />
                      Test
                    </span>
                  )}
                </div>
                <div className="text-sm truncate mt-0.5">
                  {row.subjectLine || (
                    <span className="text-muted-foreground italic">(no subject)</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {row.deliverableType ? `${row.deliverableType} · ` : ""}
                  To <span className="font-mono">{recipient}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Sends {fmtET(row.scheduledFor)}
                </div>
                {!row.isComplete && row.missing.length > 0 && (
                  <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Incomplete: missing {row.missing.join(", ")}
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewRow(row)}
                aria-label={`Preview scheduled send for ${projectLine || row.taskId}`}
              >
                <Eye className="h-4 w-4 mr-1.5" />
                Preview
              </Button>
              <Link href={`/deliverable/${row.taskId}`}>
                <Button variant="outline" size="sm">
                  Edit
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Cancel schedule for ${projectLine || row.taskId}`}
                onClick={() => setPendingCancel(row)}
              >
                <X className="h-4 w-4" />
              </Button>
            </Card>
          );
        })}
      </div>

      <SchedulePreviewDialog
        open={previewRow != null}
        onOpenChange={(open) => !open && setPreviewRow(null)}
        row={previewRow}
      />

      <AlertDialog
        open={pendingCancel != null}
        onOpenChange={(open) =>
          !cancelMutation.isPending && !open && setPendingCancel(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel scheduled send?</AlertDialogTitle>
            <AlertDialogDescription>
              The delivery moves back to Drafts. You can reschedule or send it
              later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>
              Keep scheduled
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelMutation.isPending}
              onClick={() => pendingCancel && cancelMutation.mutate(pendingCancel)}
            >
              {cancelMutation.isPending ? "Cancelling…" : "Cancel schedule"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
