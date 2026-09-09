"use client";

import type { PortalLink } from "@/lib/portal-page-model";
import { ViewLink } from "./view-link";
import { LinkIcon } from "./link-icon";
import { linkHint, linkKind } from "./link-meta";

interface Props {
  token: string;
  deliveryId: string;
  link: PortalLink;
  small?: boolean;
}

/**
 * A quiet rounded-rectangle link button: a kind icon, the link's label, and
 * the host hint on a smaller second line unless it would repeat the label.
 */
export function LinkButton({ token, deliveryId, link, small = false }: Props) {
  const kind = linkKind(link);
  const hint = linkHint(link);
  const showHint = hint.trim().toLowerCase() !== link.label.trim().toLowerCase();
  return (
    <ViewLink
      token={token}
      deliveryId={deliveryId}
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`portal-btn portal-btn-secondary portal-linkbtn${small ? " portal-btn-sm" : ""}${showHint ? "" : " portal-linkbtn-single"}`}
    >
      <LinkIcon kind={kind} className="portal-linkbtn-icon" />
      <span className="portal-linkbtn-text">
        <span className="portal-linkbtn-label">{link.label}</span>
        {showHint && <span className="portal-linkbtn-hint">{hint}</span>}
      </span>
    </ViewLink>
  );
}

export function LinkButtons({ token, deliveryId, links, small }: { token: string; deliveryId: string; links: PortalLink[]; small?: boolean }) {
  if (links.length === 0) return <span className="portal-muted">&ndash;</span>;
  return (
    <span className="portal-links">
      {links.map((l) => (
        <LinkButton key={`${l.label}:${l.url}`} token={token} deliveryId={deliveryId} link={l} small={small} />
      ))}
    </span>
  );
}

const OPEN_MAX = 26;

/** "Open Final Post Script" when it fits 26 characters, else "Open review". */
export function openReviewLabel(link: PortalLink | null): string {
  if (!link || !link.label) return "Open review";
  const text = `Open ${link.label}`;
  return text.length <= OPEN_MAX ? text : "Open review";
}
