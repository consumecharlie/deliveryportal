"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { menuClock } from "./format";

interface Props {
  clientName: string;
  /** The client's wordmark, uploaded in Settings; the name stands in without one. */
  clientLogoUrl?: string | null;
  /** Project page: the lockup links back to the client desktop and the project name follows. */
  crumb?: { href: string; projectName: string };
  noteOpen: boolean;
  onNote: () => void;
  onTidy: () => void;
}

/**
 * The client lockup, as on the Motion Studio share page (MOGRT `ClientBrand`):
 * the client's wordmark as-is (30px tall, 240px max), else the client name in
 * EightiesComeback, with the tiny pixel caption CLIENT PORTAL directly under.
 */
function ClientLockup({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  return (
    <span className="portal-lockup-text">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- the client's uploaded wordmark
        <img src={logoUrl} alt={name} className="portal-lockup-logo" draggable={false} referrerPolicy="no-referrer" />
      ) : (
        <span className="portal-lockup-name">{name}</span>
      )}
      <span className="portal-lockup-sub">Client portal</span>
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

export function MenuBar({ clientName, clientLogoUrl, crumb, noteOpen, onNote, onTidy }: Props) {
  const lockup = <ClientLockup name={clientName} logoUrl={clientLogoUrl} />;
  return (
    <header className="portal-menu" role="banner">
      <div className="portal-menu-left">
        {crumb ? (
          <nav aria-label="Breadcrumb" className="portal-menu-crumb">
            <Link href={crumb.href} className="portal-lockup portal-lockup-link" title="Back to all projects">
              {lockup}
            </Link>
            <span className="portal-menu-crumb-sep" aria-hidden="true">
              /
            </span>
            <span className="portal-menu-project" title={crumb.projectName}>
              {crumb.projectName}
            </span>
          </nav>
        ) : (
          <div className="portal-lockup">{lockup}</div>
        )}
      </div>
      <div className="portal-menu-right">
        <span className="portal-menu-powered">Powered by Consume Media</span>
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
