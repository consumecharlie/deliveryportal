/**
 * A blank line between two list items shouldn't split the list. Markdown treats
 * `- a\n\n- b` as a single (loose) list, but our editor's markdown→HTML step
 * renders it as two separate lists — which TipTap then can't merge back, so the
 * stray gap becomes un-editable and re-serializes to `\n\n` on every save.
 *
 * Collapse blank lines that sit strictly between consecutive bullet or ordered
 * items back to a single newline. A blank line before non-list content (e.g. a
 * paragraph after the list) is preserved.
 */
export function collapseListItemGaps(md: string): string {
  if (!md) return md;
  let out = md;
  // Bullets: "- a\n\n- b" → "- a\n- b"
  out = out.replace(/^(\s*- .+)\n\n+(?=\s*- )/gm, "$1\n");
  // Ordered: "1. a\n\n2. b" → "1. a\n2. b"
  out = out.replace(/^(\s*\d+\. .+)\n\n+(?=\s*\d+\. )/gm, "$1\n");
  return out;
}
