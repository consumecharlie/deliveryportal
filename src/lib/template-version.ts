/** Matches the first version token in a deliverable-type name: `V1`, `v12`, or `Final`. */
const VERSION_TOKEN = /\bV\d+\b|\bFinal\b/i;

/**
 * Propose a target deliverable-type name for a new version.
 *
 * If the source name already carries a version token (`V\d+` or `Final`),
 * that token is replaced IN PLACE with `targetLabel`, preserving surrounding
 * text (e.g. a trailing `+ Loom`). Otherwise `targetLabel` is appended.
 *
 * The result is always shown to the user in an editable field before commit, so
 * this only needs to be right for the common cases.
 */
export function deriveVersionName(sourceName: string, targetLabel: string): string {
  const src = sourceName.trim();
  const out = VERSION_TOKEN.test(src)
    ? src.replace(VERSION_TOKEN, targetLabel)
    : `${src} ${targetLabel}`;
  return out.replace(/\s+/g, " ").trim();
}
