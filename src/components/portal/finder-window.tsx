"use client";

import type { PortalProject } from "@/lib/portal-page-model";
import { MacWindow, type WindowFrameProps } from "./mac-window";
import { FINDER_ID } from "./desktop-state";
import { FolderIcon } from "./folder-icon";
import { hasRoadAhead } from "./roadmap-rail";

export const ARCHIVE_FOLDER = "archive";

interface Props extends WindowFrameProps {
  projects: PortalProject[];
  /** Items awaiting review per project listId. */
  awaiting: Record<string, number>;
  openIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Folder id: a project listId or ARCHIVE_FOLDER. */
  onOpen: (id: string) => void;
  archiveCount: number;
  archiveOpen: boolean;
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
 * PROJECT FINDER as a window: a grid of folders, one per in-progress project
 * plus ARCHIVE last. Single click selects (green outline), double-click, Enter
 * or a tap opens the project window. Labels wrap, never truncate.
 */
export function FinderWindow({
  projects,
  awaiting,
  openIds,
  selectedId,
  onSelect,
  onOpen,
  archiveCount,
  archiveOpen,
  tapOpens,
  ...frame
}: Props) {
  return (
    <MacWindow {...frame} id={FINDER_ID} title="Project Finder" canClose={false} className="portal-window-finder">
      <div
        className="portal-fw"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onSelect(null);
        }}
      >
        {projects.length === 0 && archiveCount === 0 ? (
          <p className="portal-quiet">Nothing has been shared here yet. Deliverables will appear as soon as we send them.</p>
        ) : (
          <div className="portal-fw-grid" role="group" aria-label="Projects">
            {projects.map((p) => {
              const count = awaiting[p.listId] ?? 0;
              const full = count > 0 || hasRoadAhead(p.milestones);
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
                  onOpen={onOpen}
                />
              );
            })}
            {archiveCount > 0 && (
              <Folder
                id={ARCHIVE_FOLDER}
                label={`Archive (${archiveCount})`}
                variant="flat"
                open={archiveOpen}
                selected={selectedId === ARCHIVE_FOLDER}
                tapOpens={tapOpens}
                onSelect={onSelect}
                onOpen={onOpen}
              />
            )}
          </div>
        )}
      </div>
    </MacWindow>
  );
}
