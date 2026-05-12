/**
 * Magic cleanup for delivery templates.
 *
 * Rules:
 *  - Section headers are markdown ATX headings (`#`, `##`, `###`) or a whole
 *    line wrapped in `**bold**` markers. If the template uses real `##`
 *    headers, bold-only lines are treated as redundant sub-headers (e.g.
 *    `**Scope**` inside `## 🔔 Scope & Timeline Reminders`) and dropped.
 *  - Under each header, single-line content blocks become bullet items
 *    (`- text`). Multi-line prose blocks are left alone.
 *  - Already-bulleted blocks are preserved; `* ` markers are normalized to
 *    `- ` for consistency.
 *  - Content above the first header (greetings, intros) is left untouched.
 *  - At the END of the LAST section, trailing prose blocks (no `[...]`
 *    variables, no bullet markers) are left alone — same treatment as the
 *    intro greeting. Only applies when the section also contains at least
 *    one bullet block, so a section that's purely a single prose line
 *    still becomes a bullet.
 *  - Exactly one blank line separates sections. Header rows sit directly
 *    above their body — no blank line between a header and its content.
 *  - Idempotent: `magicCleanup(magicCleanup(x)) === magicCleanup(x)`.
 */

const HEADER_HASH = /^(#{1,3})\s+\S/;
const HEADER_BOLD = /^\*\*[^*]+\*\*\s*$/;
const BULLET_LINE = /^\s*[-*]\s+\S/;
const TEMPLATE_VAR = /\[[^\]]+\]/;

/**
 * Return the header "level" for a line, or `null` if it's not a header.
 *
 * - `# ` → 1, `## ` → 2, `### ` → 3
 * - whole-line `**bold**` → 99 (sentinel — only used as a section boundary
 *   when no `#`-style headers exist anywhere in the template)
 */
function headerLevel(line: string): number | null {
  const hash = line.match(HEADER_HASH);
  if (hash) return hash[1].length;
  if (HEADER_BOLD.test(line.trim())) return 99;
  return null;
}

interface Section {
  /** null only for the implicit pre-header section (greeting, etc.). */
  header: string | null;
  bodyLines: string[];
}

function splitIntoSections(lines: string[]): Section[] {
  // Pick the shallowest header level used anywhere in the template as the
  // "section boundary" level. Deeper headers — `### Scope` inside `## 🔔
  // Scope & Timeline Reminders`, or whole-line `**bold**` sub-headers
  // inside `##` sections — are redundant sub-headers that get dropped
  // during cleanup so their body stays in the parent section.
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
      // A header, but deeper than the primary level → sub-header. Drop it.
      // Its body content stays in the current parent section.
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
 * Heuristic for "does this block carry real list content?" — an existing
 * bullet list, or a single-line block that contains a template variable
 * (and is therefore going to be bulleted by `processBlock`). Used to
 * decide whether the section has enough real content to flip the
 * sign-off-skip behavior on.
 */
function isContentBlock(block: string[]): boolean {
  if (isBulletList(block)) return true;
  if (block.length === 1 && TEMPLATE_VAR.test(block[0])) return true;
  return false;
}

function looksLikeTailProse(block: string[]): boolean {
  // A bulleted block ends the tail.
  if (isBulletList(block)) return false;
  // A block that contains a template variable / link ends the tail
  // (it's a single-line bullet candidate, not a sign-off paragraph).
  if (block.some((l) => TEMPLATE_VAR.test(l))) return false;
  return true;
}

function processBlock(block: string[], underHeader: boolean): string[] {
  // Already a bullet list — normalize markers to `-`.
  if (isBulletList(block)) {
    return block.map((l) => l.replace(/^(\s*)[-*]\s+/, "$1- "));
  }
  // Single-line item under a section header → bullet it.
  if (block.length === 1 && underHeader) {
    return [`- ${block[0].trim()}`];
  }
  // Multi-line prose, or anything before the first header → leave alone.
  return block;
}

export function magicCleanup(input: string): string {
  const lines = input.split("\n");
  const sections = splitIntoSections(lines);

  const output: string[] = [];
  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];
    const blocks = splitIntoBlocks(section.bodyLines);
    const isLastSection = si === sections.length - 1;
    // Only invoke the sign-off-skip behavior when the last section has
    // actual bullet content. Otherwise a single-line note section stays
    // bulletable per the normal rules.
    const sectionHasBullets = blocks.some(isContentBlock);
    const applySignoffSkip = isLastSection && sectionHasBullets;

    // Walk blocks from the end so we can leave trailing prose blocks alone
    // until we hit something that's clearly content (a bullet list or a
    // line carrying a template variable). After that point, process the
    // remaining blocks with the normal rules.
    const processed: string[][] = new Array(blocks.length);
    let inTail = applySignoffSkip;
    for (let bi = blocks.length - 1; bi >= 0; bi--) {
      const block = blocks[bi];
      if (inTail && looksLikeTailProse(block)) {
        processed[bi] = block;
      } else {
        inTail = false;
        processed[bi] = processBlock(block, section.header !== null);
      }
    }

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
