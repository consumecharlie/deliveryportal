"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "./cm-button";

interface Props {
  token: string;
  /** The delivery to confirm; null for an item that is only a ClickUp feedback task. */
  deliveryId: string | null;
  /** The ClickUp Feedback Deadline task, used as the key when there is no delivery. */
  feedbackTaskId?: string | null;
  initialConfirmed: boolean;
  /**
   * False when the delivery shows as confirmed only because the ClickUp
   * feedback task is closed: there is no confirmation row to undo.
   */
  canUndo: boolean;
}

/**
 * React key that changes whenever the server-side status does, so every
 * instance re-seeds. Items with no delivery behind them key on their ClickUp
 * feedback task instead.
 */
export function confirmButtonKey(
  deliveryId: string | null,
  status: { kind: string; confirmedAt: Date | null },
  feedbackTaskId?: string | null
): string {
  const at = status.confirmedAt ? new Date(status.confirmedAt).getTime() : "";
  return `${deliveryId ?? feedbackTaskId ?? "unknown"}:${status.kind}:${at}`;
}

const UNDO_WARNING =
  "Undoing this reopens the feedback window and can delay the project timeline. Continue?";

/**
 * Local state seeds from props once, so call sites key this component on the
 * delivery id plus its status so a confirm made from one instance (the review
 * window) is reflected by the other (the project window) after router.refresh().
 *
 * The undo prompt is a native <dialog> opened with showModal(): focus moves
 * into it, stays trapped, and Escape closes it.
 */
export function ConfirmButton({ token, deliveryId, feedbackTaskId, initialConfirmed, canUndo }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Arcade points: a "+100" rises out of the button after a confirm. The key
  // bumps so a confirm after an undo pops again; animationend clears it.
  const [points, setPoints] = useState(0);
  const dialogId = deliveryId ?? feedbackTaskId ?? "item";

  function openUndo() {
    setError(null);
    dialogRef.current?.showModal();
  }

  function closeUndo() {
    dialogRef.current?.close();
  }

  async function post(action: "confirm" | "undo") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/${token}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Exactly one of the two identifies the thing being confirmed.
        body: JSON.stringify(deliveryId ? { deliveryId } : { feedbackTaskId }),
      });
      if (res.status === 409) {
        // The state moved on (someone else confirmed, the team closed it,
        // or it was already undone): pick up the server's view.
        if (action === "undo") closeUndo();
        setError("Already updated");
        router.refresh();
        return;
      }
      if (res.status === 429) {
        setError("Please wait a moment");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConfirmed(action === "confirm");
      if (action === "confirm") setPoints((n) => n + 1);
      if (action === "undo") closeUndo();
      router.refresh();
    } catch {
      setError("Could not save, please try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal-confirm">
      {confirmed ? (
        <div className="portal-confirmed">
          <span className="portal-confirmed-text">Feedback confirmed, thank you</span>
          {(canUndo || confirmed !== initialConfirmed) && (
            <button
              type="button"
              onClick={openUndo}
              disabled={busy}
              className="portal-link-btn"
            >
              Undo
            </button>
          )}
        </div>
      ) : (
        <Button type="button" size="sm" onClick={() => post("confirm")} disabled={busy}>
          {busy ? "Saving" : "All feedback is in"}
        </Button>
      )}
      {points > 0 && (
        <span key={points} className="portal-points" aria-hidden="true" onAnimationEnd={() => setPoints(0)}>
          +100
        </span>
      )}
      {error && (
        <span className="portal-error" role="alert">
          {error}
        </span>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={`undo-${dialogId}`}
        className="portal-modal"
      >
        <p id={`undo-${dialogId}`}>
          {UNDO_WARNING}
        </p>
        <div className="portal-modal-actions">
          <button type="button" onClick={closeUndo} disabled={busy} className="portal-btn portal-btn-secondary">
            Keep it confirmed
          </button>
          <button type="button" onClick={() => post("undo")} disabled={busy} className="portal-btn portal-btn-primary">
            {busy ? "Saving" : "Yes, undo"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
