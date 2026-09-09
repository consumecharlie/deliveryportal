"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { PortalPageModel } from "@/lib/portal-page-model";
import {
  EMPTY_STATE,
  FINDER_ID,
  NOTE_ID,
  REVIEW_ID,
  UPNEXT_ID,
  VIEWER_ID,
  bootStorageKey,
  desktopStorageKey,
  loadDesktopState,
  mergeOrder,
  patchWindow,
  raiseWindow,
  saveDesktopState,
  type DesktopState,
  type WinState,
} from "./desktop-state";
import type { WindowFrameProps } from "./mac-window";
import { MenuBar } from "./menu-bar";
import { BootScreen } from "./boot-screen";
import { FinderWindow, type FinderView } from "./finder-window";
import { ReviewWindow } from "./review-window";
import { UpNextWindow } from "./up-next-window";
import { ViewerWindow } from "./viewer-window";
import { NoteWindow } from "./note-window";
import { Dock, type DockEntry } from "./dock";

/** Dock shortcut: the Finder navigated into Completed projects. */
const COMPLETED_DOCK_ID = "completed";

const PAD = 24;
const GAP = 24;
const BOTTOM_STRIP = 132;
/** Top gutter: the 44px floaters sit fully above the first row. */
const TOP_GUTTER = 60;
const TWO_COLUMN_MIN = 1100;
const MAX_CONTENT = 1440;
const REACH = 80;
const WIDE_MIN = 900;
const BOOT_MS = 1400;

interface Props {
  token: string;
  model: PortalPageModel;
  /** Sandbox (PORTAL_SANDBOX=1): show the PREVIEW ribbon; nothing here is shared with clients yet. */
  sandbox?: boolean;
}

const PREVIEW_RIBBON_STYLE: CSSProperties = {
  position: "fixed",
  top: 56,
  right: 12,
  zIndex: 2001,
  padding: "4px 10px",
  borderRadius: 4,
  background: "#DBEF00",
  color: "#151919",
  fontSize: 10,
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  lineHeight: 1.4,
  pointerEvents: "auto",
  boxShadow: "0 1px 0 rgba(21, 25, 25, 0.15)",
};

interface Placement {
  x: number;
  y: number;
  w: number;
}

type Phase = "pending" | "boot" | "ready";

/**
 * The client's desktop: menu bar, 62px grid, the window manager (open state,
 * z-order, drag positions and viewer tabs persisted per token), the Project
 * Finder, the Project Viewer and the other windows. Under 900px the windows
 * stack in the brief's order and nothing drags.
 */
