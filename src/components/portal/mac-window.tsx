"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * The window chrome from the sign-in art (`PoweringUpWindow`), rebuilt in
 * CSS so it can hold real content: a 30px #151919 title bar with three hollow
 * traffic lights, a 1px #F4FBF6 outline with 4.5px top corners, a stacked
 * back outline 6px right and down, and a #FAFFFD body.
 *
 * The window is a dumb view: position, size, z-order and open state live in
 * the desktop's window manager. Dragging by the title bar writes the element's
 * left/top directly while the pointer is down and commits once on release.
 */
export interface MacWindowProps {
  id: string;
  title: string;
  children: React.ReactNode;
  /** Absolute position on the desktop canvas; null when the window flows (mobile). */
  x: number | null;
  y: number | null;
  width: number | null;
  zIndex: number;
  minimized: boolean;
  zoomed: boolean;
  canClose: boolean;
  /** Drag by the title bar (desktop, fine pointer, motion allowed). */
  draggable: boolean;
  /** Reading-order index for the staggered entrance pop; null renders without a pop. */
  popIndex: number | null;
  /** Top of the z-order: gets the stronger shadow. */
  isTop?: boolean;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
  onZoom: (id: string) => void;
  onRaise: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onMeasure: (id: string, height: number) => void;
  /** The drag surface to clamp against. */
  getBounds: () => { width: number; height: number } | null;
  className?: string;
  /** Optional accessible name when the title is decorative (e.g. truncated). */
  ariaLabel?: string;
}

const BAR_HEIGHT = 30;
const REACH = 80;

export function MacWindow(props: MacWindowProps) {
  const {
    id,
    title,
    children,
    x,
    y,
    width,
    zIndex,
    minimized,
    zoomed,
    canClose,
    draggable,
    popIndex,
    isTop = false,
    onClose,
    onMinimize,
    onZoom,
    onRaise,
    onMove,
    onMeasure,
    getBounds,
    className,
    ariaLabel,
  } = props;
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<{ startX: number; startY: number; x: number; y: number; moved: boolean } | null>(null);

  // Report height on every render and whenever the content reflows (a table
  // row expanding), so the desktop can place the Finder and size the canvas.
  // Both paths read offsetHeight after layout has settled: the layout effect
  // runs before paint, so the canvas never shows a frame of the old height.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) onMeasure(id, el.offsetHeight);
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => onMeasure(id, el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, onMeasure]);

  function onBarPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    onRaise(id);
    if (!draggable || e.button !== 0 || x === null || y === null) return;
    if ((e.target as HTMLElement).closest(".portal-tl")) return;
    e.preventDefault();
    drag.current = { startX: e.clientX, startY: e.clientY, x, y, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer: no capture available */
    }
    ref.current?.setAttribute("data-dragging", "1");
  }

  function onBarPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const bounds = getBounds();
    const w = el.offsetWidth;
    let nx = d.x + (e.clientX - d.startX);
    let ny = d.y + (e.clientY - d.startY);
    if (bounds) {
      // Clamp only so the title bar stays reachable: 80px of it must remain inside.
      nx = Math.max(-(w - REACH), Math.min(bounds.width - REACH, nx));
      ny = Math.max(0, Math.min(Math.max(0, bounds.height - BAR_HEIGHT), ny));
    }
    d.moved = true;
    el.style.left = `${Math.round(nx)}px`;
    el.style.top = `${Math.round(ny)}px`;
  }

  function onBarPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const el = ref.current;
    drag.current = null;
    el?.removeAttribute("data-dragging");
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (!d || !el || !d.moved) return;
    onMove(id, parseInt(el.style.left, 10) || 0, parseInt(el.style.top, 10) || 0);
  }

  const positioned = x !== null && y !== null;
  const style: React.CSSProperties & Record<`--${string}`, string | number> = positioned
    ? { left: x, top: y, width: width ?? undefined, zIndex }
    : { zIndex };
  if (popIndex !== null) style["--pop-i"] = popIndex;

  const cls = [
    "portal-window",
    positioned ? "portal-window-abs" : "portal-window-flow",
    minimized ? "portal-window-min" : "",
    zoomed ? "portal-window-zoomed" : "",
    popIndex !== null ? "portal-window-pop" : "",
    draggable ? "portal-window-draggable" : "",
    isTop ? "portal-window-top" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      ref={ref}
      className={cls}
      style={style}
      aria-label={ariaLabel ?? title}
      data-window={id}
      onPointerDownCapture={() => onRaise(id)}
    >
      <div
        className="portal-window-bar"
        onPointerDown={onBarPointerDown}
        onPointerMove={onBarPointerMove}
        onPointerUp={onBarPointerUp}
        onPointerCancel={onBarPointerUp}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest(".portal-tl")) return;
          onMinimize(id);
        }}
      >
        <div className="portal-tls" role="group" aria-label="Window controls">
          <button
            type="button"
            className="portal-tl portal-tl-close"
            aria-label={canClose ? "Close window" : "This window stays open"}
            aria-disabled={!canClose}
            tabIndex={canClose ? 0 : -1}
            onClick={() => canClose && onClose(id)}
          >
            <svg viewBox="0 0 13 13" aria-hidden="true">
              <line x1="3.5" y1="3.5" x2="9.5" y2="9.5" stroke="#4A0000" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="9.5" y1="3.5" x2="3.5" y2="9.5" stroke="#4A0000" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="portal-tl portal-tl-min"
            aria-label={minimized ? "Expand window" : "Minimize window"}
            aria-pressed={minimized}
            onClick={() => onMinimize(id)}
          >
            <svg viewBox="0 0 13 13" aria-hidden="true">
              <line x1="2.5" y1="6.5" x2="10.5" y2="6.5" stroke="#9A6C00" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="portal-tl portal-tl-zoom"
            aria-label={zoomed ? "Restore window size" : "Zoom window to full width"}
            aria-pressed={zoomed}
            onClick={() => onZoom(id)}
          >
            <svg viewBox="0 0 13 13" aria-hidden="true">
              <polyline points="2.5,3.5 2.5,9.5 8.5,9.5" fill="none" stroke="#006500" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="10.5,9.5 10.5,3.5 4.5,3.5" fill="none" stroke="#006500" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <h2 className="portal-window-title" title={title}>
          {title}
        </h2>
      </div>
      <div className="portal-window-body" hidden={minimized}>
        {children}
      </div>
    </section>
  );
}

/** Everything the desktop's window manager supplies; a window adds its id, title and body. */
export type WindowFrameProps = Omit<MacWindowProps, "id" | "title" | "children" | "canClose" | "className" | "ariaLabel">;
