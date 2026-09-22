/* eslint-disable @next/next/no-img-element -- static brand SVGs, no optimisation wanted */

/**
 * Michael's folder art from the Consume brand guide in Figma (node 5257:2):
 * `public/folder-closed.svg` and `public/folder-open.svg`, used as drawn. The
 * open folder is wider than the closed one, so both sit in a fixed box and are
 * centred on the same baseline, which keeps a row of folders aligned.
 */
interface Props {
  /** Kept for the call sites; the art has two states, open and closed. */
  variant?: "full" | "flat";
  /** True when the project is open in the Project Viewer. */
  open?: boolean;
  /** Height of the folder art; the box around it is sized from this. */
  width?: number;
  className?: string;
}

export function FolderIcon({ open = false, width = 72, className }: Props) {
  const height = Math.round((width * 103) / 124);
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "flex-end",
        justifyContent: "center",
        width: Math.round(width * 1.18),
        height,
      }}
    >
      <img
        src={open ? "/folder-open.svg" : "/folder-closed.svg"}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{ height, width: "auto", display: "block" }}
      />
    </span>
  );
}
