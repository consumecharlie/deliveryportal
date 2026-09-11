"use client";

import { useSyncExternalStore } from "react";
import type { PortalDeliverable } from "@/lib/portal-page-model";
import type { ReviewMode } from "./link-meta";
import {
  countdownText,
  dueDayLabel,
  dueMonthLabel,
  dueSentence,
  dueTimeLabel,
  dueUrgency,
  looksEndOfDay,
  type DueInput,
} from "./due";

/**
 * One timer for every countdown on the page, ticking on the minute. Rows
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

/** The model gains this field; infer it from the date-only sentinel until then. */
function isEndOfDay(review: PortalDeliverable["review"], dueMs: number): boolean {
  return (review as { dueIsEndOfDay?: boolean }).dueIsEndOfDay ?? looksEndOfDay(dueMs);
}

/**
 * The deadline, said once and loudly: a pixel tear-off calendar coloured by
 * urgency, then what is being asked and how long is left. Replaces the pill
 * and the sentence that repeated it.
 */
export function DueBlock({ review, mode }: { review: PortalDeliverable["review"]; mode: ReviewMode }) {
  const nowMs = useNow();
  const ask = mode === "approval" ? "Approval needed" : "Feedback needed";

  if (review.dueMs === null) {
    return (
      <div className="portal-due">
        <div className="portal-due-text">
          <span className="portal-due-ask">{ask}</span>
          {review.label && <span className="portal-due-count">{review.label}</span>}
        </div>
      </div>
    );
  }

  const input: DueInput = {
    dueMs: review.dueMs,
    endOfDay: isEndOfDay(review, review.dueMs),
    isEstimate: review.dueIsEstimate,
    nowMs,
  };
  const urgency = dueUrgency(input);

  return (
    <div className="portal-due">
      <div className={`portal-cal portal-cal-${urgency}`} aria-hidden="true" suppressHydrationWarning>
        <span className="portal-cal-month">{dueMonthLabel(input.dueMs)}</span>
        <span className="portal-cal-day">{dueDayLabel(input.dueMs)}</span>
        <span className="portal-cal-time">{dueTimeLabel(input.dueMs, input.endOfDay)}</span>
      </div>
      <div className="portal-due-text">
        <span className="portal-due-ask" aria-hidden="true">
          {ask}
        </span>
        <span className={`portal-due-count portal-due-count-${urgency}`} aria-hidden="true" suppressHydrationWarning>
          {countdownText(input)}
        </span>
        <span className="portal-visually-hidden" suppressHydrationWarning>
          {dueSentence(ask, input)}
        </span>
      </div>
    </div>
  );
}
