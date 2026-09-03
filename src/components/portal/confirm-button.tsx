"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  token: string;
  deliveryId: string;
  initialConfirmed: boolean;
  /**
   * False when the delivery shows as confirmed only because the ClickUp
   * feedback task is closed: there is no confirmation row to undo.
   */
  canUndo: boolean;
}

/** React key that changes whenever the server-side status does, so every instance re-seeds. */
export function confirmButtonKey(
  deliveryId: string,
  status: { kind: string; confirmedAt: Date | null }
): string {
  const at = status.confirmedAt ? new Date(status.confirmedAt).getTime() : "";
  return `${deliveryId}:${status.kind}:${at}`;
}

const UNDO_WARNING =
  "Undoing this reopens the feedback window and can delay the project timeline. Continue?";

/**
 * Local state seeds from props once, so call sites key this component on the
 * delivery id plus its status so a confirm made from one instance (the action
 * list) is reflected by the other (the card) after router.refresh().
 *
 * The undo prompt is a native <dialog> opened with showModal(): focus moves
 * into it, stays trapped, and Escape closes it.
 */
export function ConfirmButton({ token, deliveryId, initialConfirmed, canUndo }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        body: JSON.stringify({ deliveryId }),
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
      if (action === "undo") closeUndo();
      router.refresh();
    } catch {
      setError("Could not save, please try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {confirmed ? (
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium text-emerald-700">Feedback confirmed, thank you</span>
          {(canUndo || confirmed !== initialConfirmed) && (
            <button
              type="button"
              onClick={openUndo}
              disabled={busy}
              className="text-neutral-500 underline underline-offset-2 hover:text-neutral-800 disabled:opacity-60"
            >
              Undo
            </button>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => post("confirm")} disabled={busy} className="portal-btn portal-btn-primary">
          {busy ? "Saving" : "All feedback is in"}
        </button>
      )}
      {error && <span className="text-xs text-red-700">{error}</span>}

      <dialog
        ref={dialogRef}
        aria-labelledby={`undo-${deliveryId}`}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-6 text-neutral-900 shadow-xl backdrop:bg-neutral-900/40"
      >
        <p id={`undo-${deliveryId}`} className="text-base text-neutral-800">
          {UNDO_WARNING}
        </p>
        <div className="mt-5 flex justify-end gap-2">
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
