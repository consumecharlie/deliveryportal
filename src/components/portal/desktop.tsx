"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PortalPageModel, PortalProject } from "@/lib/portal-page-model";
import {
  ARCHIVE_ID,
  EMPTY_STATE,
  FINDER_ID,
  NOTE_ID,
  REVIEW_ID,
  UPNEXT_ID,
  bootStorageKey,
  desktopStorageKey,
  listIdOfWindow,
  loadDesktopState,
  mergeOrder,
  patchWindow,
  projectWindowId,
  raiseWindow,
  saveDesktopState,
  type DesktopState,
  type WinState,
} from "./desktop-state";
import type { WindowFrameProps } from "./mac-window";
import { MenuBar } from "./menu-bar";
import { BootScreen } from "./boot-screen";
import { FinderWindow, ARCHIVE_FOLDER } from "./finder-window";
import { ReviewWindow } from "./review-window";
import { UpNextWindow } from "./up-next-window";
import { ProjectWindow } from "./project-window";
import { ArchiveWindow } from "./archive-window";
import { NoteWindow } from "./note-window";
import { Dock, type DockEntry } from "./dock";

const PAD = 24;
const GAP = 24;
const BOTTOM_STRIP = 132;
const TWO_COLUMN_MIN = 1100;
const MAX_CONTENT = 1440;
const REACH = 80;
const WIDE_MIN = 900;
const BOOT_MS = 1400;

interface Props {
  token: string;
  model: PortalPageModel;
}

interface Placement {
  x: number;
  y: number;
  w: number;
}

type Phase = "pending" | "boot" | "ready";

/**
 * The client's desktop: menu bar, 62px grid, the window manager (open state,
 * z-order, drag positions persisted per token), the Project Finder, and the
 * windows. Under 900px the windows stack in the brief's order and nothing drags.
 */
