/**
 * The 8-bit Pac mark from the brand kit, traced to a 15x17 pixel grid so it
 * can be inlined at any size and colour. Used as the header mark and as the
 * "up next" marker on the roadmap rail.
 */
const PAC_PATH =
  "M14 3V2H13V1H12H11V0H10H9H8H7H6H5V1H4V2H3V3H2V4H1V5V6H0V7V8V9V10V11H1V12V13H2V14V15H3V16H4H5V17H6H7H8H9H10H11V16H12H13V15H14V14H15V13H14V12H13V11H12H11V10H10V9H9V8H10V7H11H12V6H13H14V5H15V4V3H14Z";

interface Props {
  size?: number;
  color?: string;
  className?: string;
  title?: string;
}

export function PacMark({ size = 28, color = "#151919", className, title }: Props) {
  const height = Math.round((size * 17) / 15);
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 15 17"
      className={className}
      shapeRendering="crispEdges"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <path d={PAC_PATH} fill={color} />
    </svg>
  );
}
