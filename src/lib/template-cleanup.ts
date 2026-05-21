/**
 * Magic cleanup for delivery templates.
 *
 * This is more than a markdown formatter — it enforces the Consume Media
 * delivery-template standard. Pass it a snippet (plus optional context
 * like the deliverable type and department) and it returns a reshaped
 * snippet matching the canonical structure.
 *
 * Behaviour summary:
 *
 *  1. Structural cleanup
 *     - Section headers = the shallowest `#`-level used in the template.
 *       Anything deeper (`###`, `**bold**` whole-line) is dropped as a
 *       redundant sub-header. `**[varName]**` (bold-wrapped template
 *       variable) is NOT treated as a header.
 *     - Under each header, every non-blank line becomes a bullet item.
 *       Lines ending with `:` stay as prose intros (e.g. "we're most
 *       focused on:"). Already-bulleted lines are preserved; `* ` markers
 *       normalize to `- `.
 *     - Content above the first header (greeting) is left mostly alone.
 *     - Exactly one blank line between sections. Header rows sit directly
 *       above their body.
 *
 *  2. Section-specific rewrites
 *     - `## 🔔 Scope & Timeline Reminders` → canonical bullets
 *       (Revision Rounds / Feedback Windows / Feedback Deadline / +1).
 *     - `## ⏭️ Next Step` → removed entirely (header + body).
 *     - `## 🗓 Project Plan` → canonical
 *       `- [View real-time progress | projectPlanLink]`.
 *     - `## 🔗 Review Link` → auto-filled with the right review-link
 *       variable for the deliverable. Default mapping:
 *         * Final Delivery → `[Final delivery | googleDeliverableLink]`
 *         * Pre-Pro / Pre-Production → `[Document | googleDeliverableLink]`
 *         * Animatic-named → `[Animatic | animaticReviewLink]`
 *         * Otherwise (post-pro non-final) → `[Frame review | frameReviewLink]`
 *       Plus: if "loom" appears anywhere in the snippet, also include
 *       `[Loom walkthrough | loomReviewLink]`.
 *
 *  3. Greeting/preamble fixes
 *     - Deprecated `[contact]` (no 's') in the greeting → `[contactFirstName]`.
 *     - `[versionNotes]` is guaranteed to live between the greeting and
 *       the first section header. If it already exists, kept in place.
 *
 *  Idempotent: `magicCleanup(magicCleanup(x)) === magicCleanup(x)`.
 */

const HEADER_HASH = /^(#{1,3})\s+\S/;
const HEADER_BOLD_LINE = /^\*\*[^*]+\*\*\s*$/;
const BULLET_LINE = /^\s*[-*]\s+\S/;
const TEMPLATE_VAR = /\[[^\]]+\]/;
const VERSION_NOTES_LINE = /\[versionNotes\]/;

interface MagicCleanupOptions {
  /** ClickUp Deliverable Type (e.g. "Edit V1", "Final Delivery", "Animatic V1"). */
  deliverableType?: string;
  /** ClickUp Department (e.g. "Post", "Pre-Pro", "Design"). */
  department?: string;
}

/** Hash level (1/2/3), 99 for bold-only-line, null otherwise. */
function headerLevel(line: string): number | null {
  const hash = line.match(HEADER_HASH);
  if (hash) return hash[1].length;
  const trimmed = line.trim();
  // A whole-line bold counts as a section header ONLY if it doesn't wrap
  // a template variable. `**[versionNotes]**` is a bolded variable, not
  // a sub-header — dropping it as a header would silently delete the var.
  if (HEADER_BOLD_LINE.test(trimmed) && !TEMPLATE_VAR.test(trimmed)) return 99;
  return null;
}

interface Section {
  /** null for the implicit pre-header section (greeting). */
  header: string | null;
  bodyLines: string[];
}

function splitIntoSections(lines: string[]): Section[] {
  let primaryLevel = Infinity;
  for (const line of lines) {
    const lvl = headerLevel(line);
    if (lvl !== null && lvl < primaryLevel) primaryLevel = lvl;
  }
  const sections: Section[] = [];
  let current: Section = { header: null, bodyLines: [] };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const lvl = headerLevel(line);
    if (lvl === primaryLevel) {
      sections.push(current);
      current = { header: line.trim(), bodyLines: [] };
    } else if (lvl !== null) {
      // Deeper header — drop it; body stays in parent.
      continue;
    } else {
      current.bodyLines.push(line);
    }
  }
  sections.push(current);
  return sections;
}

