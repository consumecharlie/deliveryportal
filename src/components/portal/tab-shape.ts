/**
 * Geometry for the Project Viewer's tab strip.
 *
 * The tabs are keystones with rounded tops, drawn as one SVG for the whole
 * strip so neighbours share an exact edge, the way the Mac OS 9 originals do.
 * Skewed pseudo-elements cannot do this: a skewed border box ends bluntly and
 * that blunt end shows as a burr wherever it meets a rounded corner, which is
 * why this is arithmetic instead.
 */
export const STRIP_H = 44;
export const ACTIVE_H = 34;
export const INACTIVE_H = 29;
export const SLANT = 9;
export const RADIUS = 7;
export const STROKE = 2;
/** Below this, the strip scrolls instead of shrinking further. */
export const MIN_TAB_W = 72;
/** Half the stroke, kept clear at each end so nothing is clipped. */
const INSET = STROKE / 2;

export interface TabSlot {
  x0: number;
  x1: number;
}

/** The strip's drawing width: equal shares, unless that would go under the floor. */
export function stripWidth(available: number, count: number): number {
  if (count <= 0) return Math.max(0, available);
  return Math.max(available, count * MIN_TAB_W);
}

/** Equal shares of the strip, each tab's slot meeting its neighbour exactly. */
export function tabSlots(totalW: number, count: number): TabSlot[] {
  if (count <= 0) return [];
  const usable = Math.max(0, totalW - INSET * 2);
  const slots: TabSlot[] = [];
  for (let i = 0; i < count; i++) {
    // Divide by edge position rather than by width, so rounding never leaves
    // a gap or an overlap between neighbours.
    const x0 = INSET + Math.round((usable * i) / count);
    const x1 = INSET + Math.round((usable * (i + 1)) / count);
    slots.push({ x0, x1 });
  }
  return slots;
}

/** Where the bottom edge of every tab sits. */
export const baselineY = STRIP_H - INSET;

/**
 * One tab's outline, bottom left to bottom right, with no bottom edge: the
 * strip draws that once so the active tab can break through it. The corners
 * blend the slant into the top edge along the slant's own direction, so there
 * is no kink and no stub to hide.
 */
export function tabPath(slot: TabSlot, height: number): string {
  const { x0, x1 } = slot;
  const yBase = baselineY;
  const yTop = yBase - height;
  // Never let the slants or the corners eat more than the tab has room for.
  const halfW = (x1 - x0) / 2;
  const slant = Math.max(0, Math.min(SLANT, halfW));
  const radius = Math.max(0, Math.min(RADIUS, halfW - slant, height / 2));
  const run = Math.hypot(slant, height) || 1;
  // Step back from the corner along the slant, so the curve starts tangent to it.
  const backX = (radius * slant) / run;
  const backY = (radius * height) / run;

  const leftCorner = x0 + slant;
  const rightCorner = x1 - slant;
  return [
    `M ${round(x0)} ${round(yBase)}`,
    `L ${round(leftCorner - backX)} ${round(yTop + backY)}`,
    `Q ${round(leftCorner)} ${round(yTop)} ${round(leftCorner + radius)} ${round(yTop)}`,
    `L ${round(rightCorner - radius)} ${round(yTop)}`,
    `Q ${round(rightCorner)} ${round(yTop)} ${round(rightCorner + backX)} ${round(yTop + backY)}`,
    `L ${round(x1)} ${round(yBase)}`,
  ].join(" ");
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The outline as points, for tests and probes that need to measure where ink
 * is allowed to be. Same arithmetic as `tabPath`, with the curves sampled.
 */
export function tabOutline(slot: TabSlot, height: number, samples = 12): [number, number][] {
  const { x0, x1 } = slot;
  const yBase = baselineY;
  const yTop = yBase - height;
  const halfW = (x1 - x0) / 2;
  const slant = Math.max(0, Math.min(SLANT, halfW));
  const radius = Math.max(0, Math.min(RADIUS, halfW - slant, height / 2));
  const run = Math.hypot(slant, height) || 1;
  const backX = (radius * slant) / run;
  const backY = (radius * height) / run;
  const leftCorner = x0 + slant;
  const rightCorner = x1 - slant;

  const points: [number, number][] = [[x0, yBase], [leftCorner - backX, yTop + backY]];
  for (let i = 1; i <= samples; i++) {
    points.push(quad(i / samples, [leftCorner - backX, yTop + backY], [leftCorner, yTop], [leftCorner + radius, yTop]));
  }
  points.push([rightCorner - radius, yTop]);
  for (let i = 1; i <= samples; i++) {
    points.push(quad(i / samples, [rightCorner - radius, yTop], [rightCorner, yTop], [rightCorner + backX, yTop + backY]));
  }
  points.push([x1, yBase]);
  return points;
}

function quad(t: number, a: [number, number], c: [number, number], b: [number, number]): [number, number] {
  const m = 1 - t;
  return [m * m * a[0] + 2 * m * t * c[0] + t * t * b[0], m * m * a[1] + 2 * m * t * c[1] + t * t * b[1]];
}
