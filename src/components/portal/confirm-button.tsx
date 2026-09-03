"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  token: string;
  deliveryId: string;
  initialConfirmed: boolean;
}

const UNDO_WARNING =
  "Undoing this reopens the feedback window and can delay the project timeline. Continue?";

export function ConfirmButton({ token, deliveryId, initialConfirmed }: Props) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askUndo, setAskUndo] = useState(false);

  async function post(action: "confirm" | "undo") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/${token}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConfirmed(action === "confirm");
      setAskUndo(false);
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
          <button
            type="button"
            onClick={() => setAskUndo(true)}
            disabled={busy}
            className="text-neutral-500 underline underline-offset-2 hover:text-neutral-800 disabled:opacity-60"
          >
            Undo
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => post("confirm")} disabled={busy} className="portal-btn portal-btn-primary">
          {busy ? "Saving" : "I've sent my feedback"}
        </button>
      )}
      {error && <span className="whitespace-nowrap text-xs text-red-700">{error}</span>}

      {askUndo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`undo-${deliveryId}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 px-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <p id={`undo-${deliveryId}`} className="text-base text-neutral-800">
              {UNDO_WARNING}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAskUndo(false)}
                disabled={busy}
                className="portal-btn portal-btn-secondary"
              >
                Keep it confirmed
              </button>
              <button type="button" onClick={() => post("undo")} disabled={busy} className="portal-btn portal-btn-primary">
                {busy ? "Saving" : "Yes, undo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
