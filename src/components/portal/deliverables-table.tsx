"use client";

import { useMemo, useState } from "react";
import type { PortalDeliverable } from "@/lib/portal-page-model";
import { renderPortalBody } from "@/lib/portal-render";
import { sendPortalView } from "@/lib/portal-view-beacon";
import { ConfirmButton, confirmButtonKey } from "./confirm-button";
import { StatusPill, pillNote } from "./status-pill";
import { LinkButtons } from "./link-button";
import { VersionMenu } from "./version-menu";
import { allVersions, reviewMode, versionNumber } from "./link-meta";
import { shortDate } from "./format";

interface Props {
  token: string;
  deliverables: PortalDeliverable[];
  /** Project page: every row starts expanded so all versions are listed. */
  defaultOpen?: boolean;
}

function Row({ token, d, defaultOpen }: { token: string; d: PortalDeliverable; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const versions = useMemo(() => allVersions(d), [d]);
  const [selectedId, setSelectedId] = useState(d.latest.deliveryId);
  const current = versions.find((v) => v.deliveryId === selectedId) ?? d.latest;
  const currentNumber = versionNumber(d, current);
  const isLatest = current.deliveryId === d.latest.deliveryId;
  const html = useMemo(() => renderPortalBody(current.body), [current.body]);
  const panelId = `d-${d.latest.deliveryId}-details`;
  const { review } = d;
  const actionable = review.state === "awaiting" || review.state === "due-today" || review.state === "overdue";
  const showConfirm = actionable || (review.state === "confirmed" && review.canUndo);
  const dueNote = pillNote(review.state, reviewMode(review, d.title, d.variant, d.latest.label), review.label);

  function toggle() {
    if (!open) sendPortalView(token, current.deliveryId);
    setOpen((o) => !o);
  }

  function select(id: string) {
    setSelectedId(id);
    if (open) sendPortalView(token, id);
  }

  return (
    <li id={`d-${d.latest.deliveryId}`} className={`portal-tr${open ? " portal-tr-open" : ""}`}>
      {/* Anchors so the roadmap rail can still point at earlier versions. */}
      {d.history.map((v) => (
        <span key={v.deliveryId} id={`d-${v.deliveryId}`} className="portal-anchor" aria-hidden="true" />
      ))}
      <div className="portal-row">
        <div className="portal-td portal-td-title">
          <span className="portal-row-title">
            {d.title}
            <VersionMenu
              versions={versions.map((v) => ({ id: v.deliveryId, number: versionNumber(d, v), label: v.label, sentAtMs: v.sentAtMs }))}
              selectedId={current.deliveryId}
              onSelect={select}
            />
          </span>
          {d.variant && <span className="portal-row-variant">{d.variant}</span>}
          {!isLatest && (
            <span className="portal-viewing">
              Viewing v{currentNumber} of {versions.length}, sent {shortDate(current.sentAtMs)}
            </span>
          )}
        </div>
        <div className="portal-td portal-td-shared">
          <span className="portal-td-label">Shared</span>
          <span>{shortDate(current.sentAtMs)}</span>
        </div>
        <div className="portal-td portal-td-links">
          <LinkButtons token={token} deliveryId={current.deliveryId} links={current.links} />
        </div>
        <div className="portal-td portal-td-status">
          <StatusPill state={review.state} mode={review.mode} names={[d.title, d.variant, d.latest.label]} label={review.label} />
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
            {current.body && (
              <div className="portal-details-block">
                <h4 className="portal-details-h">
                  {isLatest ? "The message we sent" : `The message we sent with v${currentNumber}`}
                </h4>
                <div className="portal-body" dangerouslySetInnerHTML={{ __html: html }} />
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
