"use client";

import { forwardRef } from "react";
import type { PortalProject } from "@/lib/portal-page-model";
import { FolderIcon } from "./folder-icon";
import { hasRoadAhead } from "./roadmap-rail";
import { truncate } from "./format";

export const ARCHIVE_FOLDER = "archive";
const LABEL_MAX = 28;

interface Props {
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
  style?: React.CSSProperties;
  className?: string;
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
  const shown = truncate(label, LABEL_MAX);
  return (
    <button
      type="button"
      className={`portal-folder${selected ? " portal-folder-selected" : ""}${open ? " portal-folder-open" : ""}`}
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
      <span className="portal-folder-art">
        <FolderIcon variant={variant} open={open} width={60} />
        {badge ? (
          <span className="portal-folder-badge" aria-hidden="true">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="portal-folder-label" aria-hidden="true">
        {shown}
      </span>
    </button>
  );
}

/**
 * PROJECT FINDER: one folder per in-progress project plus the ARCHIVE folder.
 * Single click selects (Finder-style highlight), double-click or Enter opens;
 * on touch a tap opens. Folder art: full for projects with something ahead or
 * awaiting, flat for quiet ones, green outline while the window is open.
 */
export const ProjectFinder = forwardRef<HTMLDivElement, Props>(function ProjectFinder(
  { projects, awaiting, openIds, selectedId, onSelect, onOpen, archiveCount, archiveOpen, tapOpens, style, className },
  ref
) {
  return (
    <div
      ref={ref}
      className={`portal-finder${className ? ` ${className}` : ""}`}
      style={style}
      role="group"
      aria-labelledby="portal-finder-caption"
      onPointerDown={(e) => {
        // A click on the empty desktop between folders clears the selection.
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      <h2 id="portal-finder-caption" className="portal-finder-caption">
        Project Finder
      </h2>
      <div className="portal-folders">
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
        {projects.length === 0 && archiveCount === 0 && (
          <p className="portal-finder-empty">Nothing has been shared here yet. Deliverables will appear as soon as we send them.</p>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
        <img src="/cherry-icon.svg" alt="" aria-hidden="true" draggable={false} className="portal-finder-cherry animate-float-medium" />
      </div>
    </div>
  );
});
