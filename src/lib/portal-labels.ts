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
 * The deliverable's title from its parent task name, minus a leading
 * department prefix ("Post-Production - ", "Design: ", ...). Falls back to
 * `fallbackFamily` when there is no usable parent name.
 */
export function deliverableTitle(parentName: string | null, fallbackFamily: string): string {
  const raw = collapse(parentName ?? "");
  if (!raw) return fallbackFamily;
  const stripped = raw.replace(DEPARTMENT_PREFIX, "").trim();
  return stripped || fallbackFamily;
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
