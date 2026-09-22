"use client";

import { useMemo, useState } from "react";
import type { PortalDeliverable } from "@/lib/portal-page-model";
import { renderPortalBody } from "@/lib/portal-render";
import { sendPortalView } from "@/lib/portal-view-beacon";
import { ConfirmButton, confirmButtonKey } from "./confirm-button";
import { StatusPill, pillNote } from "./status-pill";
import { LinkButtons } from "./link-button";
import { ViewLink } from "./view-link";
import { VersionMenu } from "./version-menu";
import { MessagePopover } from "./message-popover";
import { ReviewPopover } from "./review-popover";
import { allVersions, orderedLinks, pickPrimaryLink, reviewMode, versionNumber, versionTagOf } from "./link-meta";
import { shortDate } from "./format";

interface Props {
  token: string;
  deliverables: PortalDeliverable[];
  /** The project has upcoming milestones, so the empty state can point at the rail. */
  hasPlan?: boolean;
}

function Row({ token, d, open, onToggle }: { token: string; d: PortalDeliverable; open: boolean; onToggle: (key: string | null) => void }) {
  // The popover anchors to this element, so it has to be state, not a ref:
  // it must be set by the time the popover renders.
  const [button, setButton] = useState<HTMLButtonElement | null>(null);
  const [reviewButton, setReviewButton] = useState<HTMLButtonElement | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
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
  const links = orderedLinks(current.links);
  const primaryLink = pickPrimaryLink(current.links);
  /** One link goes straight there; more than one is worth guiding through. */
  const guided = links.length > 1;

  function toggle() {
    if (!open) sendPortalView(token, current.deliveryId);
    onToggle(open ? null : d.key);
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
            {/* The version control belongs with the name it versions. */}
            <VersionMenu
              versions={versions.map((v) => ({ id: v.deliveryId, number: versionNumber(d, v), label: v.label, sentAtMs: v.sentAtMs, tag: versionTagOf(d, v) }))}
              selectedId={current.deliveryId}
              onSelect={select}
            />
          </span>
          {d.variant && <span className="portal-row-variant">{d.variant}</span>}
          {!isLatest && (
            <span className="portal-viewing">
              Viewing {versionTagOf(d, current)} of {versions.length}, sent {shortDate(current.sentAtMs)}
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
        <div className="portal-td portal-td-state">
          <div className="portal-state-line">
            <StatusPill state={review.state} mode={review.mode} names={[d.title, d.variant, d.latest.label]} label={review.label} />
            {dueNote && <span className="portal-due-note">{dueNote}</span>}
          </div>
          <div className="portal-row-actions">
            {actionable && (
              <div className="portal-row-labelled">
                <ConfirmButton
                  key={confirmButtonKey(d.latest.deliveryId, {
                    kind: review.state,
                    confirmedAt: review.confirmedAtMs ? new Date(review.confirmedAtMs) : null,
                  })}
                  token={token}
                  deliveryId={d.latest.deliveryId}
                  initialConfirmed={false}
                  canUndo={review.canUndo}
                  appearance="quiet"
                />
                {primaryLink &&
                  (guided ? (
                    <button
                      ref={setReviewButton}
                      type="button"
                      className="portal-btn portal-btn-sm portal-quietbtn portal-quietbtn-go"
                      aria-haspopup="dialog"
                      aria-expanded={guideOpen}
                      onClick={() => setGuideOpen((o) => !o)}
                    >
                      <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                        <path d="M2 3.2h4.2a1.6 1.6 0 0 1 1.6 1.6v6.4a1.3 1.3 0 0 0-1.3-1.3H2Z" />
                        <path d="M12 3.2H7.8a1.6 1.6 0 0 0-1.6 1.6v6.4a1.3 1.3 0 0 1 1.3-1.3H12Z" />
                      </svg>
                      <span className="portal-linkbtn-label">Click to review</span>
                    </button>
                  ) : (
                    <ViewLink
                      token={token}
                      deliveryId={current.deliveryId}
                      href={primaryLink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="portal-btn portal-btn-sm portal-quietbtn portal-quietbtn-go"
                    >
                      <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                        <path d="M5.6 8.4a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-1 1" />
                        <path d="M8.4 5.6a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l1-1" />
                      </svg>
                      <span className="portal-linkbtn-label">Click to review</span>
                    </ViewLink>
                  ))}
              </div>
            )}
            <button
              ref={setButton}
              type="button"
              className="portal-btn portal-btn-sm portal-quietbtn portal-msg-btn"
              aria-expanded={open}
              aria-haspopup="dialog"
              aria-controls={open ? panelId : undefined}
              aria-label="View delivery message"
              title="View delivery message"
              onClick={toggle}
            >
              <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M3 2.6h8a1.6 1.6 0 0 1 1.6 1.6v3.6A1.6 1.6 0 0 1 11 9.4H6.6L4 11.8V9.4H3a1.6 1.6 0 0 1-1.6-1.6V4.2A1.6 1.6 0 0 1 3 2.6Z" />
                <path d="M4.4 5h4.6M4.4 7.2h3" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <ReviewPopover
        open={guideOpen}
        anchor={reviewButton}
        onClose={() => setGuideOpen(false)}
        token={token}
        deliveryId={current.deliveryId}
        title={`Review ${d.title}`}
        links={links}
        confirm={showConfirm ? { deliveryId: d.latest.deliveryId, initialConfirmed: review.state === "confirmed", canUndo: review.canUndo } : null}
      />

      <MessagePopover open={open} anchor={button} title={d.title} onClose={() => onToggle(null)}>
        <div id={panelId} className="portal-pop-content">
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
                appearance="quiet"
              />
            </div>
          )}
        </div>
      </MessagePopover>
    </li>
  );
}

export function DeliverablesTable({ token, deliverables, hasPlan = false }: Props) {
  // One open message at a time, so the key lives with the table.
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (deliverables.length === 0) {
    return (
      <p className="portal-quiet">
        {hasPlan
          ? "Nothing shared yet. The plan above shows what is coming and when."
          : "Nothing shared yet. Deliverables land here as soon as we send them."}
      </p>
    );
  }
  return (
    <div className="portal-table">
      <div className="portal-thead" aria-hidden="true">
        <span className="portal-th portal-td-title">Deliverable</span>
        <span className="portal-th portal-td-shared">Shared</span>
        <span className="portal-th portal-td-links">Links</span>
        <span className="portal-th portal-td-state">Status</span>
      </div>
      <ul className="portal-tbody">
        {deliverables.map((d) => (
          <Row key={d.key} token={token} d={d} open={openKey === d.key} onToggle={setOpenKey} />
        ))}
      </ul>
    </div>
  );
}
