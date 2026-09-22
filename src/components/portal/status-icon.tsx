import type { ReviewState } from "@/lib/portal-page-model";
import type { ReviewMode } from "./link-meta";

/**
 * Small line icons for the status pills, in the quiet style of the link
 * buttons rather than the heavy badge art. The icon says what kind of thing
 * is being asked and the pill's colour says how urgent it is, so a state and
 * its urgent variants share one icon: a speech bubble for feedback, a check
 * in a circle for approval, a download tray for something simply delivered.
 * The filled variants knock their mark out in the pill's own background.
 */
export type StatusIconKind = "bubble" | "bubble-filled" | "check-circle" | "check-circle-filled" | "tray";

/**
 * The icon says what kind of thing is being asked, so a state and its urgent
 * variants share one: needed, due today and past due all draw the same mark,
 * and only the pill's colour changes.
 */
export function statusIconKind(state: ReviewState, mode: ReviewMode): StatusIconKind {
  if (state === "confirmed") return mode === "approval" ? "check-circle-filled" : "bubble-filled";
  if (state === "none") return "tray";
  return mode === "approval" ? "check-circle" : "bubble";
}

export function StatusIcon({ state, mode }: { state: ReviewState; mode: ReviewMode }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: "0 0 14 14",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
    className: "portal-pill-icon",
  };
  const bubble = "M3 2.6h8a1.6 1.6 0 0 1 1.6 1.6v3.6A1.6 1.6 0 0 1 11 9.4H6.6L4 11.8V9.4H3a1.6 1.6 0 0 1-1.6-1.6V4.2A1.6 1.6 0 0 1 3 2.6Z";

  const kind = statusIconKind(state, mode);
  if (kind === "check-circle-filled" || kind === "bubble-filled") {
    return kind === "check-circle-filled" ? (
      <svg {...common}>
        <circle cx="7" cy="7" r="5.3" fill="currentColor" stroke="none" />
        <path d="M4.6 7.1 6.3 8.8 9.4 5.4" stroke="var(--pill-bg, #fafffd)" />
      </svg>
    ) : (
      <svg {...common}>
        <path d={bubble} fill="currentColor" stroke="none" />
        <path d="M4.4 5.9 6 7.5 9.1 4.4" stroke="var(--pill-bg, #fafffd)" />
      </svg>
    );
  }
  if (kind === "tray") {
    return (
      <svg {...common}>
        <path d="M7 2.2v5.6" />
        <path d="M4.4 5.6 7 8.2l2.6-2.6" />
        <path d="M2.4 11.2h9.2" />
      </svg>
    );
  }
  return kind === "check-circle" ? (
    <svg {...common}>
      <circle cx="7" cy="7" r="5.3" />
      <path d="M4.6 7.1 6.3 8.8 9.4 5.4" />
    </svg>
  ) : (
    <svg {...common}>
      <path d={bubble} />
    </svg>
  );
}
