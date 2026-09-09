"use client";

import { useEffect, useRef, useState } from "react";

export type DockIcon = "review" | "upnext" | "finder" | "archive" | "note" | "project";
export type DockState = "open" | "minimized" | "closed";

export interface DockEntry {
  id: string;
  label: string;
  icon: DockIcon;
  state: DockState;
}

/**
 * The project badge, built like public/icons/folder.svg: a dark offset
 * circle behind, the green disc with the dark 3.4px stroke, a white folder
 * pictogram. `index` adds a yellow numeric superscript when several project
 * windows share the dock.
 */
function ProjectBadge({ index, size }: { index: number | null; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 70 70" fill="none" aria-hidden="true" focusable="false" className="portal-dock-icon">
      <path d="M35.769 69.8345C54.583 69.8345 69.8347 54.5828 69.8347 35.7688C69.8347 16.9549 54.583 1.70312 35.769 1.70312C16.955 1.70312 1.70331 16.9549 1.70331 35.7688C1.70331 54.5828 16.955 69.8345 35.769 69.8345Z" fill="#151919" />
      <path d="M34.0657 66.4279C51.939 66.4279 66.4281 51.9388 66.4281 34.0655C66.4281 16.1923 51.939 1.70312 34.0657 1.70312C16.1925 1.70312 1.70331 16.1923 1.70331 34.0655C1.70331 51.9388 16.1925 66.4279 34.0657 66.4279Z" fill="#6AC387" stroke="#151919" strokeWidth="3.40657" />
      <path d="M20.4396 25.5488C19.5027 25.5488 18.7363 26.3153 18.7363 27.2521V44.285C18.7363 46.1671 20.2607 47.6915 22.1428 47.6915H47.6921C49.5742 47.6915 51.0987 46.1671 51.0987 44.285V28.9554C51.0987 27.0733 49.5742 25.5488 47.6921 25.5488H20.4396Z" fill="white" stroke="#151919" strokeWidth="3.40657" strokeLinejoin="round" />
      <path d="M17.0331 22.1422C17.0331 21.2054 17.7996 20.439 18.7364 20.439H28.9561C29.8929 20.439 30.6594 21.2054 30.6594 22.1422V27.2521H17.0331V22.1422Z" fill="#151919" />
      {index !== null && (
        <g>
          <circle cx="56" cy="14" r="11.5" fill="#DBEF00" stroke="#151919" strokeWidth="3" />
          <text x="56" y="18.5" textAnchor="middle" fontFamily="var(--font-pixel), monospace" fontSize="13" fill="#151919">
            {index}
          </text>
        </g>
      )}
    </svg>
  );
}

interface Props {
  entries: DockEntry[];
  onActivate: (id: string) => void;
  /** Phones: a full-width row of the app icons only. */
  stacked: boolean;
  reducedMotion: boolean;
  /** Fine pointer, motion allowed: macOS-style magnification on hover. */
  magnify: boolean;
}

const MAG_MAX = 0.6;
const MAG_REACH = 2.5;

const ICON_SRC: Record<Exclude<DockIcon, "project">, string> = {
  review: "/icons/bell-notification.svg",
  upnext: "/icons/calendar.svg",
  finder: "/icons/folder.svg",
  archive: "/icons/book.svg",
  note: "/icons/pencil.svg",
};

/**
 * The floating capsule dock (the MOGRT Library's SlideDock look): one item per
 * application window plus one folder per project window opened this session.
 * A 4px dot under each icon: solid green open, hollow minimized, none closed.
 */
export function Dock({ entries, onActivate, stacked, reducedMotion, magnify }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const [popId, setPopId] = useState<string | null>(null);
  const [scales, setScales] = useState<Record<string, number>>({});
  const barRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Magnification: each item scales by its horizontal distance from the
  // cursor, a bell curve over 2.5 item widths. Layout widths never change;
  // only transforms, anchored at the bottom, so items overflow upward.
  function onPointerMove(e: React.PointerEvent) {
    if (!magnify || e.pointerType !== "mouse") return;
    const bar = barRef.current;
    if (!bar) return;
    const barLeft = bar.getBoundingClientRect().left;
    const next: Record<string, number> = {};
    for (const [id, el] of Object.entries(itemRefs.current)) {
      if (!el) continue;
      const w = el.offsetWidth;
      const center = barLeft + el.offsetLeft + w / 2;
      const d = Math.abs(e.clientX - center) / (MAG_REACH * w);
      next[id] = 1 + MAG_MAX * Math.max(0, 1 - d * d);
    }
    setScales(next);
  }

  useEffect(() => {
    if (!popId) return;
    const t = window.setTimeout(() => setPopId(null), 220);
    return () => window.clearTimeout(t);
  }, [popId]);

  const shown = stacked ? entries.filter((e) => e.icon !== "project") : entries;
  const projectIds = shown.filter((e) => e.icon === "project").map((e) => e.id);
  const ICON = 40;

  return (
    <nav className={`portal-dock${stacked ? " portal-dock-stacked" : ""}`} aria-label="Windows">
      <div
        ref={barRef}
        className={`portal-dock-bar${magnify ? " portal-dock-bar-magnify" : ""}`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setScales({})}
        onMouseLeave={() => setHover(null)}
      >
        {shown.map((e) => (
          <button
            key={e.id}
            ref={(el) => {
              itemRefs.current[e.id] = el;
            }}
            type="button"
            className={`portal-dock-item${popId === e.id && !reducedMotion ? " portal-dock-item-pop" : ""}`}
            style={magnify ? ({ "--dock-s": scales[e.id] ?? 1 } as React.CSSProperties) : undefined}
            data-state={e.state}
            aria-label={`${e.label}${e.state === "open" ? ", open" : e.state === "minimized" ? ", minimized" : ""}`}
            onMouseEnter={() => setHover(e.id)}
            onFocus={() => setHover(e.id)}
            onBlur={() => setHover(null)}
            onClick={() => {
              if (e.state !== "open") setPopId(e.id);
              onActivate(e.id);
            }}
          >
            <span className="portal-dock-ring">
              {e.icon === "project" ? (
                <ProjectBadge index={projectIds.length > 1 ? projectIds.indexOf(e.id) + 1 : null} size={ICON} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- static brand badge icon
                <img src={ICON_SRC[e.icon]} alt="" width={ICON} height={ICON} draggable={false} className="portal-dock-icon" />
              )}
            </span>
            <span className="portal-dock-dot" aria-hidden="true" />
            {hover === e.id && !stacked && (
              <span className="portal-dock-tip" role="tooltip">
                {e.label}
              </span>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
