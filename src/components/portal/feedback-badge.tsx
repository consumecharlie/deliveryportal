import type { FeedbackStatus } from "@/lib/portal-data";

/** Status pill. Pills are for status only; every clickable control is a button. */
export function FeedbackBadge({ status }: { status: FeedbackStatus | undefined }) {
  if (!status || status.kind === "none") return null;

  let label: string;
  let tone: string;
  if (status.kind === "confirmed") {
    label = "Confirmed";
    tone = "bg-emerald-100 text-emerald-800";
  } else if (status.state === "overdue") {
    label = "Overdue";
    tone = "bg-red-100 text-red-800";
  } else if (status.state === "due-today") {
    label = "Due today";
    tone = "bg-orange-100 text-orange-800";
  } else {
    label = `Due ${status.dueLabel}`;
    tone = "bg-amber-100 text-amber-800";
  }

  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}