function splitIntoBlocks(lines: string[]): string[][] {
  const blocks: string[][] = [];
  let buf: string[] = [];
  for (const line of lines) {
    if (line.trim() === "") {
      if (buf.length > 0) {
        blocks.push(buf);
        buf = [];
      }
    } else {
      buf.push(line);
    }
  }
  if (buf.length > 0) blocks.push(buf);
  return blocks;
}

function isBulletList(block: string[]): boolean {
  return block.every((l) => BULLET_LINE.test(l));
}

/**
 * Under a header, walk each line in a multi-line block. Lines that look
 * like a "prose intro" (end with `:`) stay as prose; everything else
 * becomes a `- ` bullet item. Already-bulleted lines stay bullets.
 */
function bulletizeUnderHeader(block: string[]): string[] {
  return block.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (/^[-*]\s+/.test(trimmed)) {
      return trimmed.replace(/^[*]\s+/, "- ");
    }
    // Prose intro line (ends with colon) stays as prose
    if (trimmed.endsWith(":")) return trimmed;
    return `- ${trimmed}`;
  });
}

function processBlock(block: string[], underHeader: boolean): string[] {
  if (isBulletList(block)) {
    return block.map((l) => l.replace(/^(\s*)[*]\s+/, "$1- "));
  }
  if (!underHeader) {
    // Greeting / pre-header content — leave alone.
    return block;
  }
  // Under a header — aggressively bullet.
  if (block.length === 1) {
    const trimmed = block[0].trim();
    return trimmed.endsWith(":") ? [trimmed] : [`- ${trimmed}`];
  }
  return bulletizeUnderHeader(block);
}

