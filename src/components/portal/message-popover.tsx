"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Clear of the viewport edges, and the gap between the beak and its control. */
const MARGIN = 12;
const GAP = 10;
const WIDTH = 460;
const BEAK_W = 22;
const BEAK_H = 12;
/** Less room than this either side and an anchored panel is not worth it. */
const MIN_H = 220;
/** Below this the desktop itself stacks, and an anchored popover reads badly. */
const SHEET_MAX = 899;

interface Placement {
  left: number;
  top: number;
  width: number;
  /** The height to cap the panel at: never more room than the side has. */
  height: number;
  flipped: boolean;
  beakX: number;
  /** False when neither side has enough room to be worth anchoring. */
  fits: boolean;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Take the whole message wherever it fits: below the control by preference,
 * above when only that side can hold it, and otherwise the roomier of the
 * two, capped to the room that side actually has so a long message scrolls
 * inside only when the screen truly cannot hold it. The result is clamped
 * into the frame, and below a usable minimum the caller shows the centred
 * sheet instead. The beak keeps pointing at the control throughout.
 */
export function place(anchor: DOMRect, natural: number, vw: number, vh: number): Placement {
  const width = Math.min(WIDTH, vw - MARGIN * 2);
  const left = clamp(anchor.left + anchor.width / 2 - width / 2, MARGIN, Math.max(MARGIN, vw - MARGIN - width));
  // No arbitrary cap: the message should be read whole wherever it fits.
  const preferred = Math.ceil(natural);
  // The frame the panel has to live in, whatever the control is doing.
  const maxHeight = Math.max(0, vh - MARGIN * 2);
  // A control scrolled off either edge has a rect outside the viewport, so
  // pin the edges before measuring: otherwise the room reads as bigger than
  // the screen and the cap never bites.
  const startBelow = clamp(anchor.bottom + GAP, MARGIN, vh - MARGIN);
  const endAbove = clamp(anchor.top - GAP, MARGIN, vh - MARGIN);
  const roomBelow = Math.max(0, vh - MARGIN - startBelow);
  const roomAbove = Math.max(0, endAbove - MARGIN);

  let flipped: boolean;
  if (roomBelow >= preferred) flipped = false;
  else if (roomAbove >= preferred) flipped = true;
  else flipped = roomAbove > roomBelow;

  const room = flipped ? roomAbove : roomBelow;
  // Fitting the message whole is the preference, never the override.
  const height = Math.min(preferred, room, maxHeight);
  const wanted = flipped ? anchor.top - GAP - height : anchor.bottom + GAP;
  // The belt and braces: whatever the side gave us, stay inside the frame.
  const top = clamp(wanted, MARGIN, Math.max(MARGIN, vh - MARGIN - height));

  return {
    left,
    top,
    width,
    height,
    flipped,
    beakX: clamp(anchor.left + anchor.width / 2 - left, BEAK_W / 2 + 4, width - BEAK_W / 2 - 4),
    fits: room >= MIN_H,
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
  const barRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
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
    const body = bodyRef.current;
    if (!el || !body || !anchor) return;
    // The content's own height, not the capped panel's: measuring the panel
    // would feed its cap back in and it could never grow again.
    const natural = (barRef.current?.offsetHeight ?? 0) + body.scrollHeight + 4;
    const next = place(anchor.getBoundingClientRect(), natural, window.innerWidth, window.innerHeight);
    setPlacement((cur) =>
      cur &&
      cur.left === next.left &&
      cur.top === next.top &&
      cur.width === next.width &&
      cur.height === next.height &&
      cur.flipped === next.flipped &&
      cur.beakX === next.beakX &&
      cur.fits === next.fits
        ? cur
        : next
    );
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
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onMove);
    if (panelRef.current) ro?.observe(panelRef.current);
    if (bodyRef.current) ro?.observe(bodyRef.current);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      ro?.disconnect();
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

  const asSheet = sheet || (placement !== null && !placement.fits);

  // Focus moves in on open and back to the control on close. It waits for the
  // placement, because until then the panel is still hidden and cannot take it.
  const focused = useRef(false);
  const wasOpen = useRef(false);
  useEffect(() => {
    const ready = open && (asSheet || placement !== null);
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
  }, [open, asSheet, placement, anchor]);

  if (!open || typeof document === "undefined") return null;

  const style: React.CSSProperties = asSheet
    ? {}
    : {
        left: placement?.left ?? 0,
        top: placement?.top ?? 0,
        width: placement?.width ?? WIDTH,
        maxHeight: placement?.height,
        visibility: placement ? "visible" : "hidden",
      };

  const body = (
    <div
      ref={panelRef}
      className={[
        "portal-pop",
        asSheet ? "portal-pop-sheet" : "portal-pop-anchored",
        !asSheet && placement?.flipped ? "portal-pop-flipped" : "",
        reduced ? "" : "portal-pop-in",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      role="dialog"
      aria-modal={asSheet}
      aria-label={title}
    >
      {!asSheet && placement && (
        /* The beak and the panel are one shape: the flat band at the beak's
           base paints over the panel's own border for exactly its 2px, then
           the two walls carry on, so there is no seam to see. Each direction
           is drawn outright rather than mirrored, which would land the band
           off the border by a fraction. */
        <svg
          className="portal-pop-beak"
          width={BEAK_W}
          height={BEAK_H}
          viewBox={`0 0 ${BEAK_W} ${BEAK_H}`}
          style={{ left: placement.beakX - BEAK_W / 2 }}
          aria-hidden="true"
        >
          {placement.flipped ? (
            <>
              <path d="M1 1 11 11.2 21 1" fill="#fafffd" stroke="#151919" strokeWidth="2" strokeLinejoin="round" />
              <rect x="2.4" y="-1" width="17.2" height="3" fill="#fafffd" />
            </>
          ) : (
            <>
              <path d={`M1 ${BEAK_H - 1} 11 ${BEAK_H - 11.2} 21 ${BEAK_H - 1}`} fill="#fafffd" stroke="#151919" strokeWidth="2" strokeLinejoin="round" />
              <rect x="2.4" y={BEAK_H - 2} width="17.2" height="3" fill="#fafffd" />
            </>
          )}
        </svg>
      )}
      <div ref={barRef} className="portal-pop-bar">
        <button ref={closeRef} type="button" className="portal-pop-x" onClick={onClose} aria-label={`Close ${title}`}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>
        <span className="portal-pop-title">{title}</span>
      </div>
      <div ref={bodyRef} className="portal-pop-body">
        {children}
      </div>
    </div>
  );

  return createPortal(
    asSheet ? (
      <div className="portal-pop-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
        {body}
      </div>
    ) : (
      body
    ),
    document.body
  );
}
