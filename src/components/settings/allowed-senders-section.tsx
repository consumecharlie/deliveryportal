"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Avatar } from "@/components/dashboard/assignee-filter";
import { AddSenderPopover } from "@/components/settings/add-sender-popover";
import type { WorkspaceMember } from "@/lib/allowed-senders";

interface AllowedSenderRow {
  clickupUserId: number;
  addedBy: string;
  addedAt: string;
  member: WorkspaceMember | null;
}

export function AllowedSendersSection() {
  const queryClient = useQueryClient();
  const [pendingRemove, setPendingRemove] = useState<AllowedSenderRow | null>(
    null
  );

  const { data, isLoading, isError } = useQuery<{
    senders: AllowedSenderRow[];
  }>({
    queryKey: ["settings", "allowed-senders"],
    queryFn: async () => {
      const res = await fetch("/api/settings/senders");
      if (!res.ok) throw new Error("Failed to fetch allowed senders");
      return res.json();
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (row: AllowedSenderRow) => {
      const res = await fetch(
        `/api/settings/senders/${row.clickupUserId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || "Failed to remove sender");
      }
      return row;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({
        queryKey: ["settings", "allowed-senders"],
      });
      queryClient.invalidateQueries({ queryKey: ["field-options-senders"] });
      toast.success(
        `Removed ${row.member?.username ?? "(deleted user)"}`
      );
      setPendingRemove(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to remove sender");
      setPendingRemove(null);
    },
  });

  const senders = data?.senders ?? [];
  const allowedIds = new Set<number>(
    data ? senders.map((s) => s.clickupUserId) : []
  );

  const pendingUsername =
    pendingRemove?.member?.username ?? "(deleted user)";

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Allowed senders</h2>
        <AddSenderPopover allowedIds={allowedIds} />
      </div>

      <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm">
        <span className="mr-1">⚠️</span>
        Senders also need n8n credentials configured. Adding someone here
        without n8n credentials will cause their sends to fail.
      </div>

      {isLoading ? (
        <Card className="px-6 py-4 text-sm text-muted-foreground">
          Loading…
        </Card>
      ) : isError ? (
        <Card className="px-6 py-4 text-sm text-destructive">
          Failed to load allowed senders
        </Card>
      ) : senders.length === 0 ? (
        <Card className="px-6 py-4 text-sm text-muted-foreground">
          No allowed senders yet. Click &ldquo;Add sender&rdquo; to get
          started.
        </Card>
      ) : (
        <div className="space-y-2">
          {senders.map((row) => {
            const username = row.member?.username ?? "(deleted user)";
            const email = row.member?.email;
            const isDeleted = !row.member;
            return (
              <Card
                key={row.clickupUserId}
                className="flex flex-row items-center gap-3 px-4 py-3"
              >
                <Avatar
                  src={row.member?.profilePicture}
                  name={username}
                  size={32}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className={
                      isDeleted
                        ? "text-sm font-medium text-muted-foreground"
                        : "text-sm font-medium"
                    }
                  >
                    {username}
                  </div>
                  {email ? (
                    <div className="text-xs text-muted-foreground truncate">
                      {email}
                    </div>
                  ) : null}
                  <div className="text-xs text-muted-foreground">
                    Added by {row.addedBy} on{" "}
                    {new Date(row.addedAt).toLocaleDateString()}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${username}`}
                  onClick={() => setPendingRemove(row)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={!!pendingRemove}
        onOpenChange={(next) => {
          if (!next && !removeMutation.isPending) setPendingRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove sender?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {pendingUsername} from the allowed senders list? They
              will no longer appear in the &ldquo;From&rdquo; dropdown on a
              delivery.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removeMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (pendingRemove) removeMutation.mutate(pendingRemove);
              }}
            >
              {removeMutation.isPending ? "Removing…" : "Continue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