/** Strip emoji, markdown markers, and trim — used for matching section titles. */
function normalizeHeader(s: string): string {
  return s
    .replace(/[​‌‍﻿]/g, "")
    .replace(/[#*_`]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F100}-\u{1F1FF}]/gu, "")
    .toLowerCase()
    .trim();
}

const SCOPE_BULLETS = [
  "- **Revision Rounds:** 1 of [revisionRounds]",
  "- **Feedback Windows:** [feedbackWindows]",
  "- **Feedback Deadline:** EOD [nextFeedbackDeadline]",
  "- Additional revisions beyond the included revision rounds will require a scope adjustment.",
];

const PROJECT_PLAN_BULLET = "- [View real-time progress | projectPlanLink]";

function buildReviewLinkBullets(
  fullText: string,
  options: MagicCleanupOptions
): string[] {
  const dt = (options.deliverableType ?? "").toLowerCase();
  const dept = (options.department ?? "").toLowerCase();
  const text = fullText.toLowerCase();

  const bullets: string[] = [];

  // Primary link — single deliverable per template
  if (dt.includes("final delivery")) {
    bullets.push("- [Final delivery | googleDeliverableLink]");
  } else if (dt.includes("animatic")) {
    bullets.push("- [Animatic | animaticReviewLink]");
  } else if (dept.includes("pre")) {
    bullets.push("- [Document | googleDeliverableLink]");
  } else {
    bullets.push("- [Frame review | frameReviewLink]");
  }

  // Loom is additive — if mentioned anywhere in the snippet, include a
  // loom walkthrough bullet too.
  if (text.includes("loom")) {
    bullets.push("- [Loom walkthrough | loomReviewLink]");
  }

  return bullets;
}

/**
 * Apply our section-specific rewrites. Operates on parsed sections; the
 * caller is responsible for rendering them back to markdown.
 */
function applySectionTransforms(
  sections: Section[],
  options: MagicCleanupOptions,
  fullText: string
): Section[] {
  const out: Section[] = [];
  for (const section of sections) {
    if (!section.header) {
      out.push(section);
      continue;
    }
    const name = normalizeHeader(section.header);

    // Drop "Next Step" sections entirely (header + body)
    if (/next ?step/.test(name)) continue;

    // Scope & Timeline → canonical bullets
    if (/scope/.test(name) && /timeline/.test(name)) {
      out.push({ header: section.header, bodyLines: SCOPE_BULLETS.slice() });
      continue;
    }

    // Project Plan → canonical bullet
    if (/project ?plan/.test(name)) {
      out.push({ header: section.header, bodyLines: [PROJECT_PLAN_BULLET] });
      continue;
    }

    // Review Link → injected variable(s)
    if (/review ?link/.test(name)) {
      out.push({
        header: section.header,
        bodyLines: buildReviewLinkBullets(fullText, options),
      });
      continue;
    }

    out.push(section);
  }
  return out;
}

/**
 * Ensure `[versionNotes]` lives in the greeting (pre-header) section.
 * If it already does, no-op. If it lives elsewhere, move it to the end
 * of the pre-header section. If it doesn't exist at all, append it.
 */
function ensureVersionNotesPlacement(sections: Section[]): Section[] {
  let foundInPreHeader = false;
  const moves: Array<{ si: number; li: number }> = [];

  for (let si = 0; si < sections.length; si++) {
    const s = sections[si];
    for (let li = 0; li < s.bodyLines.length; li++) {
      if (VERSION_NOTES_LINE.test(s.bodyLines[li])) {
        if (s.header === null) foundInPreHeader = true;
        else moves.push({ si, li });
      }
    }
  }

  const result = sections.map((s, si) => ({
    header: s.header,
    bodyLines: s.bodyLines.filter(
      (_, li) => !moves.some((m) => m.si === si && m.li === li)
    ),
  }));

  const preHeaderIdx = result.findIndex((s) => s.header === null);
  // Only insert [versionNotes] if there's an actual greeting in the pre-
  // header section. Templates that start straight with a `##` section
  // shouldn't have version notes auto-injected.
  const hasGreeting =
    preHeaderIdx >= 0 &&
    result[preHeaderIdx].bodyLines.some((l) => l.trim().length > 0);

  if (hasGreeting && !foundInPreHeader) {
    if (
      result[preHeaderIdx].bodyLines.length > 0 &&
      result[preHeaderIdx].bodyLines[
        result[preHeaderIdx].bodyLines.length - 1
      ] !== ""
    ) {
      result[preHeaderIdx].bodyLines.push("");
    }
    result[preHeaderIdx].bodyLines.push("[versionNotes]");
  }
  return result;
}

const GREETING_LINE = /^\s*(hello|hi|hey|greetings)\b/i;
const DEADLINE_HINT =
  /\b(deadline|submit\b[^.]*\bby\b|feedback\b[^.]*\bby\b)/i;

/** Replace deprecated greeting variables in the pre-header section only. */
function fixGreetingVariables(sections: Section[]): Section[] {
  return sections.map((s) => {
    if (s.header !== null) return s;
    return {
      header: null,
      bodyLines: s.bodyLines.map((line) => {
        // [contact] (without trailing 's') → [contactFirstName]
        let out = line.replace(
          /\[contact\](?!s|FirstName|Name|Names)/gi,
          "[contactFirstName]"
        );
        // [automated] as a greeting placeholder → [contacts]. Legacy
        // artifact from templates drafted with a stand-in name. We only
        // touch lines that LOOK like a greeting ("Hello/Hey/Hi …") so
        // we don't accidentally collide with deadline-context lines
        // that happen to live in the pre-header section.
        if (GREETING_LINE.test(out)) {
          out = out.replace(/\[automated\]/gi, "[contacts]");
        }
        return out;
      }),
    };
  });
}

/**
 * Replace `[automated]` placeholders in deadline-context sentences with
 * `[nextFeedbackDeadline]`. Runs across ALL sections, but only on
 * lines that mention "deadline", "submit … by", or "feedback … by".
 * Any other stray `[automated]` is left for the linter to surface — we
 * don't want to silently rewrite a placeholder whose intent we can't
 * be sure of.
 */
function fixDeadlineAutomatedPlaceholder(sections: Section[]): Section[] {
  return sections.map((s) => ({
    header: s.header,
    bodyLines: s.bodyLines.map((line) =>
      DEADLINE_HINT.test(line)
        ? line.replace(/\[automated\]/gi, "[nextFeedbackDeadline]")
        : line
    ),
  }));
}

function renderSections(sections: Section[]): string {
  const output: string[] = [];
  for (const section of sections) {
    const blocks = splitIntoBlocks(section.bodyLines);
    const processed = blocks.map((b) =>
      processBlock(b, section.header !== null)
    );

    if (section.header !== null) {
      if (output.length > 0) output.push("");
      output.push(section.header);
    }

    for (let i = 0; i < processed.length; i++) {
      output.push(...processed[i]);
      if (i < processed.length - 1) output.push("");
    }
  }
  while (output.length > 0 && output[output.length - 1] === "") output.pop();
  while (output.length > 0 && output[0] === "") output.shift();
  return output.join("\n");
}

export function magicCleanup(
  input: string,
  options: MagicCleanupOptions = {}
): string {
  const lines = input.split("\n");
  let sections = splitIntoSections(lines);
  // Deadline placeholder first — it's the more specific of the two
  // `[automated]` rewrites and runs across all sections. Then the
  // greeting pass picks up whatever's left in the pre-header.
  sections = fixDeadlineAutomatedPlaceholder(sections);
  sections = fixGreetingVariables(sections);
  sections = ensureVersionNotesPlacement(sections);
  sections = applySectionTransforms(sections, options, input);
  return renderSections(sections);
}
