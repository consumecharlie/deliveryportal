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
export function StatusPill({ state, mode, names = [] }: Props) {
  const m = reviewMode({ mode }, ...names);
  let text: string;
  let cls: string;
  switch (state) {
    case "awaiting":
      text = m === "approval" ? "Approval needed" : "Feedback needed";
      cls = "portal-pill-needed";
      break;
    case "due-today":
      text = "Due today";
      cls = "portal-pill-due-today";
      break;
    case "overdue":
      text = "Past due";
      cls = "portal-pill-overdue";
      break;
    case "confirmed":
      text = m === "approval" ? "Approved" : "Feedback received";
      cls = m === "approval" ? "portal-pill-approved" : "portal-pill-received";
      break;
    default:
      text = "Delivered";
      cls = "portal-pill-delivered";
  }
  return <span className={`portal-pill ${cls}`}>{text}</span>;
}
