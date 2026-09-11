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

/**
 * What the label adds beyond the pill's own words, so the line under a pill
 * carries the date rather than repeating the pill: "Feedback needed, due
 * Tue, Sep 15" under a "Feedback needed" pill becomes "Due Tue, Sep 15".
 */
export function pillNote(state: ReviewState, mode: ReviewMode, label: string): string | null {
  if (state === "none" || !label) return null;
  const text = label.trim();
  for (const prefix of [pillText(state, mode), mode === "approval" ? "Approval" : "Feedback"]) {
    if (text.toLowerCase() === prefix.toLowerCase()) return null;
    if (!text.toLowerCase().startsWith(prefix.toLowerCase())) continue;
    const rest = text.slice(prefix.length).replace(/^[\s,]+/, "");
    if (!rest) return null;
    return rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return text;
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
