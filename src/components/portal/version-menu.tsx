"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { shortDate } from "./format";

export interface VersionOption {
  id: string;
  number: number;
  label: string;
  sentAtMs: number;
}

interface Props {
  /** Newest first. */
  versions: VersionOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}

/**
 * Frame.io-style version control: a small "v3" chip after the deliverable
 * title that opens a capsule menu (the brand's vibrancy context-menu look)
 * listing every version, newest first. Portaled to body, positioned under
 * the chip and clamped to the viewport; Escape closes, arrows move, Enter
 * selects, an outside mousedown closes. Renders nothing for one version.
 */
export function VersionMenu({ versions, selectedId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [active, setActive] = useState(0);
  const chipRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const enabled = versions.length > 1;
  const selected = versions.find((v) => v.id === selectedId) ?? versions[0];

  function close(refocus = false) {
    setOpen(false);
    setPos(null);
    if (refocus) chipRef.current?.focus();
  }

  function toggle() {
    if (open) return close();
    setActive(Math.max(0, versions.findIndex((v) => v.id === selectedId)));
    setOpen(true);
  }

  // Place the menu under the chip once it has a size, clamped to the viewport.
  useLayoutEffect(() => {
    if (!open) return;
    const chip = chipRef.current;
    const menu = menuRef.current;
    if (!chip || !menu) return;
    const r = chip.getBoundingClientRect();
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    let left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    left = Math.round(left);
    top = Math.round(top);
    setPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || chipRef.current?.contains(t)) return;
      close();
    }
    function onAway() {
      close();
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onAway);
    window.addEventListener("scroll", onAway, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onAway);
      window.removeEventListener("scroll", onAway, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !pos) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitemradio']");
    items?.[active]?.focus();
  }, [open, pos, active]);

  if (!enabled) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % versions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + versions.length) % versions.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(versions.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const v = versions[active];
      if (v) {
        onSelect(v.id);
        close(true);
      }
    } else if (e.key === "Tab") {
      close();
    }
  }

  return (
    <>
      <button
        ref={chipRef}
        type="button"
        className="portal-vchip"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Version ${selected.number} of ${versions.length}, choose a version`}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <span className="portal-vchip-label">v{selected.number}</span>
        <svg className="portal-vchip-chev" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M2.5 4.5l3.5 3.5 3.5-3.5" />
        </svg>
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className="cmx-menu cmx-pop portal-vmenu"
            role="menu"
            aria-label="Versions"
            style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
            onKeyDown={onKeyDown}
          >
            <div className="cmx-mcap">Versions</div>
            {versions.map((v, i) => {
              const isSel = v.id === selectedId;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSel}
                  tabIndex={i === active ? 0 : -1}
                  className={`cmx-cap${isSel ? " portal-vmenu-selected" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    onSelect(v.id);
                    close(true);
                  }}
                >
                  <span className={`cmx-chip${isSel ? " green" : ""}`}>v{v.number}</span>
                  <span className="cmx-label">{v.label}</span>
                  <span className="portal-vmenu-date">{shortDate(v.sentAtMs)}</span>
                  <span className="portal-vmenu-check" aria-hidden="true">
                    {isSel && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2.5 7.5l3 3 6-6.5" />
                      </svg>
                    )}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
