/**
 * Client feedback state as shown in the internal Sent view, derived from the
 * newest FeedbackConfirmation row for a delivery.
 *
 *   confirmed  newest row is live (undoneAt null)
 *   reopened   newest row was undone by the client
 *
 * A delivery with no confirmation rows has no entry (the caller shows null).
 */
export type ClientFeedbackState = "confirmed" | "reopened";

export interface ClientFeedback {
  state: ClientFeedbackState;
  confirmedAt: string;
  confirmedByName: string | null;
}

export interface ConfirmationRowLike {
  /** Null on a confirmation that stands on a feedback task alone; such rows are skipped here. */
  deliveryId: string | null;
  confirmedAt: Date | string;
  confirmedByName: string | null;
  undoneAt: Date | string | null;
}

function iso(d: Date | string): string {
  return typeof d === "string" ? d : d.toISOString();
}

/**
 * Reduce confirmation rows (ordered confirmedAt desc) to one state per
 * delivery. Only the first row seen for each delivery id counts.
 */
export function deriveClientFeedback(
  rows: ConfirmationRowLike[]
): Map<string, ClientFeedback> {
  const out = new Map<string, ClientFeedback>();
  for (const r of rows) {
    if (!r.deliveryId || out.has(r.deliveryId)) continue;
    out.set(r.deliveryId, {
      state: r.undoneAt ? "reopened" : "confirmed",
      confirmedAt: iso(r.confirmedAt),
      confirmedByName: r.confirmedByName ?? null,
    });
  }
  return out;
}
