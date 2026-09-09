import type { LinkKind } from "@/lib/portal-page-model";

/** Quiet 16px line icons for what a link opens. Stroke follows currentColor. */
export function LinkIcon({ kind, className }: { kind: LinkKind; className?: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
    className,
  };
  switch (kind) {
    case "google-doc":
    case "pdf":
      return (
        <svg {...common}>
          <path d="M4 1.75h5l3 3v9.5H4z" />
          <path d="M9 1.75v3h3M6 8h4M6 10.5h4" />
        </svg>
      );
    case "google-sheet":
      return (
        <svg {...common}>
          <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="1.5" />
          <path d="M2.25 6.5h11.5M2.25 10h11.5M6.5 2.25v11.5" />
        </svg>
      );
    case "google-slides":
      return (
        <svg {...common}>
          <rect x="1.75" y="3" width="12.5" height="8.5" rx="1.5" />
          <path d="M8 11.5V14M5.5 14h5" />
        </svg>
      );
    case "google-drive":
      return (
        <svg {...common}>
          <path d="M6 2.25h4l4 7-2 3.5H4l-2-3.5z" />
          <path d="M6 2.25l4 7M10 2.25l-4 7M2 9.25h12" />
        </svg>
      );
    case "frame":
    case "vimeo":
    case "youtube":
    case "video":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.25" />
          <path d="M6.75 5.5v5l4-2.5z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "audio":
      return (
        <svg {...common}>
          <path d="M2.5 8h1.5M5 5v6M7.5 3v10M10 5.5v5M12.5 7v2M14 8h0" />
        </svg>
      );
    case "loom":
      return (
        <svg {...common}>
          <rect x="1.75" y="4" width="8.5" height="8" rx="1.5" />
          <path d="M10.25 7l4-2v6l-4-2z" />
        </svg>
      );
    case "box":
    case "dropbox":
      return (
        <svg {...common}>
          <path d="M2 5.5l6-3 6 3-6 3z" />
          <path d="M2 5.5v5.5l6 3 6-3V5.5M8 8.5V14" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M6.75 9.25a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-1 1" />
          <path d="M9.25 6.75a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l1-1" />
        </svg>
      );
  }
}
