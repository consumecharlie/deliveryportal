/** Two presses on the same delivery inside this window are treated as one. */
export const DOUBLE_CLICK_MS = 10_000;

/** True when the last confirm or undo on a delivery happened within the guard window. */
export function isDoubleClick(lastAt: Date | null, nowMs: number): boolean {
  if (!lastAt) return false;
  const elapsed = nowMs - lastAt.getTime();
  return elapsed >= 0 && elapsed < DOUBLE_CLICK_MS;
}
