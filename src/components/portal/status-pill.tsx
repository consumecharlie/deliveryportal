import type { ReviewState } from "@/lib/portal-page-model";
import { reviewMode, type ReviewMode } from "./link-meta";

interface Props {
  state: ReviewState;
  /** From the model when present; inferred from `names` (a "Final" means approval) otherwise. */
  mode?: ReviewMode;
  names?: (string | null | undefined)[];
  /** The full review label ("Confirmed Jul 12"); shown by the caller under the pill. */
  label: string;
}

/**
 * The only rounded-full elements in the windows. Color encodes state and
 * mode: needed (yellow tint), due today (solid yellow), past due (ink with
 * yellow text), feedback received (light green), approved (solid green),
 * delivered (quiet gray).
 */
export function pillText(state: ReviewState, mode: ReviewMode): string {
  switch (state) {
    case "awaiting":
      return mode === "approval" ? "Approval needed" : "Feedback needed";
    case "due-today":
      return "Due today";
    case "overdue":
      return "Past due";
    case "confirmed":
      return mode === "approval" ? "Approved" : "Feedback received";
    default:
      return "Delivered";
  }
}

/** The full review label when it adds something (a date) beyond the pill's word; else null. */
export function pillNote(state: ReviewState, mode: ReviewMode, label: string): string | null {
  if (state === "none" || !label) return null;
  return label.trim().toLowerCase() === pillText(state, mode).toLowerCase() ? null : label;
}

export function StatusPill({ state, mode, names = [] }: Props) {
  const m = reviewMode({ mode }, ...names);
  const cls =
    state === "awaiting"
      ? "portal-pill-needed"
      : state === "due-today"
        ? "portal-pill-due-today"
        : state === "overdue"
          ? "portal-pill-overdue"
          : state === "confirmed"
            ? m === "approval"
              ? "portal-pill-approved"
              : "portal-pill-received"
            : "portal-pill-delivered";
  return <span className={`portal-pill ${cls}`}>{pillText(state, m)}</span>;
}
