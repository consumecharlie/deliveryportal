"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PacMark } from "./pac-mark";
import { menuClock } from "./format";

interface Props {
  clientName: string;
  /** Project page: a breadcrumb back to the client desktop, then the project name. */
  crumb?: { href: string; projectName: string };
  noteOpen: boolean;
  onNote: () => void;
  onTidy: () => void;
}

/**
 * "Consume OS" in the CharlieOS lockup style: a rounded sans wordmark and
 * the "OS" in green pixel blocks (the OS glyph is the exact path from
 * brand-assets/CharlieOS.svg).
 */
function ConsumeOsMark() {
  return (
    <span className="portal-os-mark" aria-label="Consume OS">
      <span className="portal-os-word" aria-hidden="true">
        Consume
      </span>
      <svg className="portal-os-glyph" viewBox="141 15 51 30" aria-hidden="true" focusable="false">
        <path
          d="M141 18.018H143.998V15.0201H161.986V18.018H164.984V42.002H161.986V45H143.998V42.002H141V18.018ZM146.996 39.004H158.988V21.016H146.996V39.004ZM167.994 18.018H170.992V15.0201H188.98V18.018H191.978V24.014H185.982V21.016H173.99V27.012H188.98V30.01H191.978V42.002H188.98V45H170.992V42.002H167.994V36.006H173.99V39.004H185.982V33.008H170.992V30.01H167.994V18.018Z"
          fill="#6AC387"
        />
      </svg>
    </span>
  );
}

function Clock() {
  const [text, setText] = useState<string>("");
  useEffect(() => {
    let timer: number | undefined;
    function tick() {
      setText(menuClock());
      // Re-align to the next minute boundary so the display never lags.
      const ms = 60_000 - (Date.now() % 60_000) + 50;
      timer = window.setTimeout(tick, ms);
    }
    tick();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);
  return (
    <time className="portal-menu-clock" aria-live="off" suppressHydrationWarning>
      {text}
    </time>
  );
}

export function MenuBar({ clientName, crumb, noteOpen, onNote, onTidy }: Props) {
  return (
    <header className="portal-menu" role="banner">
      <div className="portal-menu-left">
        <PacMark size={16} color="#DBEF00" className="portal-menu-pac" />
        <ConsumeOsMark />
        <span className="portal-menu-sep" aria-hidden="true" />
        {crumb ? (
          <nav aria-label="Breadcrumb" className="portal-menu-crumb">
            <Link href={crumb.href} className="portal-menu-client portal-menu-client-link">
              {clientName}
            </Link>
            <span className="portal-menu-crumb-sep" aria-hidden="true">
              /
            </span>
            <span className="portal-menu-client portal-menu-project" title={crumb.projectName}>
              {crumb.projectName}
            </span>
          </nav>
        ) : (
          <span className="portal-menu-client">{clientName}</span>
        )}
      </div>
      <div className="portal-menu-right">
        <button type="button" className="portal-menu-item portal-menu-tidy" onClick={onTidy}>
          Tidy up
        </button>
        <button type="button" className="portal-menu-item" aria-pressed={noteOpen} onClick={onNote}>
          Send us a note
        </button>
        <Clock />
      </div>
    </header>
  );
}
