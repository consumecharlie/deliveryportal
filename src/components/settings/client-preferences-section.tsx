"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { RESTRICTION_OPTIONS } from "@/lib/client-preferences";

interface ClientPreferenceRow {
  clientFolderId: string;
  clientName: string;
  enabled: boolean;
  warningMessage: string;
  destinationLink: string | null;
  restrictions: string[];
  customBlockedDomains: string[];
  updatedBy: string;
  updatedAt: string;
}

interface ClientOption {
  folderId: string;
  name: string;
}

interface FormState {
  clientFolderId: string;
  clientName: string;
  enabled: boolean;
  warningMessage: string;
  destinationLink: string;
  restrictions: string[];
  customBlockedDomainsText: string;
}

function emptyForm(): FormState {
  return {
    clientFolderId: "",
    clientName: "",
    enabled: true,
    warningMessage: "",
    destinationLink: "",
    restrictions: [],
    customBlockedDomainsText: "",
  };
}

function rowToForm(row: ClientPreferenceRow): FormState {
  return {
    clientFolderId: row.clientFolderId,
    clientName: row.clientName,
    enabled: row.enabled,
    warningMessage: row.warningMessage,
    destinationLink: row.destinationLink ?? "",
    restrictions: row.restrictions ?? [],
    customBlockedDomainsText: (row.customBlockedDomains ?? []).join("\n"),
  };
}

function parseDomains(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((d) => d.trim())
    .filter((d) => d.length > 0);
}

function restrictionLabel(key: string): string {
  return RESTRICTION_OPTIONS.find((o) => o.key === key)?.label ?? key;
}

function summarize(row: ClientPreferenceRow): string {
  const parts: string[] = [];
  for (const key of row.restrictions ?? []) parts.push(restrictionLabel(key));
  const custom = row.customBlockedDomains ?? [];
  if (custom.length > 0) {
    parts.push(
      `Custom: ${custom.slice(0, 3).join(", ")}${
        custom.length > 3 ? `, +${custom.length - 3} more` : ""
      }`
    );
  }
  return parts.length > 0 ? parts.join(" · ") : "No restrictions";
}

