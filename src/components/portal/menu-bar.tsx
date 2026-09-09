"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { menuClock } from "./format";

interface Props {
  clientName: string;
  /** The client's own logo when we have one. */
  clientLogoUrl?: string | null;
  /** The client's web domain: a favicon stands in for a missing logo. */
  clientDomain?: string | null;
  /** Project page: the name links back to the client desktop and the project name follows. */
  crumb?: { href: string; projectName: string };
  noteOpen: boolean;
  onNote: () => void;
  onTidy: () => void;
}

/**
 * The client lockup (the MOGRT Library client-portal header): a 28px logo on
 * a white tile, the client name in EightiesComeback over CLIENT PORTAL in
 * pixel caps. Logo, else the domain's favicon, else a monogram tile.
 */
function ClientLogo({ name, logoUrl, domain }: { name: string; logoUrl?: string | null; domain?: string | null }) {
  const [failed, setFailed] = useState(false);
  const src = logoUrl || (domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128` : null);
  if (src && !failed) {
    return (
      <span className="portal-lockup-tile">
        {/* eslint-disable-next-line @next/next/no-img-element -- client-provided logo or favicon */}
        <img src={src} alt="" width={28} height={28} draggable={false} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      </span>
    );
  }
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "";
  return (
    <span className="portal-lockup-tile portal-lockup-monogram" aria-hidden="true">
      {initial}
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

export function MenuBar({ clientName, clientLogoUrl, clientDomain, crumb, noteOpen, onNote, onTidy }: Props) {
  const lockup = (
    <>
      <ClientLogo name={clientName} logoUrl={clientLogoUrl} domain={clientDomain} />
      <span className="portal-lockup-text">
        <span className="portal-lockup-name">{clientName}</span>
        <span className="portal-lockup-sub">Client portal</span>
      </span>
    </>
  );
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
