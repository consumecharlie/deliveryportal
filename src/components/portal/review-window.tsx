"use client";

import type { PortalAttentionItem } from "@/lib/portal-page-model";
import { MacWindow, type WindowFrameProps } from "./mac-window";
import { ConfirmButton, confirmButtonKey } from "./confirm-button";
import { StatusPill, pillNote } from "./status-pill";
import { reviewMode } from "./link-meta";
import { ViewLink } from "./view-link";
import { REVIEW_ID } from "./desktop-state";
import { openReviewLabel } from "./link-button";

interface Props extends WindowFrameProps {
  token: string;
  items: PortalAttentionItem[];
}

/**
 * NEEDS YOUR REVIEW: opens on top. One row per item the client owes
 * feedback on, with the two brand pixel buttons. An item with no delivery
 * behind it (an open ClickUp feedback task whose share task was completed
 * outside the portal) has no link to open, so it says what we are waiting on
 * instead. Empty: the ghost and ALL CLEAR. Closable; the dock brings it back.
 */
export function ReviewWindow({ token, items, ...frame }: Props) {
  return (
    <MacWindow {...frame} id={REVIEW_ID} title="Needs your review" canClose className="portal-window-review">
      {items.length === 0 ? (
        <div className="portal-allclear">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
          <img src="/ghost-icon.svg" alt="" aria-hidden="true" width={56} height={56} draggable={false} />
          <p className="portal-pixel-caption">All clear</p>
          <p className="portal-allclear-text">Nothing needs your review right now.</p>
        </div>
      ) : (
        <ul className="portal-review-list">
          {items.map((item) => {
            const mode = reviewMode(item.review, item.deliverableTitle, item.variant);
            const key = confirmButtonKey(
              item.deliveryId,
              { kind: item.review.state, confirmedAt: item.review.confirmedAtMs ? new Date(item.review.confirmedAtMs) : null },
              item.feedbackTaskId
            );
            return (
              <li key={key} className="portal-review-row">
                <div className="portal-review-what">
                  <span className="portal-row-title">
                    {item.deliverableTitle}
                    {item.variant && (
                      <>
                        <span className="portal-review-dot" aria-hidden="true">
                          {" · "}
                        </span>
                        <span className="portal-review-variant">{item.variant}</span>
                      </>
                    )}
                  </span>
                  <span className="portal-review-project">{item.projectName}</span>
                  <span className="portal-review-due">
                    <StatusPill
                      state={item.review.state}
                      mode={item.review.mode}
                      names={[item.deliverableTitle, item.variant]}
                      label={item.review.label}
                    />
                    {(() => {
                      const note = pillNote(item.review.state, mode, item.review.label);
                      return note ? <span className="portal-review-due-label">{note}</span> : null;
                    })()}
                  </span>
                </div>
                <div className="portal-review-actions">
                  {item.deliveryId && item.primaryLink ? (
                    <ViewLink
                      token={token}
                      deliveryId={item.deliveryId}
                      href={item.primaryLink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cm-btn cm-btn--secondary cm-btn--sm"
                    >
                      {openReviewLabel(item.primaryLink)}
                    </ViewLink>
                  ) : item.deliveryId === null ? (
                    <span className="portal-quiet">
                      {mode === "approval" ? "We are waiting on your approval." : "We are waiting on your details."}
                    </span>
                  ) : null}
                  <ConfirmButton
                    key={key}
                    token={token}
                    deliveryId={item.deliveryId}
                    feedbackTaskId={item.feedbackTaskId}
                    initialConfirmed={false}
                    canUndo={item.review.canUndo}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </MacWindow>
  );
}
