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
  // Every hash-based header (`#`, `##`, or `###`) starts a section,
  // regardless of level. Mixed-level inputs are common in production
  // — e.g., a template might have `## Scope & Timeline` and
  // `### Review Link` as siblings. Previously we'd pick the
  // shallowest level as the only "real" section header and drop
  // everything deeper, which silently deleted the Review Link and
  // Project Plan sections in mixed-level templates. (See AV Script
  // V2 audit incident on 2026-05-21.)
  //
  // Bold-only-line "headers" (the `**Foo**` style, headerLevel == 99)
  // are still dropped as sub-headers, since those weren't real
  // sections in the first place. Subsection leftovers like
  // `### Scope` inside a `## Scope & Timeline Reminders` are filtered
  // out separately via `dropNestedSubsections` below.
  const sections: Section[] = [];
  let current: Section = { header: null, bodyLines: [] };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const lvl = headerLevel(line);
    if (lvl !== null && lvl <= 3) {
      sections.push(current);
      current = { header: line.trim(), bodyLines: [] };
    } else if (lvl !== null) {
      // Bold-only-line sub-header — drop it; body stays in parent.
      continue;
    } else {
      current.bodyLines.push(line);
    }
  }
  sections.push(current);
  return sections;
}

/**
 * Filter out sections that look like leftover subsections of the
 * previous (parent) section. Heuristic: if every word of a section's
 * name appears as a word in the previous section's name, the section
 * is treated as a subsection and dropped. Catches the common pattern
 * of `### Scope` / `### Timeline` nested inside
 * `## Scope & Timeline Reminders`.
 */
function dropNestedSubsections(sections: Section[]): Section[] {
  const result: Section[] = [];
  let lastSectionName: string | null = null;
  for (const section of sections) {
    if (section.header === null) {
      result.push(section);
      continue;
    }
    const name = normalizeHeader(section.header);
    if (lastSectionName) {
      const words = name.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
      const allWordsInPrior =
        words.length > 0 &&
        words.every((w) =>
          new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
            lastSectionName!
          )
        );
      if (allWordsInPrior) continue; // drop this subsection
    }
    result.push(section);
    lastSectionName = name;
  }
  return result;
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

/**
 * Derive the current round number from a deliverable type, or flag it
 * as the "final" stage where revisions are complete.
 *
 *   "Edit V1 - Animated"     → { round: 1 }
 *   "Edit V2 - Animated"     → { round: 2 }
 *   "Edit02"                  → { round: 2 }
 *   "AV Script V1 + Loom"    → { round: 1 }
 *   "Audio Script Final"     → "final"
 *   "Final Delivery"          → "final"
 *   "Raw Footage"             → { round: 1 }   (default — no version hint)
 */
function inferRoundContext(
  deliverableType: string | undefined
): { round: number } | "final" {
  const dt = (deliverableType ?? "").trim();
  if (!dt) return { round: 1 };

  // "Final" anywhere in the deliverable type — Final Delivery, Audio
  // Script Final, Caption & Title Design Presets Final, etc.
  if (/\bfinal\b/i.test(dt)) return "final";

  // V<digits> (case-insensitive) — covers "V1", "V2", "v3"
  const vMatch = dt.match(/\bV(\d+)\b/i);
  if (vMatch) return { round: parseInt(vMatch[1], 10) };

  // Trailing two-digit suffix used in some types: "Edit01", "Edit02"
  const trailingMatch = dt.match(/(?:Edit|AV\s*Script|Audio\s*Script)\s*0?(\d+)/i);
  if (trailingMatch) return { round: parseInt(trailingMatch[1], 10) };

  return { round: 1 };
}

function buildScopeBullets(
  options: MagicCleanupOptions
): string[] {
  const ctx = inferRoundContext(options.deliverableType);
  if (ctx === "final") {
    // Final-stage templates: revisions are done, language pivots to
    // "approval" (still backed by the same underlying variables).
    return [
      "- **Revision Rounds:** At this stage, all revision rounds have been completed.",
      "- **Approval Window:** [feedbackWindows]",
      "- **Approval Deadline:** EOD [nextFeedbackDeadline]",
      "- Additional revision rounds may affect scope, and delayed feedback may affect project timeline.",
    ];
  }
  return [
    `- **Revision Rounds:** ${ctx.round} of [revisionRounds]`,
    "- **Feedback Windows:** [feedbackWindows]",
    "- **Feedback Deadline:** EOD [nextFeedbackDeadline]",
    "- Additional revisions beyond the included revision rounds will require a scope adjustment.",
  ];
}

const PROJECT_PLAN_BULLET = "- [View real-time progress | projectPlanLink]";

interface ReviewLinkSpec {
  varName: string;
  defaultLabel: string;
}

/**
 * Which link variables MUST appear in the Review Link section for this
 * deliverable type / department. The label paired with each is only a
 * default — if the section already has a bullet using that variable,
 * the human-chosen label is preserved by `reconcileReviewLinkBullets`.
 */
