/**
 * Template merge engine for delivery snippets.
 *
 * Handles [variable] and [Link Text | variableName] placeholder replacement
 * and produces both email (markdown) and Slack (mrkdwn) versions.
 */

import type { MergedContent, ProjectContact } from "./types";

interface MergeVariables {
  contacts: ProjectContact[];
  projectName: string;
  versionNotes: string;
  revisionRounds: string;
  feedbackWindows: string;
  nextFeedbackDeadline: string;
  googleDeliverableLink?: string;
  frameReviewLink?: string;
  animaticReviewLink?: string;
  loomReviewLink?: string;
  flexLink?: string;
  projectPlanLink?: string;
  // Extra links added via the portal
  extraLinks?: Array<{ url: string; label: string }>;
  // Rushed project: injects a strict deadline notice after the feedback deadline bullet
  rushedProject?: boolean;
}

/**
 * Format contact names for email (first names only).
 * "John and Jane" or "John, Jane, and Bob"
 */
function formatContactsEmail(contacts: ProjectContact[]): string {
  const names = contacts
    .sort((a, b) => (a.role === "Primary" ? -1 : b.role === "Primary" ? 1 : 0))
    .filter((c) => c.role !== "Log")
    .map((c) => c.name);

  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/**
 * Format contacts for Slack (using @mentions where possible).
 * Exported for use at send time.
 */
export function formatContactsSlack(contacts: ProjectContact[]): string {
  const mentions = contacts
    .sort((a, b) => (a.role === "Primary" ? -1 : b.role === "Primary" ? 1 : 0))
    .filter((c) => c.role !== "Log")
    .map((c) => {
      if (c.slackUserId) return `<@${c.slackUserId}>`;
      if (c.slackHandle) return `@${c.slackHandle}`;
      return c.name;
    });

  if (mentions.length === 0) return "";
  if (mentions.length === 1) return mentions[0];
  if (mentions.length === 2) return `${mentions[0]} and ${mentions[1]}`;
  return `${mentions.slice(0, -1).join(", ")}, and ${mentions[mentions.length - 1]}`;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Core template replacement.
 * Handles both [variable] and [Link Text | variableName] patterns.
 */
function performMerge(
  template: string,
  replacements: Record<string, string>
): string {
  let result = template;

  // Handle [Link Text | variableName] patterns in two passes:
  //
  // Pass 1: Standalone links at the start of a bullet/line (e.g. "- [Edit V1 | frameReviewLink]")
  //   → Enrich with project name: "- [ProjectName – Edit V1](url)"
  //   These are "reference links" in the Review Link section.
  //
  // Pass 2: Remaining inline links within sentences (e.g. "...in [Frame.io | frameReviewLink].")
  //   → Plain link text: "[Frame.io](url)"
  //   These already have surrounding context and don't need the project name.

  const projectName = replacements.projectName || "";

  // Pass 1: Standalone bullet/line links — enrich with project name
  const standaloneLinkPattern = /^(\s*[-•*]\s*)\[([^\]|]+)\s*\|\s*([^\]]+)\]/gm;
  result = result.replace(
    standaloneLinkPattern,
    (_match, prefix: string, linkText: string, varName: string) => {
      const trimmedVar = varName.trim();
      const url = replacements[trimmedVar];
      if (!url) return ""; // Remove the entire bullet if no URL
      const text = linkText.trim();
      const enrichedText =
        projectName && !text.toLowerCase().includes(projectName.toLowerCase())
          ? `${projectName} – ${text}`
          : text;
      return `${prefix}[${enrichedText}](${url})`;
    }
  );

  // Pass 2: Remaining inline link patterns — no project name enrichment
  const inlineLinkPattern = /\[([^\]|]+)\s*\|\s*([^\]]+)\]/g;
  result = result.replace(inlineLinkPattern, (_match, linkText: string, varName: string) => {
    const trimmedVar = varName.trim();
    const url = replacements[trimmedVar];
    if (!url) return ""; // Remove the placeholder if no URL
    return `[${linkText.trim()}](${url})`;
  });

  // Handle simple [variable] patterns
  for (const [key, value] of Object.entries(replacements)) {
    const pattern = new RegExp(`\\[${escapeRegExp(key)}\\]`, "g");
    result = result.replace(pattern, value);
  }

  // Clean up empty bullet points (lines that are just "- " or "• " after removing empty vars)
  result = result.replace(/^[\s]*[-•]\s*$/gm, "");

  // Clean up multiple consecutive blank lines
  result = result.replace(/\n{3,}/g, "\n\n");

  return result.trim();
}

