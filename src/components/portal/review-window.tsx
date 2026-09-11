"use client";

import type { PortalAttentionItem } from "@/lib/portal-page-model";
import { MacWindow, type WindowFrameProps } from "./mac-window";
import { confirmButtonKey } from "./confirm-button";
import { ActionCard } from "./action-card";
import { REVIEW_ID } from "./desktop-state";

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
          {items.map((item) => (
            <ActionCard
              key={confirmButtonKey(
                item.deliveryId,
                { kind: item.review.state, confirmedAt: item.review.confirmedAtMs ? new Date(item.review.confirmedAtMs) : null },
                item.feedbackTaskId
              )}
              token={token}
              item={item}
            />
          ))}
        </ul>
      )}
    </MacWindow>
  );
}
