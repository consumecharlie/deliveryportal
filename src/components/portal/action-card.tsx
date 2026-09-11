"use client";

import { useSyncExternalStore } from "react";
import type { PortalAttentionItem } from "@/lib/portal-page-model";
import { ConfirmButton, confirmButtonKey } from "./confirm-button";
import { ViewLink } from "./view-link";
import { reviewMode } from "./link-meta";
import {
  actionTitle,
  countdownText,
  dueDayLabel,
  dueMonthLabel,
  dueSentence,
  dueTimeLabel,
  dueUrgency,
  looksEndOfDay,
  reviewWindowProgress,
  type DueInput,
} from "./due";

/**
 * One timer for every countdown on the page, ticking on the minute. Cards
 * subscribe individually, so a tick re-renders the little blocks and nothing
 * above them.
 */
const listeners = new Set<() => void>();
let timer: number | null = null;
let now = Date.now();

function schedule() {
  timer = window.setTimeout(() => {
    now = Date.now();
    for (const listener of listeners) listener();
    schedule();
  }, 60_000 - (Date.now() % 60_000) + 50);
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (timer === null) {
    // First subscriber: the module may have loaded a while ago, or on the
    // server, so take a fresh reading before anyone reads the snapshot.
    now = Date.now();
    schedule();
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };
}

const readNow = () => now;

function useNow(): number {
  return useSyncExternalStore(subscribe, readNow, readNow);
}

/** `dueIsEndOfDay` is still arriving; read it softly until it lands. */
function endOfDayFlag(review: PortalAttentionItem["review"], dueMs: number): boolean {
  return (review as { dueIsEndOfDay?: boolean }).dueIsEndOfDay ?? looksEndOfDay(dueMs);
}

/** The 8-bit progress bar: a dithered fill in a hairline track. */
function ReviewWindowBar({ input, windowStartMs }: { input: DueInput; windowStartMs: number | null }) {
  const progress = reviewWindowProgress({
    windowStartMs,
    dueMs: input.dueMs,
    endOfDay: input.endOfDay,
    nowMs: input.nowMs,
  });
  if (!progress || input.isEstimate) return null;
  return (
    <div className="portal-rw" aria-hidden="true">
      <span className="portal-rw-label">Review window</span>
      <span className="portal-rw-track">
        <span className="portal-rw-fill" style={{ width: `${progress.pct}%` }} />
      </span>
      <span className="portal-rw-count">{progress.label}</span>
    </div>
  );
}

interface Props {
  token: string;
  item: PortalAttentionItem;
}

/**
 * An action item as a card: the deadline as a solid calendar panel down the
 * left, then what it is, what is being asked and how long is left, the
 * review window drawn as a progress bar, and the two buttons. Reviewing is
 * the primary action; confirming sits beside it as the quieter one.
 */
export function ActionCard({ token, item }: Props) {
  const nowMs = useNow();
  const { review } = item;
  const mode = reviewMode(review, item.deliverableTitle, item.variant);
  const ask = mode === "approval" ? "Approval needed" : "Feedback needed";
  const { main, secondary } = actionTitle(item.deliverableTitle, item.variant);
  const key = confirmButtonKey(
    item.deliveryId,
    { kind: review.state, confirmedAt: review.confirmedAtMs ? new Date(review.confirmedAtMs) : null },
    item.feedbackTaskId
  );
  const input: DueInput | null =
    review.dueMs === null
      ? null
      : {
          dueMs: review.dueMs,
          endOfDay: endOfDayFlag(review, review.dueMs),
          isEstimate: review.dueIsEstimate,
          nowMs,
        };
  const urgency = input ? dueUrgency(input) : "calm";

  return (
    <li className={`portal-action portal-action-${urgency}`}>
      {input && (
        <div className="portal-action-cal" aria-hidden="true" suppressHydrationWarning>
          <span className="portal-action-month">{dueMonthLabel(input.dueMs)}</span>
          <span className="portal-action-day">{dueDayLabel(input.dueMs)}</span>
          <span className="portal-action-time">{dueTimeLabel(input.dueMs, input.endOfDay)}</span>
        </div>
      )}
      <div className="portal-action-main">
        <div className="portal-action-head">
          <h3 className="portal-action-title">
            {main}
            {secondary && <span className="portal-action-variant">{secondary}</span>}
          </h3>
          <p className="portal-action-project">{item.projectName}</p>
          <p className="portal-action-status" aria-hidden="true" suppressHydrationWarning>
            <span className="portal-action-swatch" />
            <strong>{ask}</strong>
            {input && (
              <>
                <span className="portal-action-dot">·</span>
                <span className="portal-action-count">{countdownText(input)}</span>
              </>
            )}
          </p>
          <span className="portal-visually-hidden" suppressHydrationWarning>
            {input ? dueSentence(ask, input) : `${ask}. ${review.label}`}
          </span>
        </div>

        {input && <ReviewWindowBar input={input} windowStartMs={review.windowStartMs} />}

        <div className="portal-action-buttons">
          {/* Nothing to open: the sentence takes the review button's place,
              and confirming moves into the corner the action lives in. */}
          {item.deliveryId === null && (
            <span className="portal-action-waiting">
              {mode === "approval" ? "We are waiting on your approval." : "We are waiting on your details."}
            </span>
          )}
          <ConfirmButton
            key={key}
            token={token}
            deliveryId={item.deliveryId}
            feedbackTaskId={item.feedbackTaskId}
            initialConfirmed={false}
            canUndo={review.canUndo}
            variant="secondary"
          />
          {item.deliveryId && item.primaryLink && (
            <ViewLink
              token={token}
              deliveryId={item.deliveryId}
              href={item.primaryLink.url}
              target="_blank"
              rel="noopener noreferrer"
              className="cm-btn cm-btn--sm portal-action-review"
            >
              Click to review
            </ViewLink>
          )}
        </div>
      </div>
    </li>
  );
}
