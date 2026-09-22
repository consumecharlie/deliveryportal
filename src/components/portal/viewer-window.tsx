"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ACTIVE_H,
  INACTIVE_H,
  STRIP_H,
  activeTabPath,
  baselineSegments,
  baselineY,
  stripWidth,
  tabPath,
  tabSlots,
} from "./tab-shape";
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
  /** Commit a new tab order after a drag or a keyboard move. */
  onReorderTabs: (order: string[]) => void;
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
/** Move one item, returning a new array. */
function moved(order: string[], from: number, to: number): string[] {
  const next = order.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function ViewerWindow({
  token,
  projects,
  tabs,
  activeTab,
  onActivateTab,
  onCloseTab,
  onReorderTabs,
  stacked = false,
  ...frame
}: Props) {
  const byId = new Map(projects.map((p) => [p.listId, p]));
  const open = tabs.filter((id) => byId.has(id));
  const current = activeTab && open.includes(activeTab) ? activeTab : open[0] ?? null;
  const project = current ? byId.get(current) ?? null : null;
  const listRef = useRef<HTMLDivElement>(null);
  const [stripW, setStripW] = useState(0);
  /** A drag in flight: which tab, where it started, where it would land. */
  const [drag, setDrag] = useState<{ id: string; from: number; to: number; dx: number } | null>(null);
  const dragRef = useRef<{ id: string; from: number; startX: number; tabW: number; count: number; moved: boolean } | null>(null);
  /** Set while a drag is ending, so the click that follows does not activate. */
  const suppressClick = useRef(false);
  const canDrag = !stacked && typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The strip divides equally among the open tabs, so its own width drives
  // the geometry. Measured before paint and kept current as the window resizes.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const read = () => setStripW(el.clientWidth);
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
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

  // Keep the active tab in view when it changes. This nudges the strip's own
  // horizontal scroll only: scrollIntoView would scroll the page as well, which
  // loaded the whole portal scrolled down to the viewer.
  useEffect(() => {
    if (!current) return;
    const list = listRef.current;
    const tab = list?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(current)}"]`);
    if (!list || !tab) return;
    const l = list.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    if (t.left < l.left) list.scrollLeft -= l.left - t.left + 8;
    else if (t.right > l.right) list.scrollLeft += t.right - l.right + 8;
  }, [current]);

  function startDrag(e: React.PointerEvent, id: string, index: number, tabW: number, count: number) {
    if (!canDrag || e.pointerType !== "mouse" || e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".portal-tab-x")) return;
    dragRef.current = { id, from: index, startX: e.clientX, tabW, count, moved: false };
  }

  // Pointer moves land on the window so the drag survives leaving the tab.
  useEffect(() => {
    if (!canDrag) return;
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      // A few pixels of slop, so a click is still a click.
      if (!d.moved && Math.abs(dx) < 4) return;
      d.moved = true;
      const to = Math.max(0, Math.min(d.count - 1, d.from + Math.round(dx / d.tabW)));
      setDrag({ id: d.id, from: d.from, to, dx });
    }
    function onUp() {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d) return;
      if (d.moved) {
        suppressClick.current = true;
        window.setTimeout(() => (suppressClick.current = false), 0);
        setDrag((cur) => {
          if (cur && cur.to !== cur.from) onReorderTabs(moved(open, cur.from, cur.to));
          return null;
        });
      }
    }
    function onCancel(e: KeyboardEvent) {
      if (e.key !== "Escape" || !dragRef.current) return;
      dragRef.current = null;
      setDrag(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onCancel);
    };
  }, [canDrag, onReorderTabs, open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!current) return;
    const i = open.indexOf(current);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "w") {
      e.preventDefault();
      onCloseTab(current);
      return;
    }
    const inTabs = (e.target as HTMLElement).closest(".portal-tabs");
    if ((e.metaKey || e.ctrlKey) && inTabs && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault();
      const to = e.key === "ArrowRight" ? Math.min(open.length - 1, i + 1) : Math.max(0, i - 1);
      if (to !== i) onReorderTabs(moved(open, i, to));
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
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

  const totalW = stripWidth(stripW, open.length);
  const slots = tabSlots(totalW, open.length);
  const activeIndex = current ? open.indexOf(current) : -1;
  const tabW = slots.length ? slots[0].x1 - slots[0].x0 : 0;

  /** Where tab `i` sits while a drag is in flight, and how far it has shifted. */
  function shiftFor(i: number): number {
    if (!drag) return 0;
    if (i === drag.from) return drag.dx;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -tabW;
    if (drag.to < drag.from && i >= drag.to && i < drag.from) return tabW;
    return 0;
  }
  /** The slot a tab will land in, which is where the baseline breaks. */
  function landingIndex(i: number): number {
    if (!drag) return i;
    if (i === drag.from) return drag.to;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return i - 1;
    if (drag.to < drag.from && i >= drag.to && i < drag.from) return i + 1;
    return i;
  }
  const activeLanding = activeIndex >= 0 ? landingIndex(activeIndex) : -1;

  return (
    <MacWindow {...frame} id={VIEWER_ID} title="Project Viewer" canClose className="portal-window-viewer">
      <div className="portal-viewer" onKeyDown={onKeyDown}>
        <div ref={listRef} className="portal-tabs" role="tablist" aria-label="Open projects">
          <div className="portal-tabs-inner" style={{ width: totalW, height: STRIP_H }}>
            {/* One drawing for the whole strip: neighbours share an exact edge
                and no shape has a blunt end to show as a burr. */}
            <svg
              className="portal-tabs-art"
              width={totalW}
              height={STRIP_H}
              viewBox={`0 0 ${totalW} ${STRIP_H}`}
              aria-hidden="true"
              focusable="false"
            >
              {slots.map((slot, i) =>
                open[i] === current ? null : (
                  <path
                    key={open[i]}
                    className={`portal-tab-shape${drag && i === drag.from ? " portal-tab-shape-dragging" : ""}`}
                    d={tabPath(slot, INACTIVE_H)}
                    style={drag ? { transform: `translateX(${shiftFor(i)}px)` } : undefined}
                  />
                )
              )}
              {baselineSegments(totalW, activeLanding >= 0 ? slots[activeLanding] ?? null : null).map(([x1, x2]) => (
                <line key={x1} className="portal-tabs-edge" x1={x1} y1={baselineY} x2={x2} y2={baselineY} />
              ))}
              {activeIndex >= 0 && slots[activeIndex] && (
                <path
                  className={`portal-tab-shape portal-tab-shape-active${drag && activeIndex === drag.from ? " portal-tab-shape-dragging" : ""}`}
                  d={activeTabPath(slots[activeIndex])}
                  style={drag ? { transform: `translateX(${shiftFor(activeIndex)}px)` } : undefined}
                />
              )}
            </svg>
            {open.map((id, i) => {
              const p = byId.get(id)!;
              const isActive = id === current;
              const slot = slots[i];
              return (
                <div
                  key={id}
                  role="tab"
                  data-tab={id}
                  aria-selected={isActive}
                  aria-controls={`viewer-panel-${id}`}
                  tabIndex={isActive ? 0 : -1}
                  title={p.name}
                  className={`portal-tab${isActive ? " portal-tab-active" : ""}${drag && drag.from === i ? " portal-tab-dragging" : ""}`}
                  style={
                    slot
                      ? {
                          width: slot.x1 - slot.x0,
                          height: isActive ? ACTIVE_H : INACTIVE_H,
                          transform: drag ? `translateX(${shiftFor(i)}px)` : undefined,
                        }
                      : undefined
                  }
                  onPointerDown={(e) => startDrag(e, id, i, slot ? slot.x1 - slot.x0 : 0, open.length)}
                  onClick={() => {
                    if (suppressClick.current) return;
                    onActivateTab(id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onActivateTab(id);
                    }
                  }}
                >
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
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
                      <path d="M3 3l6 6M9 3l-6 6" />
                    </svg>
                  </button>
                  <span className="portal-tab-label">{p.name}</span>
                  {/* Balances the close control so the label stays centred. */}
                  <span className="portal-tab-pad" aria-hidden="true" />
                </div>
              );
            })}
          </div>
        </div>
        {project && (
          <div id={`viewer-panel-${project.listId}`} role="tabpanel" className="portal-viewer-panel">
            <div ref={bodyRef} style={floor > 0 ? { minHeight: floor } : undefined}>
              <ProjectBody key={project.listId} token={token} project={project} />
            </div>
          </div>
        )}
      </div>
    </MacWindow>
  );
}
