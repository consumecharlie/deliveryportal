"use client";

import { useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Copy, Eye, ImageIcon, ImagePlus, Link2, RefreshCw, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { LOGO_CONTENT_TYPES, LOGO_MAX_BYTES, logoBlobPathname, cacheBustedLogoUrl } from "@/lib/client-logo";
import { getAppBaseUrl } from "@/lib/app-base-url";

interface PortalLink {
  id: string;
  clientFolderId: string;
  clientName: string;
  token: string;
  createdBy: string;
  createdAt: string;
  lastViewedAt: string | null;
  viewCount: number;
  logoUrl: string | null;
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
  const [logoFor, setLogoFor] = useState<string | null>(null);
  const [logoDraft, setLogoDraft] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const linksQuery = useQuery<{ links: PortalLink[] }>({
    queryKey: ["settings", "portal-access"],
    queryFn: async () => {
      const res = await fetch("/api/settings/portal-access");
      if (!res.ok) throw new Error("Failed to fetch portal links");
      return res.json();
    },
  });

  const projectsQuery = useQuery<{ clients: ClientWithProjects[] }>({
    queryKey: ["projects", "all"],
    queryFn: async () => {
      const res = await fetch("/api/projects?all=true");
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

  const logoMutation = useMutation({
    mutationFn: async (input: { row: ClientRow; logoUrl: string | null }) => {
      const res = await fetch("/api/settings/portal-access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientFolderId: input.row.folderId,
          clientName: input.row.name,
          logoUrl: input.logoUrl,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Failed to save logo");
      }
      return input;
    },
    onSuccess: (input) => {
      queryClient.invalidateQueries({ queryKey: ["settings", "portal-access"] });
      toast.success(input.logoUrl ? `Logo set for ${input.row.name}` : `Logo removed for ${input.row.name}`);
      closeLogoEditor();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save logo");
    },
  });

  function pickLogoFile(file: File | null) {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    if (!file) {
      setLogoFile(null);
      setLogoPreview(null);
      return;
    }
    if (!LOGO_CONTENT_TYPES[file.type]) {
      toast.error("Logo must be a PNG, JPG, SVG or WebP image");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast.error("Logo must be under 2 MB");
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  function openLogoEditor(row: ClientRow) {
    setLogoDraft(row.link?.logoUrl ?? "");
    pickLogoFile(null);
    setDragOver(false);
    setLogoFor(row.folderId);
  }

  function closeLogoEditor() {
    pickLogoFile(null);
    setLogoFor(null);
  }

  async function uploadLogo(row: ClientRow) {
    if (!logoFile) return;
    const pathname = logoBlobPathname(row.folderId, logoFile.type);
    if (!pathname) {
      toast.error("Logo must be a PNG, JPG, SVG or WebP image");
      return;
    }
    setUploading(true);
    try {
      const blob = await upload(pathname, logoFile, {
        access: "public",
        handleUploadUrl: "/api/settings/client-logo",
        contentType: logoFile.type,
        clientPayload: JSON.stringify({
          clientFolderId: row.folderId,
          contentType: logoFile.type,
          size: logoFile.size,
        }),
      });
      await logoMutation.mutateAsync({ row, logoUrl: cacheBustedLogoUrl(blob.url, Date.now()) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload that logo");
    } finally {
      setUploading(false);
    }
  }

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
    // (archived client) still need to be visible so they can be copied or
    // revoked.
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
    void copyText(buildPortalUrl(getAppBaseUrl(), row.link.token), "Portal link");
  }

  function copyProjectLink(row: ClientRow, project: ProjectSummary) {
    if (!row.link) return;
    void copyText(
      buildPortalUrl(getAppBaseUrl(), row.link.token, project.listId),
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
          No active client folders found.
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Logo</TableHead>
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
                      <Popover
                        open={logoFor === row.folderId}
                        onOpenChange={(open) => {
                          if (open) openLogoEditor(row);
                          else if (!logoMutation.isPending && !uploading) closeLogoEditor();
                        }}
                      >
                        <span className="inline-flex items-center gap-2">
                          {link?.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={link.logoUrl}
                              alt={`${row.name} logo`}
                              className="h-6 w-6 rounded object-contain bg-muted"
                            />
                          ) : (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-muted text-muted-foreground">
                              <ImageIcon className="h-3.5 w-3.5" />
                            </span>
                          )}
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                              {link?.logoUrl ? "Change" : "Set logo"}
                            </Button>
                          </PopoverTrigger>
                        </span>
                        <PopoverContent align="start" className="w-80 space-y-3 p-3">
                          <p className="text-xs font-medium text-muted-foreground">
                            Logo for {row.name}
                          </p>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept={Object.keys(LOGO_CONTENT_TYPES).join(",")}
                            className="hidden"
                            onChange={(e) => {
                              pickLogoFile(e.target.files?.[0] ?? null);
                              e.target.value = "";
                            }}
                          />
                          <div
                            role="button"
                            tabIndex={0}
                            className={`flex cursor-pointer items-center gap-3 rounded-md border border-dashed p-3 text-sm ${
                              dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30"
                            }`}
                            onClick={() => fileInputRef.current?.click()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                fileInputRef.current?.click();
                              }
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setDragOver(true);
                            }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setDragOver(false);
                              pickLogoFile(e.dataTransfer.files?.[0] ?? null);
                            }}
                          >
                            {logoPreview ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={logoPreview} alt="Logo preview" className="h-10 w-10 rounded bg-muted object-contain" />
                            ) : (
                              <span className="inline-flex h-10 w-10 items-center justify-center rounded bg-muted text-muted-foreground">
                                <ImagePlus className="h-4 w-4" />
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              {logoFile ? (
                                <span className="block truncate">{logoFile.name}</span>
                              ) : (
                                <span className="block">{dragOver ? "Drop to select" : "Drop a logo here, or choose a file"}</span>
                              )}
                              <span className="block text-xs text-muted-foreground">PNG, JPG, SVG or WebP, under 2 MB</span>
                            </span>
                          </div>
                          <div className="flex justify-end gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={uploading}
                              onClick={() => fileInputRef.current?.click()}
                            >
                              Choose file
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled={!logoFile || uploading || logoMutation.isPending}
                              onClick={() => void uploadLogo(row)}
                            >
                              {uploading ? "Uploading…" : "Upload"}
                            </Button>
                          </div>
                          <form
                            className="space-y-1.5 border-t pt-3"
                            onSubmit={(e) => {
                              e.preventDefault();
                              logoMutation.mutate({ row, logoUrl: logoDraft.trim() || null });
                            }}
                          >
                            <p className="text-xs text-muted-foreground">Or paste an image URL</p>
                            <div className="flex gap-1.5">
                              <Input
                                type="url"
                                placeholder="https://..."
                                value={logoDraft}
                                onChange={(e) => setLogoDraft(e.target.value)}
                              />
                              <Button
                                type="submit"
                                variant="outline"
                                size="sm"
                                className="h-9"
                                disabled={!logoDraft.trim() || logoMutation.isPending || uploading}
                              >
                                Save
                              </Button>
                            </div>
                          </form>
                          <div className="flex items-center justify-between border-t pt-3">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              disabled={!link?.logoUrl || logoMutation.isPending || uploading}
                              onClick={() => logoMutation.mutate({ row, logoUrl: null })}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              Remove
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={logoMutation.isPending || uploading}
                              onClick={closeLogoEditor}
                            >
                              Cancel
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </TableCell>
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
                                  No active projects in this client folder.
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
