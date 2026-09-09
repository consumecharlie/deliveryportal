"use client";

import { useEffect, useState } from "react";
import { FolderIcon } from "./folder-icon";

export type DockIcon = "review" | "upnext" | "finder" | "archive" | "note" | "project";
export type DockState = "open" | "minimized" | "closed";

export interface DockEntry {
  id: string;
  label: string;
  icon: DockIcon;
  state: DockState;
}

interface Props {
  entries: DockEntry[];
  onActivate: (id: string) => void;
  /** Phones: a full-width row of the app icons only. */
  stacked: boolean;
  reducedMotion: boolean;
}

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
export function Dock({ entries, onActivate, stacked, reducedMotion }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const [popId, setPopId] = useState<string | null>(null);

  useEffect(() => {
    if (!popId) return;
    const t = window.setTimeout(() => setPopId(null), 220);
    return () => window.clearTimeout(t);
  }, [popId]);

  const shown = stacked ? entries.filter((e) => e.icon !== "project") : entries;

  return (
    <nav className={`portal-dock${stacked ? " portal-dock-stacked" : ""}`} aria-label="Windows">
      <div className="portal-dock-bar" onMouseLeave={() => setHover(null)}>
        {shown.map((e) => (
          <button
            key={e.id}
            type="button"
            className={`portal-dock-item${popId === e.id && !reducedMotion ? " portal-dock-item-pop" : ""}`}
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
            {e.icon === "project" ? (
              <FolderIcon variant="full" open width={30} className="portal-dock-folder" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- static brand badge icon
              <img src={ICON_SRC[e.icon]} alt="" width={30} height={30} draggable={false} className="portal-dock-icon" />
            )}
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