export function Desktop({ token, model, sandbox = false }: Props) {
  const router = useRouter();
  const focusListId = model.focusListId;
  const focusMode = focusListId !== null;
  const storageKey = desktopStorageKey(token, focusListId);

  const active = useMemo(() => model.projects.filter((p) => p.phase === "in-progress"), [model.projects]);
  const completed = useMemo(() => model.projects.filter((p) => p.phase === "completed"), [model.projects]);
  const focusProject = focusMode ? model.projects.find((p) => p.listId === focusListId) ?? null : null;

  /** Default viewer tabs: every in-progress project, most recent activity first (and active). */
  const defaultTabs = useMemo(() => {
    if (focusMode) return focusProject ? [focusProject.listId] : [];
    return [...active].sort((a, b) => b.lastActivityMs - a.lastActivityMs).map((p) => p.listId);
  }, [focusMode, focusProject, active]);

  const awaiting = useMemo(() => {
    const out: Record<string, number> = {};
    for (const a of model.attention) out[a.projectListId] = (out[a.projectListId] ?? 0) + 1;
    return out;
  }, [model.attention]);

  const defaultOrder = useMemo(() => {
    const ids: string[] = [];
    if (!focusMode) ids.push(UPNEXT_ID);
    ids.push(VIEWER_ID, NOTE_ID);
    if (!focusMode) ids.push(FINDER_ID);
    ids.push(REVIEW_ID);
    return ids;
  }, [focusMode]);

  const [state, setState] = useState<DesktopState>(EMPTY_STATE);
  const [phase, setPhase] = useState<Phase>("pending");
  const [canvasW, setCanvasW] = useState<number | null>(null);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [env, setEnv] = useState<{ reducedMotion: boolean; coarse: boolean }>({ reducedMotion: false, coarse: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [finderView, setFinderView] = useState<FinderView>("root");
  const [popped, setPopped] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  // First client frame: restore the desktop, read the environment, measure,
  // and decide whether to boot. All in a layout effect so nothing paints early.
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only state must be read after hydration
    setState(loadDesktopState(storageKey));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    setEnv({ reducedMotion: reduced, coarse });
    if (canvasRef.current && canvasRef.current.clientWidth > 0) setCanvasW(canvasRef.current.clientWidth);

    let booted = true;
    try {
      booted = window.sessionStorage.getItem(bootStorageKey(token)) === "1";
      window.sessionStorage.setItem(bootStorageKey(token), "1");
    } catch {
      /* no sessionStorage: skip the boot */
    }
    if (booted || reduced) {
      setPhase("ready");
      return;
    }
    setPhase("boot");
    const t = window.setTimeout(() => setPhase("ready"), BOOT_MS);
    return () => window.clearTimeout(t);
  }, [storageKey, token]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // A zero width is a transient (display toggles, emulated resizes), never a layout.
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) setCanvasW(el.clientWidth);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The entrance pop plays once, when the desktop first becomes ready.
  useEffect(() => {
    if (phase !== "ready" || popped) return;
    const t = window.setTimeout(() => setPopped(true), 1200);
    return () => window.clearTimeout(t);
  }, [phase, popped]);

  const commit = useCallback(
    (fn: (s: DesktopState) => DesktopState) => {
      setState((s) => {
        const next = fn(s);
        saveDesktopState(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const onMeasure = useCallback((id: string, h: number) => {
    setHeights((prev) => (prev[id] === h ? prev : { ...prev, [id]: h }));
  }, []);

  const wide = canvasW !== null && canvasW >= WIDE_MIN;
  const draggable = wide && !env.reducedMotion && !env.coarse;
  const tapOpens = env.coarse;

  const knownIds = useMemo(() => new Set(model.projects.map((p) => p.listId)), [model.projects]);
  /** Viewer tabs: the client's list when set, else the defaults; unknown projects dropped. */
  const tabs = (state.tabs ?? defaultTabs).filter((id) => knownIds.has(id));
  const activeTab = state.activeTab && tabs.includes(state.activeTab) ? state.activeTab : tabs[0] ?? null;

  function defaultOpen(id: string): boolean {
    if (id === REVIEW_ID) return true;
    if (id === UPNEXT_ID || id === FINDER_ID) return !focusMode;
    if (id === VIEWER_ID) return tabs.length > 0;
    return false;
  }
  function win(id: string): WinState {
    return { open: defaultOpen(id), minimized: false, zoomed: false, x: null, y: null, ...state.windows[id] };
  }

  const order = mergeOrder(state.order, defaultOrder);
  const zOf = (id: string) => 10 + order.indexOf(id);

  // Default layout: a non-overlapping grid computed from the viewport width
  // and the windows' measured natural heights (reported before paint). Row 1:
  // Needs your review (40%) and Up next (60%); row 2: Project Finder (40%),
  // the right column left to Up next; then the Project Viewer full width.
  // Under 1100px a single column in the same order. Content centers up to
  // 1440px; the drag zone is the whole canvas. Persisted positions win.
  const fullW = canvasW ?? 1280;
  const contentW = Math.min(fullW, MAX_CONTENT);
  const offX = Math.max(0, Math.floor((fullW - contentW) / 2));
  const W = contentW - 2 * PAD;
  const left = PAD + offX;
  const twoColumn = !focusMode && fullW >= TWO_COLUMN_MIN;
  const h = (id: string) => (win(id).open ? heights[id] ?? 0 : 0);
  const leftW = Math.round((W - GAP) * 0.4);
  const rightW = W - GAP - leftW;
  const noteW = Math.min(420, W);

  // Rows: pairs fill the two columns; a single id with `narrow` sits in the
  // left column only (the right column stays free for a taller Up next).
  type GridRow = { ids: string[]; narrow?: boolean };
  const gridRows: GridRow[] = twoColumn
    ? [{ ids: [REVIEW_ID, UPNEXT_ID] }, { ids: [FINDER_ID], narrow: true }, { ids: [VIEWER_ID] }]
    : [REVIEW_ID, ...(focusMode ? [] : [UPNEXT_ID, FINDER_ID]), VIEWER_ID].map((id) => ({ ids: [id] }));
  const grid: Record<string, Placement> = {};
  let cursor = TOP_GUTTER;
  let rightBottom = 0;
  for (const row of gridRows) {
    const rowH = Math.max(...row.ids.map(h));
    if (row.ids.length === 2) {
      grid[row.ids[0]] = { x: left, y: cursor, w: leftW };
      grid[row.ids[1]] = { x: left + leftW + GAP, y: cursor, w: rightW };
      rightBottom = cursor + h(row.ids[1]);
      if (h(row.ids[0]) > 0) cursor += h(row.ids[0]) + GAP;
      else if (rowH > 0) cursor += rowH + GAP;
    } else if (row.narrow) {
      grid[row.ids[0]] = { x: left, y: cursor, w: leftW };
      if (rowH > 0) cursor += rowH + GAP;
      // Full-width rows start under whichever column runs longer.
      if (rightBottom > 0) cursor = Math.max(cursor, rightBottom + GAP);
    } else {
      grid[row.ids[0]] = { x: left, y: cursor, w: focusMode && row.ids[0] === REVIEW_ID ? Math.min(W, 640) : W };
      if (rowH > 0) cursor += rowH + GAP;
    }
  }

  function defaults(id: string): Placement {
    if (id === NOTE_ID) return { x: offX + W + PAD - noteW, y: TOP_GUTTER + 40, w: noteW };
    return grid[id] ?? { x: left, y: cursor, w: W };
  }

  function place(id: string): Placement {
    const s = win(id);
    const d = defaults(id);
    let x = s.x ?? d.x;
    let y = s.y ?? d.y;
    let w = d.w;
    if (s.zoomed) {
      x = PAD + offX;
      w = W;
    }
    x = Math.max(-(w - REACH), Math.min(fullW - REACH, x));
    y = Math.max(0, y);
    return { x, y, w };
  }

  const openIds = order.filter((id) => win(id).open);
  let canvasH = 0;
  if (wide) {
    for (const id of openIds) {
      const p = place(id);
      canvasH = Math.max(canvasH, p.y + (heights[id] ?? 0));
    }
  }
  canvasH += BOTTOM_STRIP;

  // Reading order for the staggered entrance pop.
  const readingOrder = [REVIEW_ID, UPNEXT_ID, FINDER_ID, VIEWER_ID, NOTE_ID];
  const popIndex = (id: string) => (phase === "ready" && !popped && !env.reducedMotion ? Math.max(0, readingOrder.indexOf(id)) : null);

  const getBounds = useCallback(() => {
    const el = canvasRef.current;
    return el ? { width: el.clientWidth, height: el.clientHeight } : null;
  }, []);

  const close = useCallback(
    (id: string) => {
      if (focusMode && id === VIEWER_ID) {
        router.push(`/portal/${token}`);
        return;
      }
      commit((s) => patchWindow(s, id, { open: false }));
    },
    [commit, focusMode, router, token]
  );
  const minimize = useCallback((id: string) => commit((s) => patchWindow(s, id, { minimized: !(s.windows[id]?.minimized ?? false) })), [commit]);
  const zoom = useCallback((id: string) => commit((s) => patchWindow(s, id, { zoomed: !(s.windows[id]?.zoomed ?? false) })), [commit]);
  const move = useCallback((id: string, x: number, y: number) => commit((s) => patchWindow(s, id, { x, y })), [commit]);
  const raise = useCallback(
    (id: string) => {
      setState((s) => {
        const cur = mergeOrder(s.order, defaultOrder);
        if (cur[cur.length - 1] === id) return s;
        const next = raiseWindow(s, id, defaultOrder);
        saveDesktopState(storageKey, next);
        return next;
      });
    },
    [defaultOrder, storageKey]
  );
  const openWindow = useCallback(
    (id: string) => {
      commit((s) => {
        let next = s;
        // Reopening the viewer after its last tab was closed brings the default tabs back.
        if (id === VIEWER_ID && (s.tabs ?? defaultTabs).filter((t) => knownIds.has(t)).length === 0) {
          next = { ...s, tabs: undefined, activeTab: undefined };
        }
        return raiseWindow(patchWindow(next, id, { open: true, minimized: false }), id, defaultOrder);
      });
    },
    [commit, defaultOrder, defaultTabs, knownIds]
  );
  function toggleNote() {
    if (win(NOTE_ID).open && !win(NOTE_ID).minimized) close(NOTE_ID);
    else openWindow(NOTE_ID);
  }
  const tidyUp = useCallback(() => {
    setFinderView("root");
    setSelected(null);
    commit(() => EMPTY_STATE);
  }, [commit]);

  /** Open a project as a viewer tab (activating an existing one) and raise the viewer. */
  function openProject(listId: string) {
    setSelected(listId);
    commit((s) => {
      const cur = (s.tabs ?? defaultTabs).filter((id) => knownIds.has(id));
      const next = cur.includes(listId) ? cur : [...cur, listId];
      const opened = patchWindow({ ...s, tabs: next, activeTab: listId }, VIEWER_ID, { open: true, minimized: false });
      return raiseWindow(opened, VIEWER_ID, defaultOrder);
    });
  }
  function activateTab(listId: string) {
    commit((s) => ({ ...s, activeTab: listId }));
  }
  /** Close a tab; the neighbor takes over; closing the last tab closes the viewer. */
  function closeTab(listId: string) {
    if (focusMode) {
      router.push(`/portal/${token}`);
      return;
    }
    commit((s) => {
      const cur = (s.tabs ?? defaultTabs).filter((id) => knownIds.has(id));
      const i = cur.indexOf(listId);
      const next = cur.filter((id) => id !== listId);
      const wasActive = (s.activeTab && cur.includes(s.activeTab) ? s.activeTab : cur[0]) === listId;
      const activeNext = wasActive ? next[Math.min(i, next.length - 1)] ?? null : s.activeTab ?? null;
      const withTabs: DesktopState = { ...s, tabs: next, activeTab: activeNext };
      return next.length === 0 ? patchWindow(withTabs, VIEWER_ID, { open: false }) : withTabs;
    });
  }
  /** The Completed projects shortcut: the Finder, navigated into that folder. */
  function openCompleted() {
    setFinderView("completed");
    setSelected(null);
    openWindow(FINDER_ID);
  }

  /** Dock click: closed opens at its last or default spot, minimized restores, open raises, top minimizes. */
  function activate(id: string) {
    if (id === COMPLETED_DOCK_ID) {
      openCompleted();
      if (!wide) {
        window.setTimeout(() => {
          document.querySelector(`[data-window="${FINDER_ID}"]`)?.scrollIntoView({ behavior: env.reducedMotion ? "auto" : "smooth", block: "start" });
        }, 60);
      }
      return;
    }
    const s = win(id);
    if (!wide) {
      commit((st) => patchWindow(st, id, { open: true, minimized: false }));
      window.setTimeout(() => {
        document.querySelector(`[data-window="${id}"]`)?.scrollIntoView({ behavior: env.reducedMotion ? "auto" : "smooth", block: "start" });
      }, 60);
      return;
    }
    if (!s.open) {
      openWindow(id);
      return;
    }
    if (s.minimized) {
      commit((st) => raiseWindow(patchWindow(st, id, { minimized: false }), id, defaultOrder));
      return;
    }
    if (order[order.length - 1] === id) commit((st) => patchWindow(st, id, { minimized: true }));
    else raise(id);
  }

  const dockState = (id: string): DockEntry["state"] => {
    const s = win(id);
    return !s.open ? "closed" : s.minimized ? "minimized" : "open";
  };
  const dockEntries: DockEntry[] = [{ id: REVIEW_ID, label: "Needs your review", icon: "review", state: dockState(REVIEW_ID) }];
  if (!focusMode) {
    const finder = win(FINDER_ID);
    dockEntries.push(
      { id: UPNEXT_ID, label: "Up next", icon: "upnext", state: dockState(UPNEXT_ID) },
      { id: FINDER_ID, label: "Project Finder", icon: "finder", state: dockState(FINDER_ID) },
      {
        id: COMPLETED_DOCK_ID,
        label: "Completed projects",
        icon: "completed",
        state: finder.open && finderView === "completed" ? (finder.minimized ? "minimized" : "open") : "closed",
      }
    );
  }
  dockEntries.push(
    { id: VIEWER_ID, label: "Project Viewer", icon: "viewer", state: dockState(VIEWER_ID) },
    { id: NOTE_ID, label: "Notes", icon: "note", state: dockState(NOTE_ID) }
  );

  const frame = (id: string): WindowFrameProps => {
    const s = win(id);
    const p = wide ? place(id) : null;
    return {
      x: p ? p.x : null,
      y: p ? p.y : null,
      width: p ? p.w : null,
      zIndex: zOf(id),
      minimized: s.minimized,
      zoomed: s.zoomed,
      draggable,
      popIndex: popIndex(id),
      isTop: order[order.length - 1] === id,
      onClose: close,
      onMinimize: minimize,
      onZoom: zoom,
      onRaise: raise,
      onMove: move,
      onMeasure,
      getBounds,
    };
  };

  const openProjectIds = new Set(win(VIEWER_ID).open ? tabs : []);
  const reviewItems = focusMode ? model.attention.filter((a) => a.projectListId === focusListId) : model.attention;

  const rootCls = [
    "portal-desktop",
    phase !== "ready" ? "portal-desktop-pending" : "",
    wide ? "portal-desktop-wide" : "portal-desktop-stack",
    env.reducedMotion ? "portal-desktop-still" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootCls} onPointerDown={(e) => e.target === canvasRef.current && setSelected(null)}>
      <MenuBar
        clientName={model.clientName}
        clientLogoUrl={model.clientLogoUrl}
        clientDomain={model.clientDomain}
        crumb={focusMode && focusProject ? { href: `/portal/${token}`, projectName: focusProject.name } : undefined}
        noteOpen={win(NOTE_ID).open}
        onNote={toggleNote}
        onTidy={tidyUp}
      />
      {sandbox && (
        <span
          className="portal-pixel-caption"
          style={PREVIEW_RIBBON_STYLE}
          title="This portal is in preview and not yet shared with clients."
          aria-label="Preview: this portal is in preview and not yet shared with clients."
        >
          Preview
        </span>
      )}

      <div ref={canvasRef} className="portal-canvas" style={wide ? { height: canvasH } : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
        <img src="/ghost-icon.svg" alt="" aria-hidden="true" draggable={false} className="portal-desk-ghost animate-float-slow" />
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
        <img src="/cherry-icon.svg" alt="" aria-hidden="true" draggable={false} className="portal-desk-cherry animate-float-medium" />

        {win(REVIEW_ID).open && <ReviewWindow {...frame(REVIEW_ID)} token={token} items={reviewItems} />}

        {!focusMode && win(UPNEXT_ID).open && <UpNextWindow {...frame(UPNEXT_ID)} projects={active} />}

        {!focusMode && win(FINDER_ID).open && (
          <FinderWindow
            {...frame(FINDER_ID)}
            projects={active}
            completed={completed}
            awaiting={awaiting}
            openIds={openProjectIds}
            selectedId={selected}
            onSelect={setSelected}
            onOpenProject={openProject}
            view={finderView}
            onViewChange={setFinderView}
            tapOpens={tapOpens}
          />
        )}

        {win(VIEWER_ID).open && tabs.length > 0 && (
          <ViewerWindow
            {...frame(VIEWER_ID)}
            token={token}
            projects={model.projects}
            tabs={tabs}
            activeTab={activeTab}
            onActivateTab={activateTab}
            onCloseTab={closeTab}
            defaultOpenRows={focusMode}
          />
        )}

        {win(NOTE_ID).open && <NoteWindow {...frame(NOTE_ID)} token={token} listId={focusListId ?? undefined} />}
      </div>

      {phase === "ready" && <Dock entries={dockEntries} onActivate={activate} stacked={!wide} reducedMotion={env.reducedMotion} magnify={draggable} />}

      {phase === "boot" && <BootScreen />}
    </div>
  );
}
