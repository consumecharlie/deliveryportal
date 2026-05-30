"use client";

/**
 * Consume Media's signature loading indicator — the **Pac Ripple Loader**.
 * Three concentric rings ripple outward from the Pac play-mark. The mark
 * nests inside the innermost ring; the ripple starts at .55 scale (not 0)
 * so that nesting reads clean.
 *
 * Authoritative styles live in `src/app/globals.css` (the `.pac-ripple` /
 * `.pr-ring` / `.pr-mark` rules). The .55 start scale and the `-1px` mark
 * nudge are intentional, hand-tuned design decisions — preserve both.
 *
 * The default export is named for the legacy import path (`PacmanLoader`),
 * so existing call sites stay drop-in; new code should prefer the named
 * `PacRippleLoader` export.
 */

interface PacRippleLoaderProps {
  /** Overall diameter in px. Default 72 (the design's reference size). */
  size?: number;
  /** Ring + mark color. Defaults to brand green (#6AC387). */
  color?: string;
  /** Accessible label announced to assistive tech. */
  label?: string;
  className?: string;
}

export function PacRippleLoader({
  size = 72,
  color = "#6AC387",
  label = "Loading",
  className = "",
}: PacRippleLoaderProps) {
  // Per the design spec: ring stroke scales up at 110px+.
  const ringWidth = size >= 110 ? 4 : 3;
  return (
    <span
      className={`pac-ripple ${className}`.trim()}
      role="status"
      aria-label={label}
      style={
        {
          "--pac-size": `${size}px`,
          "--pac-green": color,
          "--pac-ring-width": `${ringWidth}px`,
        } as React.CSSProperties
      }
    >
      <span className="pr-ring" aria-hidden="true" />
      <span className="pr-ring" aria-hidden="true" />
      <span className="pr-ring" aria-hidden="true" />
      <span className="pr-mark" aria-hidden="true">
        <PacMark />
      </span>
    </span>
  );
}

/** The Pac play-mark. Monochrome — inherits `currentColor` via fill. */
export function PacMark() {
  return (
    <svg viewBox="0 0 1045 1151" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        fillRule="nonzero"
        fill="currentColor"
        d="M 1042.889 839.304 C 1036.553 808.796 1017.621 782.625 990.617 767.181 L 644.628 572.191 L 982.018 361.452 C 1007.664 345.323 1025.239 319.152 1029.915 288.948 C 1034.592 258.745 1026.219 227.857 1006.608 204.348 C 897.84 74.481 738.762 0 570.406 0 C 415.325 0 270.277 61.776 162.188 173.46 C 54.023 285.22 -3.528 432.89 0.168 589.232 C 7.484 900.32 262.658 1151 570.783 1151 C 573.121 1151 575.46 1151 577.798 1150.696 C 753.772 1148.718 916.169 1066.476 1023.278 925.502 C 1041.909 901.004 1048.923 869.431 1042.889 839.228 L 1042.889 839.304 Z M 965.047 880.615 C 871.591 1003.407 730.163 1074.921 577.119 1076.899 L 570.481 1076.899 C 303.012 1076.899 79.745 857.411 73.409 587.635 C 70.09 451.377 120.325 322.499 214.837 225.194 C 308.971 127.889 435.465 74.177 570.481 74.177 C 717.19 74.177 855.601 138.92 950.414 252.05 C 956.373 259.125 958.711 268.483 957.429 277.232 C 956.071 286.285 951.093 293.665 943.475 298.686 L 575.837 528.217 L 405.52 429.238 C 380.251 416.152 349.325 417.522 325.339 432.281 C 300.75 447.345 286.116 473.896 286.116 502.73 L 286.116 646.368 C 286.116 675.202 300.75 701.753 325.339 716.817 C 349.627 731.957 379.572 733.25 405.218 720.164 C 405.897 719.86 406.877 719.175 407.556 718.795 L 573.951 616.773 L 954.94 831.848 C 963.237 836.565 969.271 844.63 971.232 853.987 C 971.534 855.966 971.911 858.324 971.911 860.378 C 971.911 867.453 969.573 874.453 965.273 880.539 L 965.047 880.615 Z M 504.934 572.571 L 371.2 654.432 C 368.56 655.421 365.844 655.117 363.581 653.747 C 361.62 652.378 359.282 650.4 359.282 646.368 L 359.584 502.73 C 359.584 499.003 361.922 496.72 363.581 495.351 C 364.562 494.666 366.221 493.981 368.258 493.981 C 369.239 493.981 370.219 493.981 371.275 494.666 L 505.01 572.495 L 504.934 572.571 Z"
      />
    </svg>
  );
}

// Existing import sites use the default export as `PacmanLoader` — alias the
// new component to that default so the swap is drop-in. Prefer the named
// `PacRippleLoader` export for new code.
export default PacRippleLoader;
