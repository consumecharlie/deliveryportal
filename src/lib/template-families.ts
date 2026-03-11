/**
 * Utilities for grouping delivery snippet templates into "families"
 * based on their deliverable type.
 *
 * For example, "AV Script V1 + Loom", "AV Script V1", "AV Script V2",
 * and "AV Script Final" all belong to the "AV Script" family.
 *
 * Some deliverable types have explicit family overrides because their
 * names don't follow the simple suffix-stripping pattern. For example,
 * "Potential Master" and "Final Delivery" both belong to the "Edit" family.
 */

import type { DeliverySnippetTemplate } from "@/lib/types";

// ── Explicit overrides ─────────────────────────────────────────────
// Deliverable types whose family/label/order can't be derived by
// simple suffix-stripping. The key is the EXACT deliverable type name.

interface FamilyOverride {
  family: string;
  label: string; // variant label shown in the UI
  order: number; // sort order within the family
}

const FAMILY_OVERRIDES: Record<string, FamilyOverride> = {
  // ── Edit family ──────────────────────────────────────────────
  "Edit V1":         { family: "Edit", label: "V1",               order: 0 },
  "Edit V2":         { family: "Edit", label: "V2",               order: 1 },
  "Edit V3":         { family: "Edit", label: "V3",               order: 2 },
  "Potential Master":{ family: "Edit", label: "Potential Master",  order: 3 },
  "Final Delivery":  { family: "Edit", label: "Final Delivery",   order: 4 },

  // ── Edit - Animated family ───────────────────────────────────
  "Edit V1 - Animated":          { family: "Edit - Animated", label: "V1",               order: 0 },
  "Edit V2 - Animated":          { family: "Edit - Animated", label: "V2",               order: 1 },
  "Potential Master - Animated":  { family: "Edit - Animated", label: "Potential Master",  order: 2 },

  // ── Edit - Batch family ──────────────────────────────────────
  "Edit V1 - Batch":             { family: "Edit - Batch", label: "V1",                order: 0 },
  "Edit V2 - Batch":             { family: "Edit - Batch", label: "V2",                order: 1 },
  "Potential Masters - Batch":   { family: "Edit - Batch", label: "Potential Master",   order: 2 },
  "Final Delivery - Batch":      { family: "Edit - Batch", label: "Final Delivery",    order: 3 },

  // ── Spinoffs family ──────────────────────────────────────────
  "Spinoff Edit V1":          { family: "Spinoffs",  label: "Edit V1",           order: 0 },
  "Spinoff Edit V2":          { family: "Spinoffs",  label: "Edit V2",           order: 1 },
  "Spinoff Potential Master": { family: "Spinoffs",  label: "Potential Master",  order: 2 },
  "Spinoff Final":            { family: "Spinoffs",  label: "Final",             order: 3 },

  // ── Spinoffs - Batch family ──────────────────────────────────
  "Spinoff Edit V1 - Batch":           { family: "Spinoffs - Batch", label: "Edit V1",           order: 0 },
  "Spinoff Edit V2 - Batch":           { family: "Spinoffs - Batch", label: "Edit V2",           order: 1 },
  "Spinoff Potential Masters - Batch":  { family: "Spinoffs - Batch", label: "Potential Master",  order: 2 },
  "Spinoff Final Delivery - Batch":     { family: "Spinoffs - Batch", label: "Final Delivery",    order: 3 },

  // ── Reformats family ───────────────────────────────────────
  "Reformats":                 { family: "Reformats", label: "Reformats",              order: 0 },
  "Final Delivery - Reformats": { family: "Reformats", label: "Final Delivery",         order: 1 },

  // ── Additional Deliverables family ─────────────────────────
  "Baked Subs":                 { family: "Additional Deliverables", label: "Baked Subs",                order: 0 },
  "Raw Footage":                { family: "Additional Deliverables", label: "Raw Footage",               order: 1 },
  "Raw Footage + Project Files": { family: "Additional Deliverables", label: "Raw Footage + Project Files", order: 2 },

  // ── Success Bundle family ──────────────────────────────────
  "Success Bundle (GIFs + Stills)":  { family: "Success Bundle", label: "GIFs + Stills",       order: 0 },
  "Success Bundle Play Button GIF":  { family: "Success Bundle", label: "Play Button GIF",     order: 1 },
  "Success Bundle Stills":           { family: "Success Bundle", label: "Stills",              order: 2 },
};