/**
 * Unicode → Slack shortcode emoji map.
 * Used by convertToSlackFormat() and available for reverse-mapping in preview renderers.
 */
export const SLACK_EMOJI_MAP: Record<string, string> = {
  "\u{1F6A8}": ":rotating_light:",
  "\u{2705}": ":white_check_mark:",
  "\u{1F4E9}": ":envelope_with_arrow:",
  "\u{1F4CB}": ":clipboard:",
  "\u{1F517}": ":link:",
  "\u{1F4C5}": ":date:",
  "\u{1F4DD}": ":memo:",
  "\u{26A1}": ":zap:",
  "\u{2B50}": ":star:",
  "\u{1F4E5}": ":inbox_tray:",
  "\u{1F514}": ":bell:",
  "\u{1F4C1}": ":file_folder:",
  "\u{1F4E6}": ":package:",
  "\u{1F680}": ":rocket:",
  "\u{1F525}": ":fire:",
  "\u{1F4AC}": ":speech_balloon:",
  "\u{1F3AF}": ":dart:",
  "\u{2757}": ":exclamation:",
  "\u{2753}": ":question:",
  "\u{1F4A1}": ":bulb:",
  "\u{1F389}": ":tada:",
  "\u{1F44D}": ":thumbsup:",
  "\u{270F}": ":pencil2:",
  "\u{1F4CE}": ":paperclip:",
};

/**
 * Convert email markdown to Slack mrkdwn format.
 * Exported so the send route can call it at send time.
 */
export function convertToSlackFormat(markdown: string): string {
  let result = markdown;

  // ── 0. Strip zero-width characters (BOM, ZWNJ, ZWJ, ZWSP) ──
  // TipTap sometimes inserts these during editing round-trips.
  result = result.replace(/[\u200B\u200C\u200D\uFEFF]/g, "");

  // ── 1. Mentions: @[DisplayName](userId) → <@userId> ──
  // Must run before link conversion since the syntax is similar.
  result = result.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, "<@$2>");

  // ── 2. Bold: **text** → *text* ──
  // TipTap often places trailing whitespace inside <strong> tags, producing
  // "**text: **rest" instead of "**text:** rest". We capture any trailing
  // whitespace inside the markers and move it outside so Slack renders the
  // bold correctly (Slack requires * to be adjacent to non-whitespace).
  result = result.replace(/\*\*(.+?)(\s*)\*\*/g, (_match, inner: string, ws: string) => {
    const trimmed = inner.trimEnd();
    // Re-add a single space if there was any whitespace between content and **
    const trailingSpace = ws || inner.length > trimmed.length ? " " : "";
    return `*${trimmed}*${trailingSpace}`;
  });

  // ── 3. Links: [text](url) → <url|text> ──
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>");

  // ── 4. Bullet points: - text → indented • text ──
  // Use em-space (U+2003) for left indent to mimic Slack's native bullet
  // indentation. Em-spaces are wider than regular spaces and Slack preserves
  // them reliably. Two em-spaces ≈ the visual indent of real Slack bullets.
  result = result.replace(/^- /gm, "\u2003\u2003•\u2002");

  // ── 5. Headers: # text → *text* ──
  // Strip any existing bold markers from header content to avoid double-wrapping
  // (e.g. ## **⚡ text** → step 2 makes ## *⚡ text* → this step would make **⚡ text**)
  result = result.replace(/^[ \t]*#{1,3}\s+(.+)$/gm, (_match, content: string) => {
    const stripped = content.replace(/\*/g, "").trim();
    return `*${stripped}*`;
  });

  // ── 6. Emoji conversions (Unicode → Slack shortcodes) ──
  for (const [emoji, shortcode] of Object.entries(SLACK_EMOJI_MAP)) {
    result = result.replaceAll(emoji, shortcode);
  }
  // Also handle emoji + variation selector (e.g. ⚡️ = ⚡ + U+FE0F)
  result = result.replace(/\uFE0F/g, "");

  return result;
}

