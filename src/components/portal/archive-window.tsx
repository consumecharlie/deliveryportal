"use client";

import type { PortalProject } from "@/lib/portal-page-model";
import { MacWindow, type WindowFrameProps } from "./mac-window";
import { ARCHIVE_ID } from "./desktop-state";
import { FolderIcon } from "./folder-icon";
import { ProjectBody } from "./project-window";

interface Props extends WindowFrameProps {
  token: string;
  projects: PortalProject[];
  /** The archived project whose table is showing, or null for the folder grid. */
  focusListId: string | null;
  onFocus: (listId: string | null) => void;
  tapOpens: boolean;
}

/**
 * ARCHIVE: completed projects as folders; opening one swaps the body to that
 * project's deliverables table (the rail hides itself once nothing is ahead).
 */
export function ArchiveWindow({ token, projects, focusListId, onFocus, tapOpens, ...frame }: Props) {
  const focused = focusListId ? projects.find((p) => p.listId === focusListId) ?? null : null;
  return (
    <MacWindow {...frame} id={ARCHIVE_ID} title="Archive" canClose className="portal-window-archive">
      {focused ? (
        <div className="portal-archive-project">
          <button type="button" className="portal-back" onClick={() => onFocus(null)}>
            All archived projects
          </button>
          <ProjectBody token={token} project={focused} />
        </div>
      ) : (
        <div className="portal-archive">
          <h3 className="portal-archive-h">Completed projects</h3>
          <p className="portal-archive-lede">
            {projects.length === 1 ? "One project, wrapped and delivered." : `${projects.length} projects, wrapped and delivered.`}
          </p>
          <div className="portal-archive-folders">
            {projects.map((p) => (
              <button
                key={p.listId}
                type="button"
                className="portal-fw-folder"
                title={p.name}
                onClick={() => tapOpens && onFocus(p.listId)}
                onDoubleClick={() => onFocus(p.listId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onFocus(p.listId);
                  }
                }}
              >
                <span className="portal-fw-art">
                  <FolderIcon variant="flat" width={72} />
                </span>
                <span className="portal-fw-label">{p.name}</span>
              </button>
            ))}
          </div>
          <p className="portal-archive-hint">{tapOpens ? "Tap a folder to see what we delivered." : "Double-click a folder to see what we delivered."}</p>
        </div>
      )}
    </MacWindow>
  );
}
