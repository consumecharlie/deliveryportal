/**
 * Magic cleanup for delivery templates.
 *
 * Rules:
 *  - Section headers are markdown ATX headings (`#`, `##`, `###`) or a whole
 *    line wrapped in `**bold**` markers.
 *  - Under each header, single-line content blocks become bullet items
 *    (`- text`). Multi-line prose blocks are left alone.
 *  - Already-bulleted blocks are preserved; `* ` markers are normalized to
 *    `- ` for consistency.
 *  - Content above the first header (greetings, intros) is left untouched.
 *  - Exactly one blank line separates sections. Header rows always have a
 *    blank line between them and their body.
 *  - Idempotent: `magicCleanup(magicCleanup(x)) === magicCleanup(x)`.
 */

const HEADER_HASH = /^#{1,3}\s+\S/;
const HEADER_BOLD = /^\*\*[^*]+\*\*\s*$/;
const BULLET_LINE = /^\s*[-*]\s+\S/;

function isHeader(line: string): boolean {
  return HEADER_HASH.test(line) || HEADER_BOLD.test(line.trim());
}

interface Section {
  /** null only for the implicit pre-header section (greeting, etc.). */
  header: string | null;
  bodyLines: string[];
}

function splitIntoSections(lines: string[]): Section[] {
  const sections: Section[] = [];
  let current: Section = { header: null, bodyLines: [] };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (isHeader(line)) {
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

function processBlock(block: string[], underHeader: boolean): string[] {
  // Already a bullet list — normalize markers to `-`.
  if (block.every((l) => BULLET_LINE.test(l))) {
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
  for (const section of sections) {
    const blocks = splitIntoBlocks(section.bodyLines);
    const processed = blocks.map((b) =>
      processBlock(b, section.header !== null)
    );

    if (section.header !== null) {
      if (output.length > 0) output.push("");
      output.push(section.header);
      // No blank line between the header and its body — only between sections.
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
