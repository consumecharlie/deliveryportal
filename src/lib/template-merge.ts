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
  // Repeat client: strips "What You're Receiving" and "We Need Your Feedback" sections
  repeatClient?: boolean;
  // Custom link labels — overrides the template's [Link Text | varName] defaults
  linkLabels?: Record<string, string>;
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
  replacements: Record<string, string>,
  linkLabels?: Record<string, string>,
  // Resolves which project name to use when enriching a standalone link for a
  // given variable. Defaults to the single `projectName` replacement. Combined
  // (add-on) merges pass a resolver so namespaced add-on links get the add-on's
  // project name instead of the primary's.
  projectNameFor?: (varName: string) => string
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

  const resolveProjectName =
    projectNameFor ?? (() => replacements.projectName || "");

  // Pass 1: Standalone bullet/line links — enrich with project name
  const standaloneLinkPattern = /^(\s*[-•*]\s*)\[([^\]|]+)\s*\|\s*([^\]]+)\]/gm;
  result = result.replace(
    standaloneLinkPattern,
    (_match, prefix: string, linkText: string, varName: string) => {
      const trimmedVar = varName.trim();
      const url = replacements[trimmedVar];
      if (!url) return ""; // Remove the entire bullet if no URL
      // Use custom label if provided, otherwise use template default
      const text = linkLabels?.[trimmedVar]?.trim() || linkText.trim();
      const projectName = resolveProjectName(trimmedVar);
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
    const text = linkLabels?.[trimmedVar]?.trim() || linkText.trim();
    return `[${text}](${url})`;
  });

  // Handle simple [variable] patterns
  for (const [key, value] of Object.entries(replacements)) {
    const pattern = new RegExp(`\\[${escapeRegExp(key)}\\]`, "g");
    result = result.replace(pattern, value);
  }

  // Fix broken bold around links: **text **[**link**](url)*** → **text [link](url)**
  // This happens when TipTap's htmlToMarkdown wraps bold on each text node separately,
  // producing adjacent/overlapping bold markers around markdown links.
  // Step 1: Remove bold markers wrapping only the link text inside [**...**](url)
  result = result.replace(/\[\*\*([^\]]+?)\*\*\]/g, "[$1]");
  // Step 2: Collapse adjacent bold end+start: "**foo **[" → "**foo ["
  result = result.replace(/\*\*(\s*)\*\*/g, "$1");
  // Step 3: Clean trailing triple+ asterisks (from overlapping bold closers)
  result = result.replace(/\*{3,}/g, "**");

  // Clean up empty bullet points (lines that are just "- " or "• " after removing empty vars)
  result = result.replace(/^[\s]*[-•]\s*$/gm, "");

  // Clean up multiple consecutive blank lines
  result = result.replace(/\n{3,}/g, "\n\n");

  return result.trim();
}

/**
 * Insert extra bullet lines into the "Review Link(s)" section of a merged
 * snippet. Falls back to appending at the end of the content when no such
 * section exists. Skips silently when there are no bullets to insert.
 */
function injectReviewLinkBullets(content: string, bullets: string[]): string {
  if (bullets.length === 0) return content;

  const lines = content.split("\n");
  const headerPattern = /^\s*#{1,3}\s/;
  const reviewHeader = /review\s*link/i;

  const headerIdx = lines.findIndex(
    (line) => headerPattern.test(line) && reviewHeader.test(line)
  );

  if (headerIdx === -1) {
    return `${content}\n${bullets.join("\n")}`.replace(/\n{3,}/g, "\n\n");
  }

  // Find the end of the section: next header or end of content.
  let endIdx = lines.length;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (headerPattern.test(lines[i])) {
      endIdx = i;
      break;
    }
  }

  // Find the last bullet within the section.
  let lastBulletIdx = -1;
  for (let i = endIdx - 1; i > headerIdx; i--) {
    if (/^\s*[-•*]\s/.test(lines[i])) {
      lastBulletIdx = i;
      break;
    }
  }

  let insertIdx: number;
  if (lastBulletIdx >= 0) {
    insertIdx = lastBulletIdx + 1;
  } else {
    // No bullets yet — insert before any trailing blank lines that pad the
    // section, so the new bullets sit immediately after the header content.
    insertIdx = endIdx;
    while (insertIdx > headerIdx + 1 && lines[insertIdx - 1].trim() === "") {
      insertIdx--;
    }
  }

  lines.splice(insertIdx, 0, ...bullets);
  return lines.join("\n");
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

  // ── 7. Normalize blank lines ──
  // Slack renders each \n as a line break. Multiple blank lines between
  // sections create excessive spacing. Collapse 3+ consecutive newlines
  // (2+ blank lines) down to 2 newlines (1 blank line).
  result = result.replace(/\n{3,}/g, "\n\n");

  return result.trim();
}