export function ClientPreferencesSection() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pendingDelete, setPendingDelete] = useState<ClientPreferenceRow | null>(
    null
  );

  const { data, isLoading, isError } = useQuery<{
    preferences: ClientPreferenceRow[];
  }>({
    queryKey: ["settings", "client-preferences"],
    queryFn: async () => {
      const res = await fetch("/api/settings/client-preferences");
      if (!res.ok) throw new Error("Failed to fetch client preferences");
      return res.json();
    },
  });

  const { data: clientsData } = useQuery<{ clients: ClientOption[] }>({
    queryKey: ["settings", "clients"],
    queryFn: async () => {
      const res = await fetch("/api/settings/clients");
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: async (state: FormState) => {
      const res = await fetch("/api/settings/client-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientFolderId: state.clientFolderId,
          clientName: state.clientName,
          enabled: state.enabled,
          warningMessage: state.warningMessage.trim(),
          destinationLink: state.destinationLink.trim() || null,
          restrictions: state.restrictions,
          customBlockedDomains: parseDomains(state.customBlockedDomainsText),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || "Failed to save preference");
      }
      return res.json();
    },
    onSuccess: (_result, state) => {
      queryClient.invalidateQueries({
        queryKey: ["settings", "client-preferences"],
      });
      toast.success(`Saved preferences for ${state.clientName}`);
      setDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save preference");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (row: ClientPreferenceRow) => {
      const res = await fetch(
        `/api/settings/client-preferences/${row.clientFolderId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || "Failed to delete preference");
      }
      return row;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({
        queryKey: ["settings", "client-preferences"],
      });
      toast.success(`Removed preferences for ${row.clientName}`);
      setPendingDelete(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete preference");
      setPendingDelete(null);
    },
  });

  const preferences = data?.preferences ?? [];
  const clients = clientsData?.clients ?? [];
  const isEditing = editingFolderId !== null;

  // Available clients for the picker (exclude ones already configured, unless editing that one)
  const configuredIds = new Set(preferences.map((p) => p.clientFolderId));
  const selectableClients = clients.filter(
    (c) => !configuredIds.has(c.folderId)
  );

  function openAdd() {
    setEditingFolderId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(row: ClientPreferenceRow) {
    setEditingFolderId(row.clientFolderId);
    setForm(rowToForm(row));
    setDialogOpen(true);
  }

  function toggleRestriction(key: string, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      restrictions: checked
        ? [...prev.restrictions.filter((k) => k !== key), key]
        : prev.restrictions.filter((k) => k !== key),
    }));
  }

  function onClientChange(folderId: string) {
    const client = clients.find((c) => c.folderId === folderId);
    setForm((prev) => ({
      ...prev,
      clientFolderId: folderId,
      clientName: client?.name ?? "",
    }));
  }

  const canSave =
    form.clientFolderId.length > 0 &&
    form.warningMessage.trim().length > 0 &&
    !saveMutation.isPending;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Client preferences</h2>
        <Button variant="default" size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Add client
        </Button>
      </div>

      <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-sm">
        <span className="mr-1">ℹ️</span>
        Configure per-client delivery restrictions and warnings. When a review
        link matches a blocked domain, the sender sees the warning message
        before delivering.
      </div>

      {isLoading ? (
        <Card className="px-6 py-4 text-sm text-muted-foreground">
          Loading…
        </Card>
      ) : isError ? (
        <Card className="px-6 py-4 text-sm text-destructive">
          Failed to load client preferences
        </Card>
      ) : preferences.length === 0 ? (
        <Card className="px-6 py-4 text-sm text-muted-foreground">
          No client preferences yet. Click &ldquo;Add client&rdquo; to get
          started.
        </Card>
      ) : (
        <div className="space-y-2">
          {preferences.map((row) => (
            <Card
              key={row.clientFolderId}
              className="flex flex-row items-center gap-3 px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">
                    {row.clientName}
                  </span>
                  <span
                    className={
                      row.enabled
                        ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                        : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                    }
                  >
                    {row.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {summarize(row)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Updated by {row.updatedBy} on{" "}
                  {new Date(row.updatedAt).toLocaleDateString()}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${row.clientName}`}
                onClick={() => openEdit(row)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${row.clientName}`}
                onClick={() => setPendingDelete(row)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (!next && saveMutation.isPending) return;
          setDialogOpen(next);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit client preferences" : "Add client preferences"}
            </DialogTitle>
            <DialogDescription>
              Set delivery restrictions and the warning shown when a review link
              is blocked.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="client-pref-client">Client</Label>
              {isEditing ? (
                <div
                  id="client-pref-client"
                  className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm"
                >
                  {form.clientName}
                </div>
              ) : (
                <select
                  id="client-pref-client"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  value={form.clientFolderId}
                  onChange={(e) => onClientChange(e.target.value)}
                >
                  <option value="">Select a client…</option>
                  {selectableClients.map((c) => (
                    <option key={c.folderId} value={c.folderId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={form.enabled}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, enabled: e.target.checked }))
                }
              />
              Enabled
            </label>

            <div className="space-y-1.5">
              <Label htmlFor="client-pref-warning">Warning message</Label>
              <Textarea
                id="client-pref-warning"
                rows={3}
                placeholder="e.g. This client cannot access Google Docs. Please use a Frame.io link instead."
                value={form.warningMessage}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    warningMessage: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="client-pref-destination">
                Destination link (optional)
              </Label>
              <Input
                id="client-pref-destination"
                type="url"
                placeholder="https://…"
                value={form.destinationLink}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    destinationLink: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Restrictions</Label>
              {RESTRICTION_OPTIONS.map((option) => (
                <label
                  key={option.key}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={form.restrictions.includes(option.key)}
                    onChange={(e) =>
                      toggleRestriction(option.key, e.target.checked)
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>

            <details className="rounded-md border border-input p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Advanced
              </summary>
              <div className="mt-3 space-y-1.5">
                <Label htmlFor="client-pref-custom-domains">
                  Custom blocked domains
                </Label>
                <Textarea
                  id="client-pref-custom-domains"
                  rows={3}
                  placeholder={"one domain per line\ne.g. dropbox.com"}
                  value={form.customBlockedDomainsText}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      customBlockedDomainsText: e.target.value,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  One domain per line (or comma-separated). Links matching these
                  domains will be blocked.
                </p>
              </div>
            </details>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={!canSave}
              onClick={() => saveMutation.mutate(form)}
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(next) => {
          if (!next && !deleteMutation.isPending) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete client preferences?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove the delivery preferences for{" "}
              {pendingDelete?.clientName ?? "this client"}? Their deliveries
              will no longer be checked against these restrictions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) deleteMutation.mutate(pendingDelete);
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Continue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
