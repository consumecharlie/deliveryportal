"use client";

import { useEffect, useRef } from "react";
import type { PortalProject } from "@/lib/portal-page-model";
import { MacWindow, type WindowFrameProps } from "./mac-window";
import { VIEWER_ID } from "./desktop-state";
import { ProjectBody } from "./project-body";

interface Props extends WindowFrameProps {
  token: string;
  projects: PortalProject[];
  /** Open tabs (project listIds) in the order they were opened. */
  tabs: string[];
  activeTab: string | null;
  onActivateTab: (listId: string) => void;
  onCloseTab: (listId: string) => void;
  /** Project page: every table row starts expanded. */
  defaultOpenRows?: boolean;
}

/**
 * PROJECT VIEWER: one window for every open project, Finder-style tabs
 * under the title bar. Arrow keys switch tabs and cmd/ctrl+W closes the
 * active one while focus is inside the viewer.
 */
export function ViewerWindow({ token, projects, tabs, activeTab, onActivateTab, onCloseTab, defaultOpenRows = false, ...frame }: Props) {
  const byId = new Map(projects.map((p) => [p.listId, p]));
  const open = tabs.filter((id) => byId.has(id));
  const current = activeTab && open.includes(activeTab) ? activeTab : open[0] ?? null;
  const project = current ? byId.get(current) ?? null : null;
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the active tab in view when it changes.
  useEffect(() => {
    if (!current) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(current)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!current) return;
    const i = open.indexOf(current);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "w") {
      e.preventDefault();
      onCloseTab(current);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const inTabs = (e.target as HTMLElement).closest(".portal-tabs");
    if (e.key === "ArrowRight" && inTabs) {
      e.preventDefault();
      onActivateTab(open[(i + 1) % open.length]);
    } else if (e.key === "ArrowLeft" && inTabs) {
      e.preventDefault();
      onActivateTab(open[(i - 1 + open.length) % open.length]);
    } else if (e.key === "Home" && inTabs) {
      e.preventDefault();
      onActivateTab(open[0]);
    } else if (e.key === "End" && inTabs) {
      e.preventDefault();
      onActivateTab(open[open.length - 1]);
    }
  }

  return (
    <MacWindow {...frame} id={VIEWER_ID} title="Project Viewer" canClose className="portal-window-viewer">
      <div className="portal-viewer" onKeyDown={onKeyDown}>
        <div ref={listRef} className="portal-tabs" role="tablist" aria-label="Open projects">
          {open.map((id) => {
            const p = byId.get(id)!;
            const isActive = id === current;
            return (
              <div
                key={id}
                role="tab"
                data-tab={id}
                aria-selected={isActive}
                aria-controls={`viewer-panel-${id}`}
                tabIndex={isActive ? 0 : -1}
                title={p.name}
                className={`portal-tab${isActive ? " portal-tab-active" : ""}`}
                onClick={() => onActivateTab(id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onActivateTab(id);
                  }
                }}
              >
                <span className="portal-tab-label">{p.name}</span>
                <button
                  type="button"
                  className="portal-tab-x"
                  aria-label={`Close ${p.name}`}
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(id);
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                    <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
        {project && (
          <div id={`viewer-panel-${project.listId}`} role="tabpanel" className="portal-viewer-panel">
            <ProjectBody key={project.listId} token={token} project={project} defaultOpenRows={defaultOpenRows} />
          </div>
        )}
      </div>
    </MacWindow>
  );
}
