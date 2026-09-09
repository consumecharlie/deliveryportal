"use client";

import type { PortalProject } from "@/lib/portal-page-model";
import { MacWindow, type WindowFrameProps } from "./mac-window";
import { FINDER_ID } from "./desktop-state";
import { FolderIcon } from "./folder-icon";
import { hasRoadAhead } from "./roadmap-rail";

export const COMPLETED_FOLDER = "completed";
export type FinderView = "root" | "completed";

interface Props extends WindowFrameProps {
  projects: PortalProject[];
  completed: PortalProject[];
  /** Items awaiting review per project listId. */
  awaiting: Record<string, number>;
  /** Projects open as viewer tabs (their folders show as open). */
  openIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Opens a project (in progress or completed) as a viewer tab. */
  onOpenProject: (listId: string) => void;
  view: FinderView;
  onViewChange: (view: FinderView) => void;
  /** Touch: a single tap opens (there is no double-tap convention). */
  tapOpens: boolean;
}

interface FolderProps {
  id: string;
  label: string;
  variant: "full" | "flat";
  open: boolean;
  selected: boolean;
  badge?: number;
  tapOpens: boolean;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

function Folder({ id, label, variant, open, selected, badge, tapOpens, onSelect, onOpen }: FolderProps) {
  return (
    <button
      type="button"
      className={`portal-fw-folder${selected ? " portal-fw-folder-selected" : ""}${open ? " portal-fw-folder-open" : ""}`}
      aria-pressed={selected}
      aria-label={`${label}${badge ? `, ${badge} awaiting your review` : ""}${open ? ", open" : ""}`}
      title={label}
      onClick={() => (tapOpens ? onOpen(id) : onSelect(id))}
      onDoubleClick={() => onOpen(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen(id);
        }
      }}
    >
      <span className="portal-fw-art">
        <FolderIcon variant={variant} open={open} width={72} />
        {badge ? (
          <span className="portal-fw-badge" aria-hidden="true">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="portal-fw-label" aria-hidden="true">
        {label}
      </span>
    </button>
  );
}

/**
 * PROJECT FINDER: a file browser. The root shows a folder per in-progress
 * project plus COMPLETED PROJECTS; opening that navigates the body into the
 * completed folder (breadcrumb with a back link). Opening any project folder
 * adds it as a tab in the Project Viewer. Single click selects, double-click,
 * Enter or a tap opens.
 */
export function FinderWindow({
  projects,
  completed,
  awaiting,
  openIds,
  selectedId,
  onSelect,
  onOpenProject,
  view,
  onViewChange,
  tapOpens,
  ...frame
}: Props) {
  function open(id: string) {
    if (id === COMPLETED_FOLDER) {
      onSelect(null);
      onViewChange("completed");
    } else {
      onOpenProject(id);
    }
  }
  const list = view === "completed" ? completed : projects;
  const empty = list.length === 0 && (view === "completed" || completed.length === 0);

  return (
    <MacWindow {...frame} id={FINDER_ID} title="Project Finder" canClose className="portal-window-finder">
      <div
        className="portal-fw"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onSelect(null);
        }}
      >
        <nav className="portal-fw-crumb" aria-label="Location">
          {view === "completed" ? (
            <>
              <button
                type="button"
                className="portal-fw-crumb-link"
                onClick={() => {
                  onSelect(null);
                  onViewChange("root");
                }}
              >
                All projects
              </button>
              <span className="portal-fw-crumb-sep" aria-hidden="true">
                /
              </span>
              <span className="portal-fw-crumb-here">Completed projects</span>
            </>
          ) : (
            <span className="portal-fw-crumb-here">All projects</span>
          )}
        </nav>
        {empty ? (
          <p className="portal-quiet">
            {view === "completed"
              ? "No completed projects yet."
              : "Nothing has been shared here yet. Deliverables will appear as soon as we send them."}
          </p>
        ) : (
          <div className="portal-fw-grid" role="group" aria-label={view === "completed" ? "Completed projects" : "Projects"}>
            {list.map((p) => {
              const count = awaiting[p.listId] ?? 0;
              const full = view === "root" && (count > 0 || hasRoadAhead(p.milestones));
              return (
                <Folder
                  key={p.listId}
                  id={p.listId}
                  label={p.name}
                  variant={full ? "full" : "flat"}
                  open={openIds.has(p.listId)}
                  selected={selectedId === p.listId}
                  badge={count}
                  tapOpens={tapOpens}
                  onSelect={onSelect}
                  onOpen={open}
                />
              );
            })}
            {view === "root" && completed.length > 0 && (
              <Folder
                id={COMPLETED_FOLDER}
                label={`Completed projects (${completed.length})`}
                variant="flat"
                open={false}
                selected={selectedId === COMPLETED_FOLDER}
                tapOpens={tapOpens}
                onSelect={onSelect}
                onOpen={open}
              />
            )}
          </div>
        )}
      </div>
    </MacWindow>
  );
}
