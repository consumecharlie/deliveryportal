/**
 * The yellow-outline folder from the sign-in art (`public/folder-1.svg`
 * and `folder-2.svg` share this glyph; they differ only in their baked-in
 * NEW_FINAL_FINAL label). Inlined so the stroke can turn green for an open
 * folder and dim for a quiet one.
 */
interface Props {
  /** "full" for projects with something ahead or awaiting, "flat" for quiet ones. */
  variant: "full" | "flat";
  open?: boolean;
  width?: number;
  className?: string;
}

export function FolderIcon({ variant, open = false, width = 60, className }: Props) {
  const stroke = open ? "#6AC387" : variant === "full" ? "#DBEF00" : "rgba(219, 239, 0, 0.55)";
  const height = Math.round((width * 57) / 53);
  return (
    <svg
      width={width}
      height={height}
      viewBox="31 0 53 57"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M75.838 5.85266H58.5539C57.3197 5.85266 56.3191 4.87307 56.3191 3.66475C56.3191 1.78514 54.7497 0.248627 52.8298 0.248627H38.512C36.5921 0.248627 35.0226 1.78514 35.0226 3.66475V46.3986C35.0226 48.9445 37.1508 51.023 39.7462 51.023H75.8329C78.4334 51.023 80.5564 48.9395 80.5564 46.3986V10.4771C80.5564 7.93117 78.4283 5.85266 75.8329 5.85266H75.838Z"
        fill="#151919"
        stroke={stroke}
        strokeMiterlimit="10"
      />
      <path
        d="M79.0225 10.8401H35.9775C33.3688 10.8401 31.254 12.9105 31.254 15.4645V52.122C31.254 54.676 33.3688 56.7464 35.9775 56.7464H79.0225C81.6313 56.7464 83.7461 54.676 83.7461 52.122V15.4645C83.7461 12.9105 81.6313 10.8401 79.0225 10.8401Z"
        fill={variant === "full" && !open ? "#1C2222" : "#151919"}
        stroke={stroke}
        strokeMiterlimit="10"
      />
    </svg>
  );
}