// Strip explainer sections ("What you're receiving", "We need your feedback",
// and the "Typical feedback might include" sub-section) for repeat clients.
function stripRepeatClientSections(content: string, repeatClient?: boolean): string {
  if (!repeatClient) return content;
  const lines = content.split("\n");
  const result: string[] = [];
  // "section" = skip until next ## header; "subsection" = skip until next blank line or header
  let skipMode: "none" | "section" | "subsection" = "none";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isHeader = /^#{1,3}\s/.test(line) || /^\*\*.*\*\*$/.test(line.trim());
    const lower = line.toLowerCase();
    const cleaned = lower.replace(/[*#]/g, "").trim();

    // Check for section-level headers to skip (skip until next ## header)
    if (isHeader) {
      if (
        (lower.includes("what you") && lower.includes("receiving")) ||
        (lower.includes("we need") && lower.includes("feedback"))
      ) {
        skipMode = "section";
        continue;
      }
      // Any other header ends section-level skip
      if (skipMode === "section") {
        skipMode = "none";
      }
    }

    // Check for "Typical feedback might include" sub-section
    if (cleaned.includes("typical feedback") && cleaned.includes("include")) {
      skipMode = "subsection";
      continue;
    }

    // End subsection skip at blank line or header
    if (skipMode === "subsection" && (line.trim() === "" || isHeader)) {
      skipMode = "none";
      // Keep the blank line or header that ended the skip
      if (isHeader) {
        result.push(line);
      }
      continue;
    }

    if (skipMode === "none") {
      result.push(line);
    }
  }

  // Clean up excessive blank lines from removed sections
  return result.join("\n").replace(/\n{3,}/g, "\n\n");
}

// Replace the feedback deadline bullet with a rushed project notice.
function injectRushedNotice(
  content: string,
  opts: { rushedProject?: boolean; nextFeedbackDeadline: string; revisionRounds: string }
): string {
  if (!opts.rushedProject) return content;
  const deadline = opts.nextFeedbackDeadline || "the feedback deadline";
  // Determine if this is the final revision round by checking the merged content
  // Looks for "N of M" pattern in the revision rounds line
  const revisionMatch = content.match(/(\d+)\s+of\s+(\d+)/i);
  const isFinalRound = revisionMatch
    ? revisionMatch[1] === revisionMatch[2]
    : opts.revisionRounds === "1";

  const rushedBullets = [
    ``,
    `### 🚨 URGENT: Fixed Deadline Alert`,
    `- Feedback deadline is **EOD ${deadline}**`,
    `- Our team will proceed the following business day regardless of whether feedback has been received.`,
    ...(isFinalRound
      ? [`- Because this is the final revision round, if feedback has not been received by the deadline, we will proceed to the next step.`]
      : [
          `- If feedback has not been received by the deadline, the current revision round will be considered complete and the next revision round will begin. Any feedback provided after the deadline will apply to the next revision round.`,
        ]),
    `- This is necessary to keep the project timeline on track and hit the fixed deadline.`,
    `- If your team needs more time, the delivery date will be delayed or rushed fees will apply.`,
  ];

  const lines = content.split("\n");

  // Find and replace the feedback deadline line
  const idx = lines.findIndex(
    (line) =>
      line.toLowerCase().includes("feedback deadline") &&
      (line.startsWith("-") || line.startsWith("•") || line.includes("**Feedback Deadline"))
  );
  if (idx >= 0) {
    lines.splice(idx, 1, ...rushedBullets);
  } else {
    // Fallback: append
    lines.push("", ...rushedBullets);
  }

  // Remove "Additional revisions beyond the included revision rounds" bullet
  const filtered = lines.filter(
    (line) => !line.toLowerCase().includes("additional revisions beyond the included revision rounds")
  );

  return filtered.join("\n");
}

// When the feedback window is "Flexible", a hard "EOD <date>" deadline reads as
// a contradiction. Reframe the deadline bullet as a soft target tied to the
// project plan, keeping the date as guidance rather than a fixed cutoff.
// Skipped for rushed projects, which intentionally assert a fixed deadline
// (injectRushedNotice owns that line in that case).
function injectFlexibleFeedbackNotice(
  content: string,
  opts: {
    feedbackWindows: string;
    rushedProject?: boolean;
    nextFeedbackDeadline: string;
  }
): string {
  const isFlexible = opts.feedbackWindows?.trim().toLowerCase() === "flexible";
  if (!isFlexible || opts.rushedProject) return content;

  const date = opts.nextFeedbackDeadline?.trim();
  const value = date
    ? `Flexible. We're aiming for ~${date} to stay aligned with the project plan, but this can flex with your team's timeline.`
    : `Flexible. We'll target a date based on the project plan and stay flexible to your team's timeline.`;

  const lines = content.split("\n");
  const idx = lines.findIndex(
    (line) =>
      (line.toLowerCase().includes("feedback deadline") ||
        line.toLowerCase().includes("approval deadline")) &&
      (line.startsWith("-") || line.startsWith("•") || line.includes("Deadline"))
  );
  if (idx >= 0) {
    // Preserve the bullet prefix + bold label, replace only the value after it.
    const labelMatch = lines[idx].match(/^(\s*[-•]\s*\*\*[^*]*?\*\*)/);
    lines[idx] = labelMatch
      ? `${labelMatch[1]} ${value}`
      : `- **Feedback Deadline:** ${value}`;
  }

  return lines.join("\n");
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
  // Derive primary contact info for individual contact variables
  const primaryContact = variables.contacts.find((c) => c.role === "Primary") ?? variables.contacts[0];
  const contactName = primaryContact?.name ?? "";
  const contactFirstName = contactName.split(/\s+/)[0] ?? "";

  // Build the replacements dictionary
  const replacements: Record<string, string> = {
    contacts: formatContactsEmail(variables.contacts),
    contactFirstName,
    contactName,
    projectName: variables.projectName,
    versionNotes: variables.versionNotes,
    revisionRounds: variables.revisionRounds,
    feedbackWindows: variables.feedbackWindows,
    nextFeedbackDeadline: variables.nextFeedbackDeadline,
    feedbackDeadline: variables.nextFeedbackDeadline, // alias
    googleDeliverableLink: variables.googleDeliverableLink ?? "",
    frameReviewLink: variables.frameReviewLink ?? "",
    animaticReviewLink: variables.animaticReviewLink ?? "",
    loomReviewLink: variables.loomReviewLink ?? "",
    flexLink: variables.flexLink ?? "",
    projectPlanLink: variables.projectPlanLink ?? "",
  };

  // Build the bullet lines that should appear inside the Review Links section
  // for fields the template itself doesn't render: an unplaced flexLink and any
  // user-added extra links.
  const templateHasFlexLinkPlaceholder = /\|\s*flexLink\s*\]/.test(template);
  const reviewLinkBullets: string[] = [];

  if (variables.flexLink && !templateHasFlexLinkPlaceholder) {
    const customLabel = variables.linkLabels?.flexLink?.trim();
    const baseText = customLabel || variables.projectName || "Review Link";
    const text =
      variables.projectName &&
      !baseText.toLowerCase().includes(variables.projectName.toLowerCase())
        ? `${variables.projectName} – ${baseText}`
        : baseText;
    reviewLinkBullets.push(`- [${text}](${variables.flexLink})`);
  }

  if (variables.extraLinks?.length) {
    for (const link of variables.extraLinks) {
      if (!link.url) continue;
      const label = link.label?.trim() || "Link";
      reviewLinkBullets.push(`- [${label}](${link.url})`);
    }
  }

  const rushedOpts = {
    rushedProject: variables.rushedProject,
    nextFeedbackDeadline: variables.nextFeedbackDeadline,
    revisionRounds: variables.revisionRounds,
  };
  const flexibleOpts = {
    feedbackWindows: variables.feedbackWindows,
    rushedProject: variables.rushedProject,
    nextFeedbackDeadline: variables.nextFeedbackDeadline,
  };

  // Merge the email version
  let emailContent = performMerge(template, replacements, variables.linkLabels);
  emailContent = stripRepeatClientSections(emailContent, variables.repeatClient);
  emailContent = injectRushedNotice(emailContent, rushedOpts);
  emailContent = injectFlexibleFeedbackNotice(emailContent, flexibleOpts);
  emailContent = injectReviewLinkBullets(emailContent, reviewLinkBullets);

  // Build Slack version: same markdown as email, but with @mention tokens
  // for contacts. The actual Slack mrkdwn conversion happens at send time.
  const slackReplacements = {
    ...replacements,
    contacts: formatContactsSlack(variables.contacts),
  };
  let slackContent = performMerge(template, slackReplacements, variables.linkLabels);
  slackContent = stripRepeatClientSections(slackContent, variables.repeatClient);
  slackContent = injectRushedNotice(slackContent, rushedOpts);
  slackContent = injectFlexibleFeedbackNotice(slackContent, flexibleOpts);
  slackContent = injectReviewLinkBullets(slackContent, reviewLinkBullets);

  // Merge subject line
  const mergedSubject = performMerge(subjectLine, replacements);

  return {
    emailContent,
    slackContent,
    subjectLine: mergedSubject,
  };
}

