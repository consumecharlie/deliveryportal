/**
 * Client-facing labels for the portal. Pure, no I/O.
 *
 * A share task ("Share Video Edit01 with Client") sits under a parent task
 * that names the real deliverable ("Post-Production - Leaders of Code - Ep
 * #21"). These helpers turn those internal names into what a client reads.
 */
import { extractFamilyName } from "@/lib/template-families";

const DEPARTMENT_PREFIX = /^(?:post-production|pre-production|pre-pro|design|production)\s*[-|:]\s*/i;
const SHARE_PREFIX = /^share\s+/i;
const WITH_CLIENT_SUFFIX = /(?:^|\s+)with\s+client$/i;

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Parent task names that name a phase or department rather than a
 * deliverable ("Post-Production", "Post"). Such a parent says nothing a
 * client needs, so title, key and rail sublabel fall back to the share task.
 */
export const PHASE_ONLY_WORDS: ReadonlySet<string> = new Set([
  "post-production",
  "post production",
  "post-pro",
  "pre-production",
  "pre production",
  "pre-pro",
  "production",
  "design",
  "editing",
  "animation",
  "post",
  "pre",
]);

/** The parent name minus a leading department prefix, or "" when nothing informative is left. */
export function informativeParentName(parentName: string | null | undefined): string {
  const raw = collapse(parentName ?? "");
  if (!raw) return "";
  const stripped = raw.replace(DEPARTMENT_PREFIX, "").trim();
  if (!stripped || PHASE_ONLY_WORDS.has(stripped.toLowerCase())) return "";
  return stripped;
}

/** True when the parent task name is missing, only a prefix, or a phase word. */
export function isPhaseOnlyParent(parentName: string | null | undefined): boolean {
  return informativeParentName(parentName) === "";
}

/**
 * The deliverable's title from its parent task name, minus a leading
 * department prefix ("Post-Production - ", "Design: ", ...). Falls back to
 * `fallbackFamily` when there is no usable parent name (missing, blank, or a
 * phase-only word such as "Post-Production").
 */
export function deliverableTitle(parentName: string | null, fallbackFamily: string): string {
  return informativeParentName(parentName) || fallbackFamily;
}

/**
 * The variant carried by the share task name ("Share Snippets Edit01 with
 * Client" -> "Snippets Edit01"). Null when the name adds nothing beyond the
 * deliverable type (or its family), so the UI can omit the second line.
 */
export function variantLabel(shareTaskName: string | null, deliverableType: string): string | null {
  const stripped = collapse(
    collapse(shareTaskName ?? "").replace(SHARE_PREFIX, "").replace(WITH_CLIENT_SUFFIX, "")
  );
  if (!stripped) return null;
  const lower = stripped.toLowerCase();
  if (lower === collapse(deliverableType).toLowerCase()) return null;
  if (lower === collapse(extractFamilyName(deliverableType)).toLowerCase()) return null;
  return stripped;
}

const VERSION_TOKEN =
  /^(?:v\d+|\d+|edit\d*|final|finals|deliverable|deliverables|delivery|potential|master|masters|&|\+|and|with|of|-|\/)$/i;

function words(s: string): string[] {
  return collapse(s).toLowerCase().split(" ").filter(Boolean);
}

/**
 * What is left of the variant once the deliverable type's own words and
 * version markers are removed: "Video Edit01" -> "video", "Snippets Edit01"
 * -> "snippets", "Final Deliverables" -> "". Two share tasks under the same
 * parent are versions of one deliverable when their stems match, and
 * different deliverables when they differ.
 */
export function variantStem(shareTaskName: string | null, deliverableType: string): string {
  const variant = variantLabel(shareTaskName, deliverableType);
  if (!variant) return "";
  const typeWords = new Set([...words(deliverableType), ...words(extractFamilyName(deliverableType))]);
  return words(variant)
    .filter((w) => !typeWords.has(w) && !VERSION_TOKEN.test(w))
    .join(" ");
}

/** Pure version markers (unlike VERSION_TOKEN, "edit" alone is a word, not a version). */
const VERSION_MARKER = /^(?:v\d+|\d+|edit\d+|final|finals|potential|master|masters)$/i;

/** The version markers in a label, lowercased: "LoC Edit V1" -> ["v1"]. */
export function versionMarkers(label: string): string[] {
  return words(label).filter((w) => VERSION_MARKER.test(w));
}

/**
 * Words that say nothing about which deliverable a name refers to: the
 * share / feedback task boilerplate, generic deliverable words and version
 * markers. What is left ("video", "snippets") identifies the deliverable.
 */
const GENERIC_WORDS: ReadonlySet<string> = new Set([
  "edit", "edits", "final", "finals", "delivery", "deliverable", "deliverables",
  "feedback", "approval", "received", "confirm", "or", "with", "client", "share",
  "the", "and", "a", "an", "of", "for",
]);

/** Identity tokens of any task name: lowercased alphanumeric words minus generic words and version markers. */
export function nameTokens(text: string | null | undefined): string[] {
  return (text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !GENERIC_WORDS.has(w) && !VERSION_MARKER.test(w));
}

/**
 * Identity tokens of a delivery, from its share task's variant ("Share
 * Video Edit01 with Client" -> ["video"]) or, without one, its type.
 */
export function deliverableIdentityTokens(shareTaskName: string | null, deliverableType: string): string[] {
  return nameTokens(variantLabel(shareTaskName, deliverableType) ?? deliverableType);
}

/** The label minus version markers, lowercased: "Post Script AV V1" -> "post script av". */
export function stripVersionTokens(label: string): string {
  return words(label)
    .filter((w) => !VERSION_MARKER.test(w))
    .join(" ");
}

/**
 * Grouping key for a delivery: the parent task when it names a deliverable,
 * else the type family; either refined by the variant stem when the share
 * task name carries one, so two deliverables under one parent stay apart.
 */
export function deliverableKey(row: {
  parentTaskId: string | null;
  parentTaskName: string | null;
  shareTaskName: string | null;
  deliverableType: string;
}): string {
  const base =
    row.parentTaskId && !isPhaseOnlyParent(row.parentTaskName)
      ? row.parentTaskId
      : `family:${extractFamilyName(row.deliverableType)}`;
  const stem = variantStem(row.shareTaskName, row.deliverableType);
  return stem ? `${base}:${stem}` : base;
}

/**
 * The line under the client name: "2 projects in progress, 1 completed",
 * "4 completed", or "" when there is nothing to count.
 */
export function countsLine(counts: { inProgress: number; completed: number }): string {
  const parts: string[] = [];
  if (counts.inProgress > 0) {
    parts.push(`${counts.inProgress} ${counts.inProgress === 1 ? "project" : "projects"} in progress`);
  }
  if (counts.completed > 0) parts.push(`${counts.completed} completed`);
  return parts.join(", ");
}

/** Label under a roadmap pellet: the variant when it exists, else the type. */
export function milestoneLabel(shareTaskName: string | null, deliverableType: string): string {
  return variantLabel(shareTaskName, deliverableType) ?? deliverableType;
}

const LINK_LABELS: Record<string, string> = {
  frameReviewLink: "Frame.io review",
  googleDeliverableLink: "Google Drive",
  loomReviewLink: "Loom walkthrough",
  animaticReviewLink: "Animatic",
  flexLink: "Review link",
};

/** Client-facing label for a delivery link, by template variable name; the stored label otherwise. */
export function linkLabel(variableName: string | null | undefined, storedLabel: string): string {
  return (variableName && LINK_LABELS[variableName]) || storedLabel;
}
