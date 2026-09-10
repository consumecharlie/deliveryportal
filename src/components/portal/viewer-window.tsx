"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  /** Phones: windows flow in a column, so the viewer keeps its natural height. */
  stacked?: boolean;
}

/**
 * PROJECT VIEWER: one window for every open project, Finder-style tabs
 * under the title bar. Arrow keys switch tabs and cmd/ctrl+W closes the
 * active one while focus is inside the viewer.
 *
 * The body never shrinks while tabs are open: each tab's natural height is
 * remembered as it renders and the body floors at the tallest open tab, so
 * switching from a long project to a short one leaves space below instead of
 * collapsing the window, which would move the page under the reader. The
 * floor is derived during render from heights already recorded, so the new
 * tab paints at the right height with no intermediate frame. Closing the
 * tallest tab drops it from the maximum and the window shrinks again. The
 * height is never animated, so reduced motion needs no special case.
 */
export function ViewerWindow({ token, projects, tabs, activeTab, onActivateTab, onCloseTab, defaultOpenRows = false, stacked = false, ...frame }: Props) {
  const byId = new Map(projects.map((p) => [p.listId, p]));
  const open = tabs.filter((id) => byId.has(id));
  const current = activeTab && open.includes(activeTab) ? activeTab : open[0] ?? null;
  const project = current ? byId.get(current) ?? null : null;
  const listRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [tabHeights, setTabHeights] = useState<Record<string, number>>({});

  /**
   * Measure the tab's own content, not the floored wrapper: the wrapper
   * carries the min-height, so observing it would feed its own floor back in
   * and the window could never shrink.
   */
  const measure = useCallback((listId: string | null) => {
    const el = bodyRef.current?.firstElementChild as HTMLElement | null | undefined;
    if (!listId || !el) return;
    const h = Math.round(el.getBoundingClientRect().height);
    if (h <= 0) return;
    setTabHeights((prev) => (prev[listId] === h ? prev : { ...prev, [listId]: h }));
  }, []);

  // Record the active tab's height before paint, then keep it current as rows
  // expand or collapse and as the window resizes.
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- layout measurement must land before paint
    measure(current);
  });
  useEffect(() => {
    const el = bodyRef.current?.firstElementChild;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure(current));
    ro.observe(el);
    return () => ro.disconnect();
  }, [current, measure]);

  // The floor: the tallest tab that is still open. Tabs never rendered yet
  // contribute nothing and raise it once they are opened.
  const floor = stacked ? 0 : open.reduce((max, id) => Math.max(max, tabHeights[id] ?? 0), 0);

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
            <div ref={bodyRef} style={floor > 0 ? { minHeight: floor } : undefined}>
              <ProjectBody key={project.listId} token={token} project={project} defaultOpenRows={defaultOpenRows} />
            </div>
          </div>
        )}
      </div>
    </MacWindow>
  );
}
