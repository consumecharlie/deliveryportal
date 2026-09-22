"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Clear of the viewport edges, and the gap between the beak and its control. */
const MARGIN = 12;
const GAP = 10;
const WIDTH = 460;
const BEAK_W = 22;
/** Below this the desktop itself stacks, and an anchored popover reads badly. */
const SHEET_MAX = 899;

interface Placement {
  left: number;
  top: number;
  width: number;
  flipped: boolean;
  beakX: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Prefer below the control, flip above when there is no room, and clamp
 * horizontally so the popover never leaves the frame. The beak keeps
 * pointing at the control through either.
 */
export function place(anchor: DOMRect, height: number, vw: number, vh: number): Placement {
  const width = Math.min(WIDTH, vw - MARGIN * 2);
  const left = clamp(anchor.left + anchor.width / 2 - width / 2, MARGIN, Math.max(MARGIN, vw - MARGIN - width));
  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - height;
  const fitsBelow = below + height <= vh - MARGIN;
  const flipped = !fitsBelow && above >= MARGIN;
  const top = fitsBelow ? below : flipped ? above : clamp(vh - MARGIN - height, MARGIN, Math.max(MARGIN, vh - MARGIN - height));
  return {
    left,
    top,
    width,
    flipped,
    beakX: clamp(anchor.left + anchor.width / 2 - left, BEAK_W / 2 + 4, width - BEAK_W / 2 - 4),
  };
}

interface Props {
  open: boolean;
  /** The control the popover belongs to; it anchors there and focus returns to it. */
  anchor: HTMLElement | null;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * The delivery message as an anchored popover rather than an inline panel:
 * it floats over the page from a portal, so opening and closing never move
 * the table or the window underneath. Below the stacked breakpoint the same
 * content becomes a centred sheet.
 */
export function MessagePopover({ open, anchor, title, onClose, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [sheet, setSheet] = useState(false);
  const [reduced, setReduced] = useState(false);

  useLayoutEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only media state, read before paint
    setSheet(window.matchMedia(`(max-width: ${SHEET_MAX}px)`).matches);
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, [open]);

  const reposition = useCallback(() => {
    const el = panelRef.current;
    if (!el || !anchor) return;
    // Measure the panel's natural height before placing it.
    setPlacement(place(anchor.getBoundingClientRect(), el.offsetHeight, window.innerWidth, window.innerHeight));
  }, [anchor]);

  // Place before paint, so the popover never shows in the wrong spot.
  useLayoutEffect(() => {
    if (!open || sheet) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the measured placement
      setPlacement(null);
      return;
    }
    // Measured placement has to land before paint or the popover flashes in
    // the wrong spot.
    reposition();
  }, [open, sheet, reposition]);

  // Stay pinned to the row: follow scrolling and resizing instead of closing.
  useEffect(() => {
    if (!open || sheet) return;
    let frame = 0;
    const onMove = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        reposition();
      });
    };
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, sheet, reposition]);

  // Escape, and a press anywhere outside the popover or its control.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    function onDown(e: PointerEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, anchor, onClose]);

  // Focus moves in on open and back to the control on close. It waits for the
  // placement, because until then the panel is still hidden and cannot take it.
  const focused = useRef(false);
  const wasOpen = useRef(false);
  useEffect(() => {
    const ready = open && (sheet || placement !== null);
    if (ready && !focused.current) {
      closeRef.current?.focus();
      focused.current = true;
    }
    if (!open) {
      // Only take focus back if nothing else has claimed it: pressing another
      // row's control closes this popover and opens that one, and that one
      // should keep the focus it just took.
      const loose = document.activeElement === null || document.activeElement === document.body;
      if (wasOpen.current && loose) anchor?.focus();
      focused.current = false;
    }
    wasOpen.current = open;
  }, [open, sheet, placement, anchor]);

  if (!open || typeof document === "undefined") return null;

  const style: React.CSSProperties = sheet
    ? {}
    : {
        left: placement?.left ?? 0,
        top: placement?.top ?? 0,
        width: placement?.width ?? WIDTH,
        visibility: placement ? "visible" : "hidden",
      };

  const body = (
    <div
      ref={panelRef}
      className={[
        "portal-pop",
        sheet ? "portal-pop-sheet" : "portal-pop-anchored",
        placement?.flipped ? "portal-pop-flipped" : "",
        reduced ? "" : "portal-pop-in",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      role="dialog"
      aria-modal={sheet}
      aria-label={title}
    >
      {!sheet && placement && (
        <svg className="portal-pop-beak" width={BEAK_W} height="12" viewBox="0 0 22 12" style={{ left: placement.beakX - BEAK_W / 2 }} aria-hidden="true">
          <path d="M1 11.5 11 1.6 21 11.5" fill="#fafffd" stroke="#151919" strokeWidth="2" strokeLinejoin="round" />
          {/* Breaks the popover's own border under the beak, so the two join. */}
          <rect x="2.6" y="10.2" width="16.8" height="3" fill="#fafffd" />
        </svg>
      )}
      <div className="portal-pop-bar">
        <button ref={closeRef} type="button" className="portal-pop-x" onClick={onClose} aria-label={`Close ${title}`}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>
        <span className="portal-pop-title">{title}</span>
      </div>
      <div className="portal-pop-body">{children}</div>
    </div>
  );

  return createPortal(
    sheet ? (
      <div className="portal-pop-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
        {body}
      </div>
    ) : (
      body
    ),
    document.body
  );
}