export function Desktop({ token, model }: Props) {
  const router = useRouter();
  const focusListId = model.focusListId;
  const focusMode = focusListId !== null;
  const storageKey = desktopStorageKey(token, focusListId);

  const active = useMemo(() => model.projects.filter((p) => p.phase === "in-progress"), [model.projects]);
  const archived = useMemo(() => model.projects.filter((p) => p.phase === "completed"), [model.projects]);
  const focusProject = focusMode ? model.projects.find((p) => p.listId === focusListId) ?? null : null;

  /** Project windows that exist on this desktop, oldest activity first (cascade order). */
  const cascade: PortalProject[] = useMemo(() => {
    if (focusMode) return focusProject ? [focusProject] : [];
    return [...active].sort((a, b) => a.lastActivityMs - b.lastActivityMs);
  }, [focusMode, focusProject, active]);

  const awaiting = useMemo(() => {
    const out: Record<string, number> = {};
    for (const a of model.attention) out[a.projectListId] = (out[a.projectListId] ?? 0) + 1;
    return out;
  }, [model.attention]);

  const defaultOrder = useMemo(() => {
    const ids: string[] = [];
    if (!focusMode) ids.push(UPNEXT_ID);
    for (const p of cascade) ids.push(projectWindowId(p.listId));
    ids.push(ARCHIVE_ID, NOTE_ID);
    if (!focusMode) ids.push(FINDER_ID);
    ids.push(REVIEW_ID);
    return ids;
  }, [focusMode, cascade]);

  const [state, setState] = useState<DesktopState>(EMPTY_STATE);
  const [phase, setPhase] = useState<Phase>("pending");
  const [canvasW, setCanvasW] = useState<number | null>(null);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [env, setEnv] = useState<{ reducedMotion: boolean; coarse: boolean }>({ reducedMotion: false, coarse: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [archiveFocus, setArchiveFocus] = useState<string | null>(null);
  const [popped, setPopped] = useState(false);
  /** Project windows opened at some point this session keep a dock item after closing. */
  const [everOpened, setEverOpened] = useState<string[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);

  // First client frame: restore the desktop, read the environment, measure,
  // and decide whether to boot. All in a layout effect so nothing paints early.
  useLayoutEffect(() => {
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

  function defaultOpen(id: string): boolean {
    if (id === REVIEW_ID) return true;
    if (id === UPNEXT_ID || id === FINDER_ID || id === ARCHIVE_ID) return !focusMode;
    if (id === NOTE_ID) return false;
    return true;
  }
  function win(id: string): WinState {
    return { open: defaultOpen(id), minimized: false, zoomed: false, x: null, y: null, ...state.windows[id] };
  }

  const order = mergeOrder(state.order, defaultOrder);
  const zOf = (id: string) => 10 + order.indexOf(id);

  // Default layout: a non-overlapping grid computed from the viewport width
  // and the windows' measured natural heights (reported before paint). Row 1:
  // Needs your review (40%) and Up next (60%); row 2: Project Finder (40%) and
  // Archive (60%); then each project window full width, most recent first.
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

  const projectIds = [...cascade].reverse().map((p) => projectWindowId(p.listId));
  const gridRows: string[][] = twoColumn
    ? [[REVIEW_ID, UPNEXT_ID], [FINDER_ID, ARCHIVE_ID], ...projectIds.map((id) => [id])]
    : [REVIEW_ID, ...(focusMode ? [] : [UPNEXT_ID, FINDER_ID, ARCHIVE_ID]), ...projectIds].map((id) => [id]);
  const grid: Record<string, Placement> = {};
  let cursor = PAD;
  for (const row of gridRows) {
    const rowH = Math.max(...row.map(h));
    if (row.length === 2) {
      grid[row[0]] = { x: left, y: cursor, w: leftW };
      grid[row[1]] = { x: left + leftW + GAP, y: cursor, w: rightW };
    } else {
      grid[row[0]] = { x: left, y: cursor, w: focusMode && row[0] === REVIEW_ID ? Math.min(W, 640) : W };
    }
    if (rowH > 0) cursor += rowH + GAP;
  }

  function defaults(id: string): Placement {
    if (id === NOTE_ID) return { x: offX + W + PAD - noteW, y: PAD + 40, w: noteW };
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
  const readingOrder = [REVIEW_ID, UPNEXT_ID, FINDER_ID, ARCHIVE_ID, ...projectIds, NOTE_ID];
  const popIndex = (id: string) => (phase === "ready" && !popped && !env.reducedMotion ? Math.max(0, readingOrder.indexOf(id)) : null);

  const getBounds = useCallback(() => {
    const el = canvasRef.current;
    return el ? { width: el.clientWidth, height: el.clientHeight } : null;
  }, []);

  const close = useCallback(
    (id: string) => {
      if (focusMode && listIdOfWindow(id)) {
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
      commit((s) => raiseWindow(patchWindow(s, id, { open: true, minimized: false }), id, defaultOrder));
    },
    [commit, defaultOrder]
  );
  function toggleNote() {
    if (win(NOTE_ID).open && !win(NOTE_ID).minimized) close(NOTE_ID);
    else openWindow(NOTE_ID);
  }
  const tidyUp = useCallback(() => {
    setArchiveFocus(null);
    setSelected(null);
    setEverOpened([]);
    commit(() => EMPTY_STATE);
  }, [commit]);

  // Remember every project window that has been open this session.
  useEffect(() => {
    const openNow = cascade.filter((p) => win(projectWindowId(p.listId)).open).map((p) => p.listId);
    setEverOpened((prev) => {
      const add = openNow.filter((id) => !prev.includes(id));
      return add.length ? [...prev, ...add] : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- win() derives from state
  }, [state, cascade]);

  /** Dock click: closed opens at its last or default spot, minimized restores, open raises, top minimizes. */
  function activate(id: string) {
    const s = win(id);
    if (!wide) {
      commit((st) => patchWindow(st, id, { open: true, minimized: false }));
      window.setTimeout(() => {
        document.querySelector(`[data-window="${id}"]`)?.scrollIntoView({ behavior: env.reducedMotion ? "auto" : "smooth", block: "start" });
      }, 60);
      return;
    }
    if (!s.open) {
      if (id === ARCHIVE_ID) setArchiveFocus(null);
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
    dockEntries.push(
      { id: UPNEXT_ID, label: "Up next", icon: "upnext", state: dockState(UPNEXT_ID) },
      { id: FINDER_ID, label: "Project Finder", icon: "finder", state: dockState(FINDER_ID) },
      { id: ARCHIVE_ID, label: "Archive", icon: "archive", state: dockState(ARCHIVE_ID) }
    );
  }
  dockEntries.push({ id: NOTE_ID, label: "Notes", icon: "note", state: dockState(NOTE_ID) });
  for (const p of [...cascade].reverse()) {
    const id = projectWindowId(p.listId);
    if (win(id).open || everOpened.includes(p.listId)) {
      dockEntries.push({ id, label: p.name, icon: "project", state: dockState(id) });
    }
  }

  function openFolder(id: string) {
    setSelected(id);
    if (id === ARCHIVE_FOLDER) {
      setArchiveFocus(null);
      openWindow(ARCHIVE_ID);
    } else {
      openWindow(projectWindowId(id));
    }
  }

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

  const openProjectIds = new Set(cascade.filter((p) => win(projectWindowId(p.listId)).open).map((p) => p.listId));
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
        crumb={focusMode && focusProject ? { href: `/portal/${token}`, projectName: focusProject.name } : undefined}
        noteOpen={win(NOTE_ID).open}
        onNote={toggleNote}
        onTidy={tidyUp}
      />

      <div ref={canvasRef} className="portal-canvas" style={wide ? { height: canvasH } : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
        <img src="/ghost-icon.svg" alt="" aria-hidden="true" draggable={false} className="portal-desk-ghost animate-float-slow" />
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
        <img src="/cherry-icon.svg" alt="" aria-hidden="true" draggable={false} className="portal-desk-cherry animate-float-medium" />

        <ReviewWindow {...frame(REVIEW_ID)} token={token} items={reviewItems} />

        {!focusMode && win(UPNEXT_ID).open && <UpNextWindow {...frame(UPNEXT_ID)} projects={active} />}

        {!focusMode && win(FINDER_ID).open && (
          <FinderWindow
            {...frame(FINDER_ID)}
            projects={active}
            awaiting={awaiting}
            openIds={openProjectIds}
            selectedId={selected}
            onSelect={setSelected}
            onOpen={openFolder}
            archiveCount={archived.length}
            archiveOpen={win(ARCHIVE_ID).open}
            tapOpens={tapOpens}
          />
        )}

        {cascade.map(
          (p) =>
            win(projectWindowId(p.listId)).open && (
              <ProjectWindow key={p.listId} {...frame(projectWindowId(p.listId))} token={token} project={p} defaultOpenRows={focusMode} />
            )
        )}

        {!focusMode && win(ARCHIVE_ID).open && (
          <ArchiveWindow
            {...frame(ARCHIVE_ID)}
            token={token}
            projects={archived}
            focusListId={archiveFocus}
            onFocus={setArchiveFocus}
            tapOpens={tapOpens}
          />
        )}

        {win(NOTE_ID).open && <NoteWindow {...frame(NOTE_ID)} token={token} listId={focusListId ?? undefined} />}
      </div>

      {phase === "ready" && <Dock entries={dockEntries} onActivate={activate} stacked={!wide} reducedMotion={env.reducedMotion} magnify={draggable} />}

      {phase === "boot" && <BootScreen />}
    </div>
  );
}