/**
 * Merge a delivery snippet template with variables.
 * Returns both email (markdown) and Slack (mrkdwn) versions.
 */
export function mergeTemplate(
  template: string,
  subjectLine: string,
  variables: MergeVariables
): MergedContent {
  // Build the replacements dictionary
  const replacements: Record<string, string> = {
    contacts: formatContactsEmail(variables.contacts),
    projectName: variables.projectName,
    versionNotes: variables.versionNotes,
    revisionRounds: variables.revisionRounds,
    feedbackWindows: variables.feedbackWindows,
    nextFeedbackDeadline: variables.nextFeedbackDeadline,
    googleDeliverableLink: variables.googleDeliverableLink ?? "",
    frameReviewLink: variables.frameReviewLink ?? "",
    animaticReviewLink: variables.animaticReviewLink ?? "",
    loomReviewLink: variables.loomReviewLink ?? "",
    flexLink: variables.flexLink ?? "",
    projectPlanLink: variables.projectPlanLink ?? "",
  };

  // Replace the feedback deadline bullet with a rushed project notice
  function injectRushedNotice(content: string): string {
    if (!variables.rushedProject) return content;
    const deadline = variables.nextFeedbackDeadline || "the feedback deadline";
    const rushedLine = `- 🚨 **Hard Deadline Project:** Please submit feedback by **EOD ${deadline}**. The window closes at the start of the next business day (Eastern Time) and at which time we will proceed to keep the project timeline on track. If you need extra time, just let us know — but note that the delivery date will shift or rush fees will apply.`;

    const lines = content.split("\n");
    const idx = lines.findIndex(
      (line) =>
        line.toLowerCase().includes("feedback deadline") &&
        (line.startsWith("-") || line.startsWith("•") || line.includes("**Feedback Deadline"))
    );
    if (idx >= 0) {
      // Replace the existing feedback deadline line
      lines[idx] = rushedLine;
      return lines.join("\n");
    }
    // Fallback: append if no deadline line found
    return content + "\n" + rushedLine;
  }

  // Merge the email version
  let emailContent = performMerge(template, replacements);
  emailContent = injectRushedNotice(emailContent);

  // Append extra links as additional bullets
  if (variables.extraLinks?.length) {
    const extraBullets = variables.extraLinks
      .map((link) => `- [${link.label}](${link.url})`)
      .join("\n");
    emailContent += `\n${extraBullets}`;
  }

  // Build Slack version: same markdown as email, but with @mention tokens
  // for contacts. The actual Slack mrkdwn conversion happens at send time.
  const slackReplacements = {
    ...replacements,
    contacts: formatContactsSlack(variables.contacts),
  };
  let slackContent = performMerge(template, slackReplacements);
  slackContent = injectRushedNotice(slackContent);

  // Append extra links (same markdown format as email)
  if (variables.extraLinks?.length) {
    const extraBullets = variables.extraLinks
      .map((link) => `- [${link.label}](${link.url})`)
      .join("\n");
    slackContent += `\n${extraBullets}`;
  }

  // Merge subject line
  const mergedSubject = performMerge(subjectLine, replacements);

  return {
    emailContent,
    slackContent,
    subjectLine: mergedSubject,
  };
}

/**
 * Extract template variable names from a snippet body.
 * Returns both simple [var] and link [Text | var] variable names.
 */
export function extractTemplateVariables(template: string): string[] {
  const variables = new Set<string>();

  // Match [Link Text | variableName]
  const linkPattern = /\[[^\]|]+\|\s*([^\]]+)\]/g;
  let match;
  while ((match = linkPattern.exec(template)) !== null) {
    variables.add(match[1].trim());
  }

  // Match simple [variableName] (excluding ones that look like markdown links)
  const simplePattern = /\[([a-zA-Z][a-zA-Z0-9]*)\]/g;
  while ((match = simplePattern.exec(template)) !== null) {
    variables.add(match[1]);
  }

  return Array.from(variables);
}

/**
 * Determine which link fields are needed for a given template.
 */
export function getRequiredLinkFields(template: string): string[] {
  const allVars = extractTemplateVariables(template);
  const linkVarNames = [
    "frameReviewLink",
    "animaticReviewLink",
    "loomReviewLink",
    "googleDeliverableLink",
    "flexLink",
  ];
  return linkVarNames.filter((v) => allVars.includes(v));
}