// ── Version suffix patterns (checked in priority order) ────────────
// Used as fallback when a type is NOT in FAMILY_OVERRIDES.

const VERSION_SUFFIXES = [
  { pattern: /\s+V1\s*\+\s*Loom\s*&\s*Animatic\s*$/i, key: -1 },
  { pattern: /\s+V1\s*\+\s*Loom\s*$/i, key: 0 },
  { pattern: /\s+V1\s*$/i, key: 1 },
  { pattern: /\s+V2\s*$/i, key: 2 },
  { pattern: /\s+V3\s*$/i, key: 3 },
  { pattern: /\s+Potential\s+Master\s*$/i, key: 4 },
  { pattern: /\s+Finalize\s*$/i, key: 5 },
  { pattern: /\s+Final\s*$/i, key: 5 },
];

const NO_SUFFIX_KEY = 10;
const UNKNOWN_SUFFIX_KEY = 99;

// ── Public helpers ─────────────────────────────────────────────────

/**
 * Extract the base "family" name from a deliverable type string.
 *
 * Checks explicit overrides first, then falls back to stripping
 * known version suffixes from the end of the string.
 *
 *   "Edit V1"              → "Edit"           (override)
 *   "Potential Master"     → "Edit"           (override)
 *   "AV Script V1 + Loom"  → "AV Script"      (suffix strip)
 *   "Competitive Analysis"  → "Competitive Analysis" (no suffix)
 */
export function extractFamilyName(deliverableType: string): string {
  if (!deliverableType) return "Other";

  const override = FAMILY_OVERRIDES[deliverableType.trim()];
  if (override) return override.family;

  for (const { pattern } of VERSION_SUFFIXES) {
    if (pattern.test(deliverableType)) {
      return deliverableType.replace(pattern, "").trim();
    }
  }
  return deliverableType.trim();
}

/**
 * Get a numeric sort key for a deliverable type so that variants
 * within a family are ordered logically.
 */
export function getVersionSortKey(deliverableType: string): number {
  if (!deliverableType) return UNKNOWN_SUFFIX_KEY;

  const override = FAMILY_OVERRIDES[deliverableType.trim()];
  if (override) return override.order;

  for (const { pattern, key } of VERSION_SUFFIXES) {
    if (pattern.test(deliverableType)) return key;
  }
  return NO_SUFFIX_KEY;
}

/**
 * Extract a human-readable variant label for display in the UI.
 *
 *   "Edit V1"              → "V1"             (override)
 *   "Potential Master"     → "Potential Master" (override)
 *   "AV Script V1 + Loom"  → "V1 + Loom"       (suffix strip)
 *   "Competitive Analysis"  → null              (no suffix)
 */
export function extractVersionSuffix(deliverableType: string): string | null {
  if (!deliverableType) return null;

  const override = FAMILY_OVERRIDES[deliverableType.trim()];
  if (override) return override.label;

  const family = extractFamilyName(deliverableType);
  if (family === deliverableType.trim()) return null;
  return deliverableType.slice(family.length).trim();
}

// ── Grouping ───────────────────────────────────────────────────────

export interface TemplateFamily {
  familyName: string;
  templates: DeliverySnippetTemplate[];
}

/**
 * Group templates by deliverable-type family and sort:
 * - Families are sorted alphabetically
 * - Variants within each family are sorted by version order
 */
export function groupTemplatesByFamily(
  templates: DeliverySnippetTemplate[]
): TemplateFamily[] {
  const map = new Map<string, DeliverySnippetTemplate[]>();

  for (const t of templates) {
    const family = extractFamilyName(t.deliverableType || "");
    if (!map.has(family)) map.set(family, []);
    map.get(family)!.push(t);
  }

  // Sort variants within each family by version order
  for (const variants of map.values()) {
    variants.sort(
      (a, b) =>
        getVersionSortKey(a.deliverableType) -
        getVersionSortKey(b.deliverableType)
    );
  }

  // Build sorted array of families (alphabetical)
  const families: TemplateFamily[] = [];
  const sortedKeys = Array.from(map.keys()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  for (const key of sortedKeys) {
    families.push({ familyName: key, templates: map.get(key)! });
  }

  return families;
}
