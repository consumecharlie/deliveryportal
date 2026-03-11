/**
 * Bi-directional conversion between portal markdown and ClickUp Quill Delta.
 *
 * ClickUp stores rich text custom fields as `value_richtext` using the
 * Quill Delta JSON format (`{ ops: [...] }`).  This module handles:
 *
 *   markdown → Quill Delta   (for writing to ClickUp)
 *   Quill Delta → markdown   (for reading from ClickUp into the editor)
 *
 * Supported constructs:
 *   **bold**   *italic*   [text](url)   # / ## / ### headings
 *   - bullet lists   1. ordered lists   plain text & newlines
 */

interface QuillOp {
  insert: string | Record<string, unknown>;
  attributes?: Record<string, unknown>;
}

interface QuillDelta {
  ops: QuillOp[];
}

// ══════════════════════════════════════════════════════════════════════
// ── Quill Delta → Markdown ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

/**
 * Convert a ClickUp Quill Delta JSON string (or object) → portal markdown.
 *
 * Handles: bold, italic, links, headings (h1–h3), bullet & ordered lists.
 */
export function quillDeltaToMarkdown(input: string | QuillDelta): string {
  let delta: QuillDelta;
  if (typeof input === "string") {
    try {
      delta = JSON.parse(input);
    } catch {
      // Not valid JSON – return as-is (probably already plain text)
      return input;
    }
  } else {
    delta = input;
  }

  if (!delta?.ops || !Array.isArray(delta.ops)) {
    return typeof input === "string" ? input : "";
  }

  // Step 1: Flatten every op into a sequence of annotated characters.
  // Each "char" carries the insert text + its attributes.
  // When we hit a "\n" we can check its attributes for block-level info.
  const lines: {
    segments: { text: string; attrs?: Record<string, unknown> }[];
    lineAttrs?: Record<string, unknown>;
  }[] = [];

  let currentSegments: { text: string; attrs?: Record<string, unknown> }[] =
    [];

  for (const op of delta.ops) {
    // Handle non-string inserts (e.g. ClickUp emoji embeds like { emoji: "link" })
    if (typeof op.insert !== "string") {
      if (op.insert && typeof op.insert === "object") {
        const embed = op.insert as Record<string, unknown>;
        // ClickUp emoji embed: { emoji: "shortcode" }
        if (embed.emoji) {
          const emojiName = String(embed.emoji);
          // Map common ClickUp emoji shortcodes to Unicode
          const emojiMap: Record<string, string> = {
            link: "🔗",
            rotating_light: "🚨",
            white_check_mark: "✅",
            envelope_with_arrow: "📩",
            clipboard: "📋",
            date: "📅",
            memo: "📝",
            warning: "⚠️",
            star: "⭐",
            fire: "🔥",
            rocket: "🚀",
            eyes: "👀",
            thumbsup: "👍",
            point_right: "👉",
            bulb: "💡",
            heavy_check_mark: "✔️",
            x: "❌",
            arrow_right: "➡️",
            calendar: "📅",
            video_camera: "📹",
            film_frames: "🎞️",
            clapper: "🎬",
            tv: "📺",
            computer: "💻",
            round_pushpin: "📍",
          };
          const unicode = emojiMap[emojiName] ?? `:${emojiName}:`;
          currentSegments.push({ text: unicode, attrs: op.attributes });
        }
      }
      continue;
    }

    const parts = op.insert.split("\n");

    for (let p = 0; p < parts.length; p++) {
      const text = parts[p];

      // Push non-empty text as a segment of the current line
      if (text.length > 0) {
        currentSegments.push({ text, attrs: op.attributes });
      }

      // Every split boundary (except the last part) represents a newline
      if (p < parts.length - 1) {
        // The newline's attributes come from the op (for Quill block formats
        // like headers, lists the attributes are on the "\n" op)
        lines.push({
          segments: currentSegments,
          lineAttrs: text.length === 0 ? op.attributes : undefined,
        });
        currentSegments = [];
      }
    }
  }

  // Flush any remaining segments (text after the last newline)
  if (currentSegments.length > 0) {
    lines.push({ segments: currentSegments });
  }

  // Step 2: Render each line to markdown
  const mdLines: string[] = [];
  let orderedIdx = 1;
  let prevWasList = false;

  for (const line of lines) {
    // Build inline markdown from segments
    const inlineMd = line.segments
      .map((seg) => {
        // Strip zero-width spaces used as blank-line anchors in Quill Delta
        let t = seg.text.replace(/\u200B/g, "");
        if (!seg.attrs) return t;

        // Links wrap first (so bold/italic go inside the link text)
        if (seg.attrs.link) {
          t = `[${t}](${seg.attrs.link})`;
        }
        if (seg.attrs.bold) {
          t = `**${t}**`;
        }
        if (seg.attrs.italic) {
          t = `*${t}*`;
        }
        return t;
      })
      .join("");

    const la = line.lineAttrs;

    // Heading
    if (la?.header) {
      const level = Number(la.header);
      const prefix = "#".repeat(Math.min(level, 3));
      mdLines.push(`${prefix} ${inlineMd}`);
      prevWasList = false;
      orderedIdx = 1;
      continue;
    }

    // Bullet list
    if (la?.list === "bullet") {
      mdLines.push(`- ${inlineMd}`);
      prevWasList = true;
      orderedIdx = 1;
      continue;
    }

    // Ordered list
    if (la?.list === "ordered") {
      mdLines.push(`${orderedIdx}. ${inlineMd}`);
      orderedIdx++;
      prevWasList = true;
      continue;
    }

    // Regular line / blank line
    if (prevWasList && inlineMd.trim() !== "") {
      // Add gap after list ends
      prevWasList = false;
    }
    orderedIdx = 1;
    mdLines.push(inlineMd);
    prevWasList = false;
  }

  // Clean up excessive blank lines (4+ → 3, preserving intentional double-blank-lines)
  let result = mdLines.join("\n");
  result = result.replace(/\n{4,}/g, "\n\n\n");

  // Fix links inside template-variable brackets.
  // TipTap auto-links URLs like "Frame.io" and can produce patterns like:
  //   [[Frame.io](url) | var]           — plain link in brackets
  //   [**[Frame.io](url)** | var]       — bold link in brackets
  //   [****[Frame.io](url)**** | var]   — double-bold (nested bold context)
  // All should collapse to [Frame.io | var].
  result = result.replace(
    /\[\*{0,4}\[([^\]]+)\]\([^)]+\)\*{0,4}\s*\|\s*(\w+)\]/g,
    "[$1 | $2]"
  );

  return result.trim();
}

