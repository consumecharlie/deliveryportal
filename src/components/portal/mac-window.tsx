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
  /** Focus mode: the window is centred over the scrim as the thing being worked on. */
  focused?: boolean;
  /** Animate the move in and out of focus (off under reduced motion). */
  focusAnimate?: boolean;
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
    focused = false,
    focusAnimate = true,
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
  const focusedRef = useRef(focused);
  /** The rect from the last commit, which is the start rect of a focus move. */
  const lastRect = useRef<DOMRect | null>(null);
  const wasFocused = useRef(focused);

  // Report height on every render and whenever the content reflows (a table
  // row expanding), so the desktop can place the Finder and size the canvas.
  // Both paths read offsetHeight after layout has settled: the layout effect
  // runs before paint, so the canvas never shows a frame of the old height.
  // A focused window is lifted out of the canvas and capped, so its height
  // says nothing about the space it needs on the desktop: keep the last
  // desktop height so the canvas does not resize under the scrim.
  useLayoutEffect(() => {
    focusedRef.current = focused;
    const el = ref.current;
    if (el && !focused) onMeasure(id, el.offsetHeight);
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!focusedRef.current) onMeasure(id, el.offsetHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, onMeasure]);

  /**
   * FLIP the move into and out of focus: the element jumps to its new place
   * in the same commit, then a transform puts it visually back where it was
   * and animates to identity, so the whole move is transform-only.
   */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const changed = wasFocused.current !== focused;
    wasFocused.current = focused;
    const start = lastRect.current;
    const end = el.getBoundingClientRect();
    lastRect.current = end;
    if (!changed || !start || !focusAnimate || end.width === 0) return;
    const dx = start.left - end.left;
    const dy = start.top - end.top;
    const scale = start.width / end.width;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(scale - 1) < 0.01) return;
    el.style.transformOrigin = "top left";
    el.style.transition = "none";
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    void el.offsetWidth;
    el.style.transition = "transform 260ms cubic-bezier(0.2, 0.7, 0.2, 1)";
    el.style.transform = "none";
    const clear = () => {
      el.style.transition = "";
      el.style.transform = "";
      el.style.transformOrigin = "";
      el.removeEventListener("transitionend", clear);
    };
    el.addEventListener("transitionend", clear);
  });

  function onBarPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    onRaise(id);
    if (!draggable || focused || e.button !== 0 || x === null || y === null) return;
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
  // Focused: position, size and z-order all come from the stylesheet.
  const style: React.CSSProperties & Record<`--${string}`, string | number> = focused
    ? {}
    : positioned
      ? { left: x, top: y, width: width ?? undefined, zIndex }
      : { zIndex };
  if (popIndex !== null) style["--pop-i"] = popIndex;

  const cls = [
    "portal-window",
    positioned ? "portal-window-abs" : "portal-window-flow",
    minimized ? "portal-window-min" : "",
    zoomed ? "portal-window-zoomed" : "",
    popIndex !== null ? "portal-window-pop" : "",
    draggable && !focused ? "portal-window-draggable" : "",
    isTop ? "portal-window-top" : "",
    focused ? "portal-window-focused" : "",
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
