import type { ReviewState } from "@/lib/portal-page-model";

/**
 * The only rounded-full element on the portal: a status pill. Awaiting is a
 * green tint, due today a yellow outline, past due ink on yellow, confirmed a
 * quiet gray. "none" renders a muted hyphen so table cells stay aligned.
 */
export function StatusPill({ state, label }: { state: ReviewState; label: string }) {
  if (state === "none") {
    return (
      <span className="portal-muted" aria-label="No action needed">
        &ndash;
      </span>
    );
  }
  const text =
    state === "awaiting" ? "Awaiting you" : state === "due-today" ? "Due today" : state === "overdue" ? "Past due" : label;
  return <span className={`portal-pill portal-pill-${state}`}>{text}</span>;
}
