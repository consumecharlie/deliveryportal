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

const PAD = 24;
const GAP = 24;
const ROW_GAP = 36;
const CASCADE = 24;
const BOTTOM_STRIP = 132;
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

  function defaultOpen(id: string): boolean {
    if (id === REVIEW_ID) return true;
    if (id === UPNEXT_ID || id === FINDER_ID) return !focusMode;
    if (id === ARCHIVE_ID || id === NOTE_ID) return false;
    return true;
  }
  function win(id: string): WinState {
    return { open: defaultOpen(id), minimized: false, zoomed: false, x: null, y: null, ...state.windows[id] };
  }

  const order = mergeOrder(state.order, defaultOrder);
  const zOf = (id: string) => (id === REVIEW_ID ? 900 : 10 + order.indexOf(id));

  // Default layout on the canvas (desktop mode). Heights come from the windows
  // themselves, so the Finder sits under the taller of the two top windows and
  // the project cascade sits under the Finder.
  const W = (canvasW ?? 1280) - 2 * PAD;
  const h = (id: string) => (win(id).open ? heights[id] ?? 0 : 0);
  const reviewW = focusMode ? Math.min(W, 640) : Math.round((W - GAP) / 2);
  const upnextW = W - GAP - reviewW;
  const finderTop = PAD + (h(REVIEW_ID) > 0 ? h(REVIEW_ID) + GAP : 0);
  const leftBottom = focusMode ? PAD + h(REVIEW_ID) : finderTop + h(FINDER_ID);
  const rightBottom = focusMode ? 0 : PAD + h(UPNEXT_ID);
  const stageTop = Math.max(leftBottom, rightBottom) + ROW_GAP;
  const n = cascade.length;
  const noteW = Math.min(420, W);

  function defaults(id: string): Placement {
    if (id === REVIEW_ID) return { x: PAD, y: PAD, w: reviewW };
    if (id === UPNEXT_ID) return { x: PAD + reviewW + GAP, y: PAD, w: upnextW };
    if (id === FINDER_ID) return { x: PAD, y: finderTop, w: reviewW };
    if (id === ARCHIVE_ID) return { x: PAD + 48, y: stageTop + 48, w: Math.min(980, W - 48) };
    if (id === NOTE_ID) return { x: W + PAD - noteW, y: PAD + 40, w: noteW };
    const listId = listIdOfWindow(id);
    const i = Math.max(0, cascade.findIndex((p) => p.listId === listId));
    return { x: PAD + i * CASCADE, y: stageTop + i * CASCADE, w: W - (n - 1) * CASCADE };
  }

  function place(id: string): Placement {
    const s = win(id);
    const d = defaults(id);
    let x = s.x ?? d.x;
    let y = s.y ?? d.y;
    let w = d.w;
    if (s.zoomed) {
      x = PAD;
      w = W;
    }
    x = Math.max(0, Math.min((canvasW ?? W) - Math.min(w, 160), x));
    y = Math.max(0, y);
    return { x, y, w };
  }

  const openIds = [REVIEW_ID, ...order].filter((id) => win(id).open);
  let canvasH = 0;
  if (wide) {
    for (const id of openIds) {
      const p = place(id);
      canvasH = Math.max(canvasH, p.y + (heights[id] ?? 0));
    }
  }
  canvasH += BOTTOM_STRIP;

  // Reading order for the staggered entrance pop.
  const readingOrder = [REVIEW_ID, UPNEXT_ID, FINDER_ID, ...[...cascade].reverse().map((p) => projectWindowId(p.listId)), ARCHIVE_ID, NOTE_ID];
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
      if (id === REVIEW_ID) return;
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
    commit(() => EMPTY_STATE);
  }, [commit]);

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

      {phase === "boot" && <BootScreen />}
    </div>
  );
}
