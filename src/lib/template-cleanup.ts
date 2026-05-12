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

const HEADER_HASH = /^#{1,3}\s+\S/;
const HEADER_BOLD = /^\*\*[^*]+\*\*\s*$/;
const BULLET_LINE = /^\s*[-*]\s+\S/;
const TEMPLATE_VAR = /\[[^\]]+\]/;

interface Section {
  /** null only for the implicit pre-header section (greeting, etc.). */
  header: string | null;
  bodyLines: string[];
}

function splitIntoSections(lines: string[]): Section[] {
  // If the template uses real `##`-style headers for sections, bold-only
  // lines are redundant sub-headers (e.g. `**Scope**` nested inside
  // `## 🔔 Scope & Timeline Reminders`) — drop them entirely during cleanup
  // so the section collapses to header + bullets. If the template has no
  // hash headers, bold-only lines still act as section boundaries.
  const hasHashHeaders = lines.some((l) => HEADER_HASH.test(l));
  const sections: Section[] = [];
  let current: Section = { header: null, bodyLines: [] };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (HEADER_HASH.test(line)) {
      sections.push(current);
      current = { header: line.trim(), bodyLines: [] };
    } else if (HEADER_BOLD.test(line.trim())) {
      if (hasHashHeaders) {
        // Drop the bold sub-header; subsequent lines stay in the current
        // section so its body absorbs them.
        continue;
      }
      sections.push(current);
      current = { header: line.trim(), bodyLines: [] };
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
