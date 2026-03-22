"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import PacmanLoader from "@/components/ui/pacman-loader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Folder,
  FolderArchive,
  FileText,
  ExternalLink,
  Link as LinkIcon,
  Send,
} from "lucide-react";
import { DepartmentBadge } from "@/components/dashboard/department-badge";

/* ── Types ── */

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

interface DeliveryLink {
  id: string;
  url: string;
  label: string;
  linkType: string;
  variableName: string | null;
}

interface ProjectDelivery {
  id: string;
  deliverableType: string;
  department: string;
  sentAt: string;
  sentBy: string;
  senderEmail: string;
  primaryEmail: string;
  emailSubject: string;
  slackChannel: string | null;
  links: DeliveryLink[];
}

interface FlatLink {
  url: string;
  label: string;
  linkType: string;
  variableName: string | null;
  deliverableType: string;
  sentAt: string;
  deliveryId: string;
}

const LINK_LABELS: Record<string, string> = {
  googleDeliverableLink: "Google Deliverable",
  frameReviewLink: "Frame.io Review",
  loomReviewLink: "Loom Walkthrough",
  animaticReviewLink: "Animatic",
  flexLink: "Flex Link",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ── Column 3: Project Detail Panel ── */
function ProjectDetailPanel({ listId }: { listId: string }) {
  const { data, isLoading, error } = useQuery<{
    deliveries: ProjectDelivery[];
    allLinks: FlatLink[];
    total: number;
  }>({
    queryKey: ["project-links", listId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${listId}/links`);
      if (!res.ok) throw new Error("Failed to fetch project data");
      return res.json();
    },
  });

  const deliveries = data?.deliveries ?? [];
  const allLinks = data?.allLinks ?? [];

  const uniqueLinks = allLinks.reduce<
    Map<string, FlatLink & { count: number }>
  >((acc, link) => {
    const existing = acc.get(link.url);
    if (existing) {
      existing.count++;
    } else {
      acc.set(link.url, { ...link, count: 1 });
    }
    return acc;
  }, new Map());

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <PacmanLoader size={24} />
        <span
          className="font-pixel text-[13px]"
          style={{ color: "#6AC387" }}
        >
          LOADING PROJECT
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive text-sm">
        Failed to load project data.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xl font-bold">{deliveries.length}</p>
                <p className="text-[11px] text-muted-foreground">
                  Deliveries Sent
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xl font-bold">{allLinks.length}</p>
                <p className="text-[11px] text-muted-foreground">
                  Total Links Sent
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xl font-bold">{uniqueLinks.size}</p>
                <p className="text-[11px] text-muted-foreground">
                  Unique Links
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* All Unique Links */}
      {uniqueLinks.size > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              All Links
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Array.from(uniqueLinks.values()).map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-md border px-3 py-2 transition-colors hover:bg-[#6AC387]/10 hover:border-[#6AC387]/30 cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {LINK_LABELS[link.variableName ?? ""] ?? link.label}
                      </span>
                      {link.count > 1 && (
                        <Badge variant="secondary" className="text-xs">
                          Sent {link.count}x
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {link.deliverableType}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground truncate block mt-0.5">
                      {link.url}
                    </span>
                  </div>
                  <ExternalLink className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delivery History */}
      {deliveries.length > 0 ? (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Send className="h-4 w-4" />
              Delivery History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dept</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Links</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="text-sm">
                        {formatDate(delivery.sentAt)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatTime(delivery.sentAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {delivery.deliverableType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DepartmentBadge department={delivery.department} />
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-sm">
                      {delivery.emailSubject}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {delivery.primaryEmail || (delivery.slackChannel ? "Slack" : "—")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {delivery.links.map((link) => (
                          <a
                            key={link.id}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs hover:bg-muted/80"
                            title={link.url}
                          >
                            <ExternalLink className="h-3 w-3" />
                            {LINK_LABELS[link.variableName ?? ""] ??
                              link.label}
                          </a>
                        ))}
                        {delivery.links.length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          No deliveries have been sent for this project yet.
        </div>
      )}
    </div>
  );
}

/* ── Main page ── */
export default function ProjectsPage() {
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );

  const { data, isLoading, error } = useQuery<{
    clients: ClientWithProjects[];
    folderlessProjects: ProjectSummary[];
  }>({
    queryKey: ["projects", showArchived],
    queryFn: async () => {
      const params = showArchived ? "?archived=true" : "";
      const res = await fetch(`/api/projects${params}`);
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
  });

  const clients = data?.clients ?? [];
  const folderlessProjects = data?.folderlessProjects ?? [];

  // Build a combined client list including folderless projects as a virtual client
  const allClients = useMemo(() => {
    const result = [...clients];
    if (folderlessProjects.length > 0) {
      result.push({
        folderId: "__folderless__",
        name: "Other Projects",
        archived: false,
        projects: folderlessProjects,
      });
    }
    return result;
  }, [clients, folderlessProjects]);

  // Filter by search term
  const filteredClients = useMemo(() => {
    const base = showArchived ? allClients : allClients.filter((c) => !c.archived);
    if (!search) return base;
    const term = search.toLowerCase();
    return base
      .map((client) => ({
        ...client,
        projects: client.projects.filter(
          (p) =>
            p.name.toLowerCase().includes(term) ||
            client.name.toLowerCase().includes(term)
        ),
      }))
      .filter(
        (client) =>
          client.projects.length > 0 ||
          client.name.toLowerCase().includes(term)
      );
  }, [allClients, search, showArchived]);

  // Get projects for the selected client
  const selectedClient = filteredClients.find(
    (c) => c.folderId === selectedClientId
  );
  const selectedProjects = useMemo(() => {
    if (!selectedClient) return [];
    if (!showArchived) return selectedClient.projects.filter((p) => !p.archived);
    return selectedClient.projects;
  }, [selectedClient, showArchived]);

  // Get the selected project name for the header
  const selectedProjectName = useMemo(() => {
    if (!selectedProjectId || !selectedClient) return null;
    return selectedClient.projects.find((p) => p.listId === selectedProjectId)
      ?.name;
  }, [selectedProjectId, selectedClient]);

  const totalProjects =
    allClients.reduce((acc, c) => acc + c.projects.length, 0);

  const handleSelectClient = (folderId: string) => {
    setSelectedClientId(folderId);
    setSelectedProjectId(null);
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 64px - 48px)" }}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-4 mb-3 shrink-0">
        <div>
          <h1 className="font-eighties text-2xl">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {totalProjects} projects across {clients.length} clients
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search clients or projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 w-64"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="show-archived"
              checked={showArchived}
              onCheckedChange={setShowArchived}
            />
            <Label
              htmlFor="show-archived"
              className="text-sm text-muted-foreground cursor-pointer"
            >
              Show archived
            </Label>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-12 gap-4 flex-1">
          <PacmanLoader size={32} />
          <span
            className="font-pixel text-[13px]"
            style={{ color: "#6AC387" }}
          >
            LOADING PROJECTS
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center py-12 text-destructive flex-1">
          Failed to load projects. Check your ClickUp API connection.
        </div>
      )}

      {!isLoading && !error && totalProjects === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-1 flex-1">
          <p>No projects with delivery history yet.</p>
          <p className="text-sm">
            Projects will appear here once deliveries have been sent.
          </p>
        </div>
      )}

      {/* Finder column view */}
      {!isLoading && !error && totalProjects > 0 && (
        <div className="flex flex-1 min-h-0 rounded-lg border border-[#364040]/30 overflow-hidden">
          {/* Column 1: Clients */}
          <div className="shrink-0 border-r border-[#364040]/30 flex flex-col min-h-0" style={{ width: "clamp(140px, 20%, 260px)" }}>
            <div className="px-3 py-2 border-b border-[#364040]/30 shrink-0">
              <span
                className="font-pixel text-[11px]"
                style={{ color: "#6AC387" }}
              >
                CLIENTS
              </span>
            </div>
            <div className="overflow-y-auto flex-1">
              {filteredClients.map((client) => {
                const isSelected = client.folderId === selectedClientId;
                return (
                  <button
                    key={client.folderId}
                    onClick={() => handleSelectClient(client.folderId)}
                    className={`flex items-center gap-2 w-full px-3 py-2.5 text-left text-sm transition-colors duration-150 border-l-4 ${
                      isSelected
                        ? "text-[#6AC387] border-[#6AC387] bg-[#6AC387]/10"
                        : "text-foreground border-transparent hover:bg-[#DBEF00]/10 hover:text-[#DBEF00]"
                    } ${client.archived ? "opacity-60" : ""}`}
                  >
                    {client.archived ? (
                      <FolderArchive className="h-4 w-4 shrink-0" />
                    ) : (
                      <Folder className="h-4 w-4 shrink-0" />
                    )}
                    <span className="truncate flex-1 font-medium">
                      {client.name}
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 shrink-0"
                    >
                      {client.projects.length}
                    </Badge>
                  </button>
                );
              })}
              {filteredClients.length === 0 && (
                <p className="text-xs text-muted-foreground px-3 py-4 text-center">
                  No clients match your search.
                </p>
              )}
            </div>
          </div>

          {/* Column 2: Projects */}
          <div className="shrink-0 border-r border-[#364040]/30 flex flex-col min-h-0" style={{ width: "clamp(160px, 22%, 300px)" }}>
            <div className="px-3 py-2 border-b border-[#364040]/30 shrink-0">
              <span
                className="font-pixel text-[11px]"
                style={{ color: "#6AC387" }}
              >
                PROJECTS
              </span>
            </div>
            <div className="overflow-y-auto flex-1">
              {!selectedClientId && (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                  Select a client
                </div>
              )}
              {selectedClientId && selectedProjects.length === 0 && (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                  No projects found
                </div>
              )}
              {selectedProjects.map((project) => {
                const isSelected = project.listId === selectedProjectId;
                return (
                  <button
                    key={project.listId}
                    onClick={() => setSelectedProjectId(project.listId)}
                    className={`flex items-center gap-2 w-full px-3 py-2.5 text-left text-sm transition-colors duration-150 border-l-4 ${
                      isSelected
                        ? "text-[#6AC387] border-[#6AC387] bg-[#6AC387]/10"
                        : "text-foreground border-transparent hover:bg-[#DBEF00]/10 hover:text-[#DBEF00]"
                    } ${project.archived ? "opacity-60" : ""}`}
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate font-medium">{project.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Column 3: Project Detail */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            <div className="px-3 py-2 border-b border-[#364040]/30 shrink-0">
              <span
                className="font-pixel text-[11px]"
                style={{ color: "#6AC387" }}
              >
                PROJECT DETAILS
              </span>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {!selectedProjectId && (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                  Select a project
                </div>
              )}
              {selectedProjectId && (
                <>
                  {selectedProjectName && (
                    <h2 className="font-eighties text-xl mb-4">{selectedProjectName}</h2>
                  )}
                  <ProjectDetailPanel
                    key={selectedProjectId}
                    listId={selectedProjectId}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
