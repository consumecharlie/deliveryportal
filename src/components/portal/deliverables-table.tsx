"use client";

import { useMemo, useState } from "react";
import type { PortalDeliverable, PortalVersion } from "@/lib/portal-page-model";
import { renderPortalBody } from "@/lib/portal-render";
import { sendPortalView } from "@/lib/portal-view-beacon";
import { ConfirmButton, confirmButtonKey } from "./confirm-button";
import { StatusPill } from "./status-pill";
import { ViewLink } from "./view-link";
import { shortDate } from "./format";

interface Props {
  token: string;
  deliverables: PortalDeliverable[];
  /** Project page: every row starts expanded so all versions are listed. */
  defaultOpen?: boolean;
}

function LinkButtons({ token, version, small }: { token: string; version: PortalVersion; small?: boolean }) {
  if (version.links.length === 0) return <span className="portal-muted">&ndash;</span>;
  return (
    <span className="portal-links">
      {version.links.map((l) => (
        <ViewLink
          key={`${l.label}:${l.url}`}
          token={token}
          deliveryId={version.deliveryId}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`portal-btn portal-btn-secondary${small ? " portal-btn-sm" : ""}`}
        >
          {l.label}
        </ViewLink>
      ))}
    </span>
  );
}

function Row({ token, d, defaultOpen }: { token: string; d: PortalDeliverable; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const html = useMemo(() => renderPortalBody(d.latest.body), [d.latest.body]);
  const panelId = `d-${d.latest.deliveryId}-details`;
  const { review } = d;
  const actionable = review.state === "awaiting" || review.state === "due-today" || review.state === "overdue";
  const showConfirm = actionable || (review.state === "confirmed" && review.canUndo);
  const dueNote =
    review.state === "awaiting" || review.state === "overdue" ? review.label : null;

  function toggle() {
    if (!open) sendPortalView(token, d.latest.deliveryId);
    setOpen((o) => !o);
  }

  return (
    <li id={`d-${d.latest.deliveryId}`} className={`portal-tr${open ? " portal-tr-open" : ""}`}>
      <div className="portal-row">
        <div className="portal-td portal-td-title">
          <span className="portal-row-title">{d.title}</span>
          {(d.variant || d.history.length > 0) && (
            <span className="portal-row-variant">
              {[d.variant, d.history.length > 0 ? `version ${d.history.length + 1} of ${d.history.length + 1}` : null]
                .filter(Boolean)
                .join(", ")}
            </span>
          )}
        </div>
        <div className="portal-td portal-td-shared">
          <span className="portal-td-label">Shared</span>
          <span>{shortDate(d.latest.sentAtMs)}</span>
        </div>
        <div className="portal-td portal-td-links">
          <LinkButtons token={token} version={d.latest} />
        </div>
        <div className="portal-td portal-td-status">
          <StatusPill state={review.state} label={review.label} />
          {dueNote && <span className="portal-due-note">{dueNote}</span>}
        </div>
        <div className="portal-td portal-td-toggle">
          <button
            type="button"
            className="portal-disclosure-btn"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={toggle}
          >
            <span className={`portal-chevron${open ? " portal-chevron-open" : ""}`} aria-hidden="true" />
            Details
          </button>
        </div>
      </div>

      <div id={panelId} className={`portal-expand${open ? " portal-expand-open" : ""}`} inert={!open}>
        <div className="portal-expand-inner">
          <div className="portal-details">
            {d.latest.body && (
              <div className="portal-details-block">
                <h4 className="portal-details-h">The message we sent</h4>
                <div className="portal-body" dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            )}

            {d.history.length > 0 && (
              <div className="portal-details-block">
                <h4 className="portal-details-h">Earlier versions</h4>
                <ul className="portal-versions">
                  {d.history.map((v) => (
                    <li key={v.deliveryId} id={`d-${v.deliveryId}`} className="portal-version">
                      <span className="portal-version-label">{v.label}</span>
                      <span className="portal-version-date">{shortDate(v.sentAtMs)}</span>
                      <LinkButtons token={token} version={v} small />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {showConfirm && (
              <div className="portal-details-block portal-details-confirm">
                <ConfirmButton
                  key={confirmButtonKey(d.latest.deliveryId, {
                    kind: review.state,
                    confirmedAt: review.confirmedAtMs ? new Date(review.confirmedAtMs) : null,
                  })}
                  token={token}
                  deliveryId={d.latest.deliveryId}
                  initialConfirmed={review.state === "confirmed"}
                  canUndo={review.canUndo}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export function DeliverablesTable({ token, deliverables, defaultOpen = false }: Props) {
  if (deliverables.length === 0) {
    return <p className="portal-quiet">Nothing has been shared for this project yet.</p>;
  }
  return (
    <div className="portal-table">
      <div className="portal-thead" aria-hidden="true">
        <span className="portal-th portal-td-title">Deliverable</span>
        <span className="portal-th portal-td-shared">Shared</span>
        <span className="portal-th portal-td-links">Links</span>
        <span className="portal-th portal-td-status">Status</span>
        <span className="portal-th portal-td-toggle" />
      </div>
      <ul className="portal-tbody">
        {deliverables.map((d) => (
          <Row key={d.key} token={token} d={d} defaultOpen={defaultOpen} />
        ))}
      </ul>
    </div>
  );
}
