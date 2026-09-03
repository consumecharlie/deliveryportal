import { badgePresentation, type BadgeTone, type PortalCardStatus } from "@/lib/portal-view-model";

const TONES: Record<BadgeTone, string> = {
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  orange: "bg-orange-100 text-orange-800",
  red: "bg-red-100 text-red-800",
};

/** Status pill. Pills are for status only; every clickable control is a button. */
export function FeedbackBadge({ status }: { status: PortalCardStatus | undefined }) {
  if (!status) return null;
  const view = badgePresentation(status);
  if (!view) return null;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[view.tone]}`}>
      {view.label}
    </span>
  );
}