// ── Add-on project merge ──

export interface AddonMergeInput {
  // Primary project (already merged)
  primaryProjectName: string;
  primaryContent: string; // Already merged email or slack content
  // Add-on project
  addonProjectName: string;
  addonDeliverableType?: string; // e.g. "Voiceover Script" — used in the transition line
  /** True when the add-on is the same project as the primary (same listId).
   *  When set, the transition line names the deliverable type instead of
   *  repeating the project name, and the shared project plan is deduped. */
  sameProject?: boolean;
  addonTemplate: string; // Raw template snippet
  addonContacts: ProjectContact[];
  addonVariables: {
    revisionRounds: string;
    feedbackWindows: string;
    nextFeedbackDeadline: string;
    googleDeliverableLink?: string;
    frameReviewLink?: string;
    animaticReviewLink?: string;
    loomReviewLink?: string;
    flexLink?: string;
    projectPlanLink?: string;
    linkLabels?: Record<string, string>;
    extraLinks?: Array<{ url: string; label: string }>;
    repeatClient?: boolean;
  };
  // Mode
  isSlack: boolean;
}

interface ParsedSection {
  header: string;
  content: string;
}

/**
 * Parse merged content into sections by detecting markdown headers.
 * Returns greeting, named sections, and closing text.
 */
