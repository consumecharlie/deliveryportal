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

export interface DropdownOption {
  id: string;
  name: string;
  orderindex: number;
  color?: string | null;
}

/** Append a new option after the current max orderindex, leaving originals byte-for-byte. */
export function buildAppendedOptions(existing: DropdownOption[], newName: string): DropdownOption[] {
  const maxIdx = existing.reduce((m, o) => Math.max(m, o.orderindex), -1);
  return [...existing, { id: "", name: newName, orderindex: maxIdx + 1, color: null }];
}

/** True iff every `before` option is intact (id/name/orderindex) in `after` and `newName` is present. */
export function verifyOptionsUnchanged(
  before: Array<Pick<DropdownOption, "id" | "name" | "orderindex">>,
  after: Array<Pick<DropdownOption, "id" | "name" | "orderindex">>,
  newName: string
): boolean {
  const byId = new Map(after.map((o) => [o.id, o]));
  const allIntact = before.every((b) => {
    const a = byId.get(b.id);
    return !!a && a.name === b.name && String(a.orderindex) === String(b.orderindex);
  });
  const newPresent = after.some((o) => o.name.trim().toLowerCase() === newName.trim().toLowerCase());
  return allIntact && newPresent;
}
