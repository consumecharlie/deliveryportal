"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Search,
  ChevronRight,
  Folder,
  FolderArchive,
  FileText,
} from "lucide-react";

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

/* ── Leaf: single project row ── */
function ProjectItem({
  project,
  onNavigate,
}: {
  project: ProjectSummary;
  onNavigate: (listId: string) => void;
}) {
  return (
    <button
      onClick={() => onNavigate(project.listId)}
      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-background/80 w-full ${
        project.archived ? "text-muted-foreground" : ""
      }`}
    >
      <FileText
        className={`h-3.5 w-3.5 shrink-0 ${
          project.archived
            ? "text-muted-foreground/50"
            : "text-muted-foreground"
        }`}
      />
      <span className="truncate">{project.name}</span>
    </button>
  );
}

/* ── Expanded project list inside a client (with active/past columns) ── */
function ExpandedProjects({
  projects,
  showArchived,
  onNavigate,
}: {
  projects: ProjectSummary[];
  showArchived: boolean;
  onNavigate: (listId: string) => void;
}) {
  const activeProjects = projects.filter((p) => !p.archived);
  const archivedProjects = projects.filter((p) => p.archived);
  const hasArchived = showArchived && archivedProjects.length > 0;

  if (hasArchived) {
    return (
      <div className="bg-muted/20 px-4 py-3 pl-10">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/25">
                Active
              </span>
              <span className="text-[11px] text-muted-foreground">
                {activeProjects.length}
              </span>
            </div>
            {activeProjects.length > 0 ? (
              <div className="space-y-0.5">
                {activeProjects.map((project) => (
                  <ProjectItem
                    key={project.listId}
                    project={project}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground px-2.5 py-1.5">
                No active projects
              </p>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="inline-flex items-center rounded-full bg-zinc-500/15 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 ring-1 ring-inset ring-zinc-500/25">
                Past
              </span>
              <span className="text-[11px] text-muted-foreground">
                {archivedProjects.length}
              </span>
            </div>
            <div className="space-y-0.5">
              {archivedProjects.map((project) => (
                <ProjectItem
                  key={project.listId}
                  project={project}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-muted/20 px-4 py-3 pl-10">
      <div className="space-y-0.5">
        {activeProjects.map((project) => (
          <ProjectItem
            key={project.listId}
            project={project}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Single client accordion row ── */
function ClientAccordion({
  client,
  isExpanded,
  onToggle,
  showArchived,
  onNavigate,
}: {
  client: ClientWithProjects;
  isExpanded: boolean;
  onToggle: () => void;
  showArchived: boolean;
  onNavigate: (listId: string) => void;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
      >
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            isExpanded ? "rotate-90" : ""
          }`}
        />
        {client.archived ? (
          <FolderArchive className="h-4 w-4 shrink-0 text-muted-foreground/60" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span
          className={`text-sm font-medium truncate ${
            client.archived ? "text-muted-foreground" : ""
          }`}
        >
          {client.name}
        </span>
        <Badge
          variant="secondary"
          className="ml-auto text-[10px] px-1.5 py-0 shrink-0"
        >
          {client.projects.length}
        </Badge>
      </button>

      {isExpanded && client.projects.length > 0 && (
        <ExpandedProjects
          projects={client.projects}
          showArchived={showArchived}
          onNavigate={onNavigate}
        />
      )}

      {isExpanded && client.projects.length === 0 && (
        <div className="bg-muted/30 py-2 pl-11 pr-3">
          <p className="text-xs text-muted-foreground">No matching projects</p>
        </div>
      )}
    </div>
  );
}

/* ── Column of client accordions with a header badge ── */
function ClientColumn({
  label,
  badgeClass,
  clients,
  expandedClients,
  onToggle,
  search,
  showArchived,
  onNavigate,
}: {
  label: string;
  badgeClass: string;
  clients: ClientWithProjects[];
  expandedClients: Set<string>;
  onToggle: (folderId: string) => void;
  search: string;
  showArchived: boolean;
  onNavigate: (listId: string) => void;
}) {
  const isExp = (id: string) => search.length > 0 || expandedClients.has(id);

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={badgeClass}>{label}</span>
        <span className="text-[11px] text-muted-foreground">
          {clients.length}
        </span>
      </div>
      {clients.length === 0 ? (
        <p className="text-xs text-muted-foreground px-3 py-2">
          No {label.toLowerCase()} clients
        </p>
      ) : (
        <div className="rounded-lg border divide-y">
          {clients.map((client) => (
            <ClientAccordion
              key={client.folderId}
              client={client}
              isExpanded={isExp(client.folderId)}
              onToggle={() => onToggle(client.folderId)}
              showArchived={showArchived}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main page ── */
export default function ProjectsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(
    new Set()
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

  // Filter by search term
  const filteredClients = useMemo(() => {
    if (!search) return clients;
    const term = search.toLowerCase();
    return clients
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
  }, [clients, search]);

  const filteredFolderless = useMemo(() => {
    if (!search) return folderlessProjects;
    const term = search.toLowerCase();
    return folderlessProjects.filter((p) =>
      p.name.toLowerCase().includes(term)
    );
  }, [folderlessProjects, search]);

  const totalProjects =
    clients.reduce((acc, c) => acc + c.projects.length, 0) +
    folderlessProjects.length;

  const toggleClient = (folderId: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const isExpanded = (folderId: string) =>
    search.length > 0 || expandedClients.has(folderId);

  // Split clients into active vs archived for two-column layout
  const activeClients = filteredClients.filter((c) => !c.archived);
  const archivedClients = filteredClients.filter((c) => c.archived);

  const navigateTo = (listId: string) => router.push(`/projects/${listId}`);

  const activeBadge =
    "inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/25";
  const pastBadge =
    "inline-flex items-center rounded-full bg-zinc-500/15 px-2.5 py-0.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 ring-1 ring-inset ring-zinc-500/25";

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-eighties text-2xl">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {totalProjects} projects across {clients.length} clients
          </p>
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

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search clients or projects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Loading projects...
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center py-12 text-destructive">
          Failed to load projects. Check your ClickUp API connection.
        </div>
      )}

      {!isLoading && !error && totalProjects === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-1">
          <p>No projects with delivery history yet.</p>
          <p className="text-sm">Projects will appear here once deliveries have been sent.</p>
        </div>
      )}

      {/* Client lists */}
      {!isLoading && !error && totalProjects > 0 && (
        <>
          {showArchived && archivedClients.length > 0 ? (
            /* ── Two-column: Active | Past ── */
            <div className="grid grid-cols-2 gap-6 items-start">
              <ClientColumn
                label="Active Clients"
                badgeClass={activeBadge}
                clients={activeClients}
                expandedClients={expandedClients}
                onToggle={toggleClient}
                search={search}
                showArchived={showArchived}
                onNavigate={navigateTo}
              />
              <ClientColumn
                label="Past Clients"
                badgeClass={pastBadge}
                clients={archivedClients}
                expandedClients={expandedClients}
                onToggle={toggleClient}
                search={search}
                showArchived={showArchived}
                onNavigate={navigateTo}
              />
            </div>
          ) : (
            /* ── Single column (no archived visible) ── */
            <div className="rounded-lg border divide-y">
              {activeClients.map((client) => (
                <ClientAccordion
                  key={client.folderId}
                  client={client}
                  isExpanded={isExpanded(client.folderId)}
                  onToggle={() => toggleClient(client.folderId)}
                  showArchived={showArchived}
                  onNavigate={navigateTo}
                />
              ))}
            </div>
          )}

          {/* Folderless projects */}
          {filteredFolderless.length > 0 && (
            <div className="rounded-lg border divide-y">
              <ClientAccordion
                client={{
                  folderId: "__folderless__",
                  name: "Other Projects",
                  archived: false,
                  projects: filteredFolderless,
                }}
                isExpanded={isExpanded("__folderless__")}
                onToggle={() => toggleClient("__folderless__")}
                showArchived={showArchived}
                onNavigate={navigateTo}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