function getRequiredReviewLinks(
  fullText: string,
  options: MagicCleanupOptions
): ReviewLinkSpec[] {
  const dt = (options.deliverableType ?? "").toLowerCase();
  const dept = (options.department ?? "").toLowerCase();
  const text = fullText.toLowerCase();

  const required: ReviewLinkSpec[] = [];

  if (dt.includes("final delivery")) {
    required.push({
      varName: "googleDeliverableLink",
      defaultLabel: "Final delivery",
    });
  } else if (dt.includes("animatic")) {
    required.push({ varName: "animaticReviewLink", defaultLabel: "Animatic" });
  } else if (dept.includes("pre")) {
    required.push({
      varName: "googleDeliverableLink",
      defaultLabel: "Document",
    });
  } else {
    required.push({ varName: "frameReviewLink", defaultLabel: "Frame review" });
  }

  // Loom is additive — if mentioned anywhere in the snippet, include a
  // loom walkthrough bullet too.
  if (text.includes("loom")) {
    required.push({
      varName: "loomReviewLink",
      defaultLabel: "Loom walkthrough",
    });
  }

  return required;
}

/**
 * Build the Review Link section's body lines.
 *
 *   For each REQUIRED link variable:
 *     - if the existing section already has a bullet using that
 *       variable, preserve it (label and any trailing CTA text).
 *       Normalize the bullet marker to `-`.
 *     - otherwise, inject a canonical bullet with the default label.
 *
 * Bullets that use variables NOT in the required set are dropped —
 * Magic Cleanup's job is to enforce which links are present.
 */
function reconcileReviewLinkBullets(
  existingLines: string[],
  fullText: string,
  options: MagicCleanupOptions
): string[] {
  const required = getRequiredReviewLinks(fullText, options);

  // Parse existing bullets, preserving order.
  interface ExistingBullet {
    label: string;
    varName: string;
    full: string;
  }
  const existing: ExistingBullet[] = [];
  for (const rawLine of existingLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const m = trimmed.match(
      /^[-*]?\s*\[([^|\]]+?)\s*\|\s*(\w+)\](.*)$/
    );
    if (!m) continue;
    const label = m[1].trim();
    const variable = m[2];
    const trailing = m[3].trim();
    const full = trailing
      ? `- [${label} | ${variable}] ${trailing}`
      : `- [${label} | ${variable}]`;
    existing.push({ label, varName: variable, full });
  }

  const existingByVar = new Map(existing.map((b) => [b.varName, b]));
  const requiredVarSet = new Set(required.map((r) => r.varName));

  // Orphan bullets: their variable isn't in the required set, so the
  // bullet itself is being dropped. Their LABELS might still be
  // reusable for required vars we're injecting fresh (e.g. an existing
  // `[AV Script Final | frameReviewLink]` for an AV-Script-Final
  // template should donate "AV Script Final" to the new
  // googleDeliverableLink bullet instead of falling back to "Document").
  const orphanLabels = existing
    .filter((b) => !requiredVarSet.has(b.varName))
    .map((b) => b.label);

  const unmatchedRequired = required.filter(
    (r) => !existingByVar.has(r.varName)
  );

  return required.map((req) => {
    const found = existingByVar.get(req.varName);
    if (found) return found.full;
    // Required but missing — donate an orphan label if there's a
    // positional one available. Otherwise fall back to the default.
    const unmatchedIdx = unmatchedRequired.findIndex(
      (r) => r.varName === req.varName
    );
    const inheritedLabel = orphanLabels[unmatchedIdx] ?? null;
    const label = inheritedLabel ?? req.defaultLabel;
    return `- [${label} | ${req.varName}]`;
  });
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

    // Scope & Timeline → canonical bullets (round-number-aware,
    // with a Final variant for the last delivery in a series).
    if (/scope/.test(name) && /timeline/.test(name)) {
      out.push({
        header: section.header,
        bodyLines: buildScopeBullets(options),
      });
      continue;
    }

    // Project Plan → canonical bullet
    if (/project ?plan/.test(name)) {
      out.push({ header: section.header, bodyLines: [PROJECT_PLAN_BULLET] });
      continue;
    }

    // Review Link → reconcile existing bullets against required link
    // variables. Preserves human-chosen labels (e.g. "Final Audio
    // Script") whenever the existing bullet already uses the correct
    // link variable; only injects defaults for missing required links.
    if (/review ?link/.test(name)) {
      out.push({
        header: section.header,
        bodyLines: reconcileReviewLinkBullets(
          section.bodyLines,
          fullText,
          options
        ),
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

/**
 * All section headers render as bold H3 (`### **content**`) regardless
 * of the level they arrived at. Strips any existing `#` prefix and any
 * outer `**…**` wrapping before re-wrapping, so the transform is
 * idempotent on its own output.
 */
function normalizeSectionHeader(header: string): string {
  let content = header.replace(/^#+\s*/, "").trim();
  // Strip outer bold wrapper if present (handles `## **🔔 Foo**` inputs)
  const boldMatch = content.match(/^\*\*(.+)\*\*$/);
  if (boldMatch) content = boldMatch[1].trim();
  return `### **${content}**`;
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
      output.push(normalizeSectionHeader(section.header));
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
  // Filter out subsection leftovers (e.g. `### Scope` nested inside
  // `## Scope & Timeline Reminders`) BEFORE running the canonical
  // transforms, otherwise those subsections survive cleanup with stale
  // content while the parent gets canonicalized.
  sections = dropNestedSubsections(sections);
  // Deadline placeholder first — it's the more specific of the two
  // `[automated]` rewrites and runs across all sections. Then the
  // greeting pass picks up whatever's left in the pre-header.
  sections = fixDeadlineAutomatedPlaceholder(sections);
  sections = fixGreetingVariables(sections);
  sections = ensureVersionNotesPlacement(sections);
  sections = applySectionTransforms(sections, options, input);
  return renderSections(sections);
}