// ══════════════════════════════════════════════════════════════════════
// ── Markdown → Quill Delta ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

/**
 * Parse a line of text into Quill ops, handling inline formatting:
 *   **bold**  *italic*  [link text](url)
 */
function parseInlineOps(text: string): QuillOp[] {
  const ops: QuillOp[] = [];
  // Pattern matches: **bold**, *italic*, or [text](url) — in order of priority
  const inlineRe =
    /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(\[([^\]]+)\]\(([^)]+)\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      ops.push({ insert: text.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      ops.push({ insert: match[2], attributes: { bold: true } });
    } else if (match[3]) {
      ops.push({ insert: match[4], attributes: { italic: true } });
    } else if (match[5]) {
      ops.push({
        insert: match[6],
        attributes: { link: match[7] },
      });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    ops.push({ insert: text.slice(lastIndex) });
  }

  if (ops.length === 0) {
    ops.push({ insert: "" });
  }

  return ops;
}

export function markdownToQuillDelta(markdown: string): QuillDelta {
  // Pre-process: strip links inside template-variable brackets that TipTap
  // may have auto-linked (e.g. [[Frame.io](http://frame.io/) | frameReviewLink])
  // Handles plain, bold (**), and double-bold (****) wrapping around the link.
  let cleaned = markdown.replace(
    /\[\*{0,4}\[([^\]]+)\]\([^)]+\)\*{0,4}\s*\|\s*(\w+)\]/g,
    "[$1 | $2]"
  );

  const ops: QuillOp[] = [];
  const lines = cleaned.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Heading: # / ## / ###
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      ops.push(...parseInlineOps(content));
      ops.push({ insert: "\n", attributes: { header: level } });
      i++;
      continue;
    }

    // Unordered list item: - text
    if (line.match(/^-\s+/)) {
      const content = line.replace(/^-\s+/, "");
      ops.push(...parseInlineOps(content));
      ops.push({ insert: "\n", attributes: { list: "bullet" } });
      i++;
      continue;
    }

    // Ordered list item: 1. text
    if (line.match(/^\d+\.\s+/)) {
      const content = line.replace(/^\d+\.\s+/, "");
      ops.push(...parseInlineOps(content));
      ops.push({ insert: "\n", attributes: { list: "ordered" } });
      i++;
      continue;
    }

    // Blank line — use a zero-width space (\u200B) as paragraph content so
    // ClickUp doesn't collapse consecutive bare "\n" ops when storing the delta.
    if (line.trim() === "") {
      ops.push({ insert: "\u200B" });
      ops.push({ insert: "\n" });
      i++;
      continue;
    }

    // Regular paragraph
    ops.push(...parseInlineOps(line));
    ops.push({ insert: "\n" });
    i++;
  }

  if (ops.length === 0) {
    ops.push({ insert: "\n" });
  }

  return { ops };
}

/**
 * Produce a plain-text version (strip markdown syntax)
 * for the `value` field as a fallback.
 */
export function markdownToPlainText(markdown: string): string {
  let text = markdown;
  text = text.replace(/^#{1,3}\s+/gm, "");
  text = text.replace(/\*\*(.+?)\*\*/g, "$1");
  text = text.replace(/\*(.+?)\*/g, "$1");
  // Handle links inside template-variable brackets first:
  //   [[Frame.io](http://frame.io/) | frameReviewLink]  →  [Frame.io | frameReviewLink]
  text = text.replace(/\[\[([^\]]+)\]\([^)]+\)\s*\|\s*(\w+)\]/g, "[$1 | $2]");
  // Then strip remaining standalone markdown links
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  text = text.replace(/^-\s+/gm, "");
  text = text.replace(/^\d+\.\s+/gm, "");
  return text;
}