function parseSections(content: string): {
  greeting: string;
  sections: ParsedSection[];
  closing: string;
} {
  const lines = content.split("\n");
  const headerPattern = /^#{1,3}\s+/;

  // Find the first header index
  let firstHeaderIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerPattern.test(lines[i])) {
      firstHeaderIdx = i;
      break;
    }
  }

  if (firstHeaderIdx === -1) {
    // No headers found — treat everything as greeting
    return { greeting: content, sections: [], closing: "" };
  }

  const greeting = lines.slice(0, firstHeaderIdx).join("\n").trimEnd();

  // Parse sections
  const sections: ParsedSection[] = [];
  let currentHeader = "";
  let currentLines: string[] = [];

  for (let i = firstHeaderIdx; i < lines.length; i++) {
    if (headerPattern.test(lines[i])) {
      if (currentHeader) {
        sections.push({
          header: currentHeader,
          content: currentLines.join("\n").trimEnd(),
        });
      }
      currentHeader = lines[i];
      currentLines = [];
    } else {
      currentLines.push(lines[i]);
    }
  }

  // Push last section
  if (currentHeader) {
    sections.push({
      header: currentHeader,
      content: currentLines.join("\n").trimEnd(),
    });
  }

  // Identify closing: anything after the last recognized section that looks
  // like a sign-off (doesn't start with a header keyword we care about)
  let closing = "";
  const recognizedPatterns = [
    /scope|timeline/i,
    /review.*link/i,
    /feedback|submit/i,
    /project\s*plan/i,
  ];

  // Walk backwards to find the last recognized section
  let lastRecognizedIdx = -1;
  for (let i = sections.length - 1; i >= 0; i--) {
    const headerLower = sections[i].header.toLowerCase().replace(/[#*]/g, "");
    if (recognizedPatterns.some((p) => p.test(headerLower))) {
      lastRecognizedIdx = i;
      break;
    }
  }

  if (lastRecognizedIdx >= 0 && lastRecognizedIdx < sections.length - 1) {
    // Everything after the last recognized section is closing
    const closingSections = sections.splice(lastRecognizedIdx + 1);
    closing = closingSections
      .map((s) => `${s.header}\n${s.content}`)
      .join("\n")
      .trim();
  }

  return { greeting, sections, closing };
}

function findSection(
  sections: ParsedSection[],
  pattern: RegExp
): ParsedSection | undefined {
  return sections.find((s) => {
    const cleaned = s.header.toLowerCase().replace(/[#*]/g, "");
    return pattern.test(cleaned);
  });
}

/**
 * Merge a combined delivery for a primary + add-on project.
 *
 * @deprecated The delivery form now uses {@link buildCombinedTemplate} +
 * {@link mergeCombinedTemplate} so the combined message is an editable template
 * (with tokens) that stays reactive to form fields. This merge-then-stitch
 * version is retained for reference/tests only.
 *
 * Strategy (based on real-world reference):
 * 1. Keep the primary project's full content (greeting + all sections)
 * 2. Remove project plan from the primary (it goes at the end, shared)
 * 3. Add a transition intro line
 * 4. Include the add-on project's full merged content (all sections — NOT stripped)
 *    minus its greeting, closing, and project plan
 * 5. Append shared project plan (with links from both projects) + closing once
 */
export function mergeAddonDelivery(input: AddonMergeInput): string {
  const {
    primaryProjectName,
    primaryContent,
    addonProjectName,
    addonDeliverableType,
    sameProject,
    addonTemplate,
    addonContacts,
    addonVariables,
    isSlack,
  } = input;

  // 1. Parse primary content into sections
  const primary = parseSections(primaryContent);

  // 2. Merge the addon template, honoring repeatClient so addon explainer
  //    sections get stripped the same way the primary's are.
  const addonMerged = mergeTemplate(addonTemplate, "", {
    contacts: addonContacts,
    projectName: addonProjectName,
    versionNotes: "",
    revisionRounds: addonVariables.revisionRounds,
    feedbackWindows: addonVariables.feedbackWindows,
    nextFeedbackDeadline: addonVariables.nextFeedbackDeadline,
    googleDeliverableLink: addonVariables.googleDeliverableLink,
    frameReviewLink: addonVariables.frameReviewLink,
    animaticReviewLink: addonVariables.animaticReviewLink,
    loomReviewLink: addonVariables.loomReviewLink,
    flexLink: addonVariables.flexLink,
    projectPlanLink: addonVariables.projectPlanLink,
    extraLinks: addonVariables.extraLinks,
    linkLabels: addonVariables.linkLabels,
    repeatClient: addonVariables.repeatClient,
  });

  const addonContent = isSlack
    ? addonMerged.slackContent
    : addonMerged.emailContent;

  // 3. Parse addon content into sections
  const addon = parseSections(addonContent);

  // 4. Extract project plan from primary (to place at end, shared)
  const primaryPlanIdx = primary.sections.findIndex((s) =>
    /project\s*plan/i.test(s.header.toLowerCase().replace(/[#*]/g, ""))
  );
  const primaryPlan =
    primaryPlanIdx >= 0 ? primary.sections.splice(primaryPlanIdx, 1)[0] : null;

  // Extract project plan from addon (to merge links into shared plan)
  const addonPlanIdx = addon.sections.findIndex((s) =>
    /project\s*plan/i.test(s.header.toLowerCase().replace(/[#*]/g, ""))
  );
  const addonPlan =
    addonPlanIdx >= 0 ? addon.sections.splice(addonPlanIdx, 1)[0] : null;

  // 5. Build combined output
  const parts: string[] = [];

  // Primary greeting
  if (primary.greeting) {
    parts.push(primary.greeting);
  }

  // All primary sections (everything except project plan, which was removed)
  for (const section of primary.sections) {
    parts.push("");
    parts.push(section.header);
    if (section.content) {
      parts.push(section.content);
    }
  }

  // Transition intro to addon delivery.
  // Same project → name the deliverable type (the project name was already
  // said in the greeting, so don't repeat it). Different project → name the
  // other project as before.
  parts.push("");
  const bold = isSlack ? "*" : "**";
  if (sameProject && addonDeliverableType) {
    parts.push(
      `Second, we also have the ${bold}${addonDeliverableType}${bold} ready for your review!`
    );
  } else {
    parts.push(
      `Second, we also have ${bold}${addonProjectName}${bold} deliverables ready for your review!`
    );
  }

  // All addon sections (everything except greeting, closing, and project plan)
  for (const section of addon.sections) {
    parts.push("");
    parts.push(section.header);
    if (section.content) {
      parts.push(section.content);
    }
  }

  // Shared project plan (once, with links from both projects)
  if (primaryPlan || addonPlan) {
    const plan = primaryPlan || addonPlan;
    parts.push("");
    parts.push(plan!.header);
    let planContent = plan!.content || "";
    // If both projects have plan content, merge the addon's link bullets —
    // but dedupe by URL so an identical project-plan link (common when the
    // add-on is the same project) doesn't appear twice.
    if (primaryPlan && addonPlan?.content) {
      const urlOf = (line: string) => line.match(/\(([^)]+)\)\s*$/)?.[1]?.trim() ?? null;
      const existingUrls = new Set(
        planContent
          .split("\n")
          .map(urlOf)
          .filter((u): u is string => u !== null)
      );
      const addonPlanBullets = addonPlan.content
        .split("\n")
        .filter((line) => /^\s*[-•*]\s*\[/.test(line))
        .filter((line) => {
          const url = urlOf(line);
          if (url && existingUrls.has(url)) return false;
          if (url) existingUrls.add(url);
          return true;
        });
      if (addonPlanBullets.length > 0) {
        planContent += "\n" + addonPlanBullets.join("\n");
      }
    }
    if (planContent) {
      parts.push(planContent);
    }
  }

  // Closing (from primary)
  if (primary.closing) {
    parts.push("");
    parts.push(primary.closing);
  }

  return parts
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Combined editable template (merged delivery, edit-the-template model) ──
//
// For merged deliveries the user edits ONE combined template that still holds
// `[tokens]`, so links/scope keep flowing in after editing. Because the primary
// and the add-on each have their own value for the same variable name (e.g.
// both have a `googleDeliverableLink`), the add-on's per-project tokens are
// namespaced with the `addon:` prefix so they don't collide. Contact tokens are
// shared (a merged delivery always shares one primary contact) and are NOT
// namespaced.

/** Prefix applied to the add-on project's per-project variable tokens. */
export const ADDON_NS = "addon:";

/** Variable names whose value differs between the primary and add-on projects. */
const PER_PROJECT_VARS = [
  "googleDeliverableLink",
  "frameReviewLink",
  "animaticReviewLink",
  "loomReviewLink",
  "flexLink",
  "projectPlanLink",
  "revisionRounds",
  "feedbackWindows",
  "nextFeedbackDeadline",
  "feedbackDeadline",
  "projectName",
  "versionNotes",
]
  // Longest first so e.g. "nextFeedbackDeadline" is considered before "feedbackDeadline".
  .sort((a, b) => b.length - a.length);

/** Rewrite an add-on template's per-project tokens to the `addon:` namespace. */
function namespaceAddonTemplate(template: string): string {
  let result = template;
  for (const v of PER_PROJECT_VARS) {
    const esc = escapeRegExp(v);
    // Link form: "[Label | v]" → "[Label | addon:v]"
    result = result.replace(
      new RegExp(`(\\|\\s*)${esc}(\\s*\\])`, "g"),
      `$1${ADDON_NS}${v}$2`
    );
    // Bare form: "[v]" → "[addon:v]"
    result = result.replace(
      new RegExp(`\\[${esc}\\]`, "g"),
      `[${ADDON_NS}${v}]`
    );
  }
  return result;
}

/**
 * Assemble the default combined TEMPLATE (with tokens) for a merged delivery,
 * mirroring mergeAddonDelivery's structure but operating on the raw templates
 * so the result stays mergeable/reactive. The add-on's per-project tokens are
 * namespaced. This is what the user edits in edit mode; merging it later
 * (mergeCombinedTemplate) resolves both projects' values.
 */
export function buildCombinedTemplate(input: {
  primaryTemplate: string;
  addonTemplate: string;
  addonProjectName: string;
  addonDeliverableType?: string;
  sameProject?: boolean;
}): string {
  const { primaryTemplate, addonTemplate, addonProjectName, addonDeliverableType, sameProject } =
    input;

  const primary = parseSections(primaryTemplate);
  const addon = parseSections(namespaceAddonTemplate(addonTemplate));

  const planMatcher = (s: ParsedSection) =>
    /project\s*plan/i.test(s.header.toLowerCase().replace(/[#*]/g, ""));
  const primaryPlanIdx = primary.sections.findIndex(planMatcher);
  const primaryPlan =
    primaryPlanIdx >= 0 ? primary.sections.splice(primaryPlanIdx, 1)[0] : null;
  const addonPlanIdx = addon.sections.findIndex(planMatcher);
  const addonPlan =
    addonPlanIdx >= 0 ? addon.sections.splice(addonPlanIdx, 1)[0] : null;

  const parts: string[] = [];

  if (primary.greeting) parts.push(primary.greeting);

  for (const section of primary.sections) {
    parts.push("");
    parts.push(section.header);
    if (section.content) parts.push(section.content);
  }

  // Transition. Same project → name the deliverable type (project name was
  // already said in the greeting). Different project → name the other project.
  parts.push("");
  if (sameProject && addonDeliverableType) {
    parts.push(`Second, we also have the **${addonDeliverableType}** ready for your review!`);
  } else {
    parts.push(`Second, we also have **${addonProjectName}** deliverables ready for your review!`);
  }

  for (const section of addon.sections) {
    parts.push("");
    parts.push(section.header);
    if (section.content) parts.push(section.content);
  }

  // Shared project plan. When same project, both plans resolve to the same
  // link, so keep only the primary's. When different, append the add-on's
  // (namespaced) plan bullets.
  if (primaryPlan || addonPlan) {
    const plan = primaryPlan ?? addonPlan;
    parts.push("");
    parts.push(plan!.header);
    let planContent = plan!.content || "";
    if (!sameProject && primaryPlan && addonPlan?.content) {
      const addonBullets = addonPlan.content
        .split("\n")
        .filter((line) => /^\s*[-•*]\s*\[/.test(line));
      if (addonBullets.length > 0) {
        planContent += "\n" + addonBullets.join("\n");
      }
    }
    if (planContent) parts.push(planContent);
  }

  if (primary.closing) {
    parts.push("");
    parts.push(primary.closing);
  }

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Per-project variable values for the combined merge (add-on side). */
export interface CombinedAddonVariables {
  projectName?: string;
  versionNotes?: string;
  revisionRounds: string;
  feedbackWindows: string;
  nextFeedbackDeadline: string;
  googleDeliverableLink?: string;
  frameReviewLink?: string;
  animaticReviewLink?: string;
  loomReviewLink?: string;
  flexLink?: string;
  projectPlanLink?: string;
  linkLabels?: Record<string, string>;
}

/**
 * Merge a combined template (from buildCombinedTemplate, or an edited version
 * of it) by resolving primary tokens from the primary variables and `addon:`
 * namespaced tokens from the add-on variables. Returns email + slack markdown,
 * exactly like mergeTemplate.
 */
export function mergeCombinedTemplate(input: {
  combinedTemplate: string;
  subjectLine: string;
  primaryProjectName: string;
  addonProjectName: string;
  primaryVariables: MergeVariables;
  addonVariables: CombinedAddonVariables;
}): MergedContent {
  const { combinedTemplate, subjectLine, primaryProjectName, addonProjectName } = input;
  const pv = input.primaryVariables;
  const av = input.addonVariables;

  const primaryContact = pv.contacts.find((c) => c.role === "Primary") ?? pv.contacts[0];
  const contactName = primaryContact?.name ?? "";
  const contactFirstName = contactName.split(/\s+/)[0] ?? "";

  // Shared (non-namespaced) replacements + primary's per-project values.
  const baseReplacements: Record<string, string> = {
    contactFirstName,
    contactName,
    projectName: pv.projectName,
    versionNotes: pv.versionNotes,
    revisionRounds: pv.revisionRounds,
    feedbackWindows: pv.feedbackWindows,
    nextFeedbackDeadline: pv.nextFeedbackDeadline,
    feedbackDeadline: pv.nextFeedbackDeadline,
    googleDeliverableLink: pv.googleDeliverableLink ?? "",
    frameReviewLink: pv.frameReviewLink ?? "",
    animaticReviewLink: pv.animaticReviewLink ?? "",
    loomReviewLink: pv.loomReviewLink ?? "",
    flexLink: pv.flexLink ?? "",
    projectPlanLink: pv.projectPlanLink ?? "",
    // Add-on (namespaced) per-project values.
    [`${ADDON_NS}projectName`]: av.projectName ?? addonProjectName,
    [`${ADDON_NS}versionNotes`]: av.versionNotes ?? "",
    [`${ADDON_NS}revisionRounds`]: av.revisionRounds,
    [`${ADDON_NS}feedbackWindows`]: av.feedbackWindows,
    [`${ADDON_NS}nextFeedbackDeadline`]: av.nextFeedbackDeadline,
    [`${ADDON_NS}feedbackDeadline`]: av.nextFeedbackDeadline,
    [`${ADDON_NS}googleDeliverableLink`]: av.googleDeliverableLink ?? "",
    [`${ADDON_NS}frameReviewLink`]: av.frameReviewLink ?? "",
    [`${ADDON_NS}animaticReviewLink`]: av.animaticReviewLink ?? "",
    [`${ADDON_NS}loomReviewLink`]: av.loomReviewLink ?? "",
    [`${ADDON_NS}flexLink`]: av.flexLink ?? "",
    [`${ADDON_NS}projectPlanLink`]: av.projectPlanLink ?? "",
  };

  // Combined link labels: primary under normal keys, add-on under namespaced.
  const linkLabels: Record<string, string> = { ...(pv.linkLabels ?? {}) };
  for (const [k, v] of Object.entries(av.linkLabels ?? {})) {
    linkLabels[`${ADDON_NS}${k}`] = v;
  }

  // Standalone link enrichment uses the owning project's name.
  const projectNameFor = (varName: string) =>
    varName.startsWith(ADDON_NS) ? addonProjectName : primaryProjectName;

  // Primary's unplaced flexLink + user-added extra links (the add-on never
  // carries extra links; its flexLink, if any, renders from its own token).
  const templateHasPrimaryFlexLink = /(^|[^:])\|\s*flexLink\s*\]/.test(combinedTemplate);
  const reviewLinkBullets: string[] = [];
  if (pv.flexLink && !templateHasPrimaryFlexLink) {
    const customLabel = pv.linkLabels?.flexLink?.trim();
    const baseText = customLabel || primaryProjectName || "Review Link";
    const text =
      primaryProjectName && !baseText.toLowerCase().includes(primaryProjectName.toLowerCase())
        ? `${primaryProjectName} – ${baseText}`
        : baseText;
    reviewLinkBullets.push(`- [${text}](${pv.flexLink})`);
  }
  if (pv.extraLinks?.length) {
    for (const link of pv.extraLinks) {
      if (!link.url) continue;
      reviewLinkBullets.push(`- [${link.label?.trim() || "Link"}](${link.url})`);
    }
  }

  const rushedOpts = {
    rushedProject: pv.rushedProject,
    nextFeedbackDeadline: pv.nextFeedbackDeadline,
    revisionRounds: pv.revisionRounds,
  };
  const flexibleOpts = {
    feedbackWindows: pv.feedbackWindows,
    rushedProject: pv.rushedProject,
    nextFeedbackDeadline: pv.nextFeedbackDeadline,
  };

  const run = (contactsValue: string) => {
    const replacements = { ...baseReplacements, contacts: contactsValue };
    let out = performMerge(combinedTemplate, replacements, linkLabels, projectNameFor);
    out = stripRepeatClientSections(out, pv.repeatClient);
    out = injectRushedNotice(out, rushedOpts);
    out = injectFlexibleFeedbackNotice(out, flexibleOpts);
    out = injectReviewLinkBullets(out, reviewLinkBullets);
    return out;
  };

  return {
    emailContent: run(formatContactsEmail(pv.contacts)),
    slackContent: run(formatContactsSlack(pv.contacts)),
    subjectLine: performMerge(subjectLine, { ...baseReplacements, contacts: formatContactsEmail(pv.contacts) }),
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

/**
 * Extract link variables with their default label text from a template.
 * Parses [Link Text | variableName] patterns to get the display label.
 * Returns a map of variableName → defaultLabel.
 */
export function getLinkLabelsFromTemplate(template: string): Record<string, string> {
  const labels: Record<string, string> = {};
  // Match [Link Text | variableName] patterns
  const linkPattern = /\[([^\]|]+)\s*\|\s*(\w+)\]/g;
  let match;
  while ((match = linkPattern.exec(template)) !== null) {
    const label = match[1].trim();
    const varName = match[2].trim();
    labels[varName] = label;
  }
  return labels;
}
