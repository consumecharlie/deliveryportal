"use client";

import { useMemo, useState } from "react";
import { Copy, Eye, Link2, RefreshCw, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { buildPortalUrl, maskPortalToken } from "@/lib/portal-access";

interface PortalLink {
  id: string;
  clientFolderId: string;
  clientName: string;
  token: string;
  createdBy: string;
  createdAt: string;
  lastViewedAt: string | null;
  viewCount: number;
}

interface ProjectSummary {
  listId: string;
  name: string;
  archived: boolean;
}

interface ClientWithProjects {
  folderId: string;
  name: string;
  archived: boolean;
  projects: ProjectSummary[];
}

interface ClientRow {
  folderId: string;
  name: string;
  projects: ProjectSummary[];
  link: PortalLink | null;
}

type PendingAction =
  | { kind: "rotate"; row: ClientRow }
  | { kind: "revoke"; row: ClientRow }
  | null;

function appBase(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof window !== "undefined" ? window.location.origin : "")
  );
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Could not copy to clipboard");
  }
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDayTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ClientPortalSection() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingAction>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const linksQuery = useQuery<{ links: PortalLink[] }>({
    queryKey: ["settings", "portal-access"],
    queryFn: async () => {
      const res = await fetch("/api/settings/portal-access");
      if (!res.ok) throw new Error("Failed to fetch portal links");
      return res.json();
    },
  });

  const projectsQuery = useQuery<{ clients: ClientWithProjects[] }>({
    queryKey: ["projects", "active"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const createMutation = useMutation({
    mutationFn: async (row: ClientRow) => {
      const res = await fetch("/api/settings/portal-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientFolderId: row.folderId,
          clientName: row.name,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Failed to create portal link");
      }
      return (await res.json()) as { link: PortalLink };
    },
    onSuccess: (_result, row) => {
      queryClient.invalidateQueries({ queryKey: ["settings", "portal-access"] });
      toast.success(
        row.link
          ? `Rotated portal link for ${row.name}`
          : `Created portal link for ${row.name}`
      );
      setPending(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create portal link");
      setPending(null);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (row: ClientRow) => {
      if (!row.link) throw new Error("No link to revoke");
      const res = await fetch(
        `/api/settings/portal-access?id=${encodeURIComponent(row.link.id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Failed to revoke portal link");
      }
      return row;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["settings", "portal-access"] });
      toast.success(`Revoked portal link for ${row.name}`);
      setPending(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to revoke portal link");
      setPending(null);
    },
  });

  const rows = useMemo<ClientRow[]>(() => {
    const links = linksQuery.data?.links ?? [];
    const linkByFolder = new Map(links.map((l) => [l.clientFolderId, l]));
    const clients = (projectsQuery.data?.clients ?? []).filter(
      (c) => !c.archived
    );
    const out: ClientRow[] = clients.map((c) => ({
      folderId: c.folderId,
      name: c.name,
      projects: c.projects.filter((p) => !p.archived),
      link: linkByFolder.get(c.folderId) ?? null,
    }));
    // Active links for folders the projects list does not currently show
    // (archived client, or no deliveries yet) still need to be visible so
    // they can be copied or revoked.
    const seen = new Set(out.map((r) => r.folderId));
    for (const l of links) {
      if (seen.has(l.clientFolderId)) continue;
      out.push({
        folderId: l.clientFolderId,
        name: l.clientName,
        projects: [],
        link: l,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [linksQuery.data, projectsQuery.data]);

  const isLoading = linksQuery.isLoading || projectsQuery.isLoading;
  const isError = linksQuery.isError || projectsQuery.isError;
  const busy = createMutation.isPending || revokeMutation.isPending;

  function copyLink(row: ClientRow) {
    if (!row.link) return;
    void copyText(buildPortalUrl(appBase(), row.link.token), "Portal link");
  }

  function copyProjectLink(row: ClientRow, project: ProjectSummary) {
    if (!row.link) return;
    void copyText(
      buildPortalUrl(appBase(), row.link.token, project.listId),
      `Project link for ${project.name}`
    );
    setPickerFor(null);
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Client portal links</h2>
      </div>

      <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-sm">
        <span className="mr-1">ℹ️</span>
        One bookmarkable link per client. Anyone with the link can open that
        client&apos;s portal, so rotate it if it leaks. Project links are deep
        links under the same token.
      </div>

      {isLoading ? (
        <Card className="px-6 py-4 text-sm text-muted-foreground">Loading…</Card>
      ) : isError ? (
        <Card className="px-6 py-4 text-sm text-destructive">
          Failed to load client portal links
        </Card>
      ) : rows.length === 0 ? (
        <Card className="px-6 py-4 text-sm text-muted-foreground">
          No clients with deliveries yet.
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Portal link</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last viewed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const link = row.link;
                return (
                  <TableRow key={row.folderId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      {link ? (
                        <span className="inline-flex items-center gap-1.5">
                          <code className="text-xs text-muted-foreground">
                            {maskPortalToken(link.token)}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label={`Copy portal link for ${row.name}`}
                            onClick={() => copyLink(row)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No link yet
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {link ? (
                        <span title={`Created by ${link.createdBy}`}>
                          {formatDay(link.createdAt)}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {link?.lastViewedAt ? (
                        <span className="inline-flex items-center gap-1.5">
                          {formatDayTime(link.lastViewedAt)}
                          <span className="inline-flex items-center gap-1 text-xs">
                            <Eye className="h-3.5 w-3.5" />
                            {link.viewCount}
                          </span>
                        </span>
                      ) : link ? (
                        "Never"
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {link ? (
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyLink(row)}
                          >
                            <Copy className="h-3.5 w-3.5 mr-1" />
                            Copy
                          </Button>
                          <Popover
                            open={pickerFor === row.folderId}
                            onOpenChange={(open) =>
                              setPickerFor(open ? row.folderId : null)
                            }
                          >
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Link2 className="h-3.5 w-3.5 mr-1" />
                                Copy project link
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-72 p-2">
                              <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                                Pick a project
                              </p>
                              {row.projects.length === 0 ? (
                                <p className="px-2 py-1.5 text-sm text-muted-foreground">
                                  No active projects with deliveries.
                                </p>
                              ) : (
                                <ul className="max-h-64 overflow-y-auto">
                                  {row.projects.map((p) => (
                                    <li key={p.listId}>
                                      <button
                                        type="button"
                                        className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                                        onClick={() => copyProjectLink(row, p)}
                                      >
                                        {p.name}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </PopoverContent>
                          </Popover>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => setPending({ kind: "rotate", row })}
                          >
                            <RefreshCw className="h-3.5 w-3.5 mr-1" />
                            Rotate
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => setPending({ kind: "revoke", row })}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Revoke
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          disabled={busy}
                          onClick={() => createMutation.mutate(row)}
                        >
                          <Link2 className="h-3.5 w-3.5 mr-1" />
                          Create link
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "rotate"
                ? `Rotate portal link for ${pending.row.name}?`
                : `Revoke portal link for ${pending?.row.name ?? "this client"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "rotate"
                ? "Rotating creates a new link and the old one stops working immediately. Continue?"
                : "The link stops working immediately. Anyone who bookmarked it will need a new one. Continue?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={pending?.kind === "revoke" ? "destructive" : "default"}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (!pending) return;
                if (pending.kind === "rotate") createMutation.mutate(pending.row);
                else revokeMutation.mutate(pending.row);
              }}
            >
              {busy ? "Working…" : "Continue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
