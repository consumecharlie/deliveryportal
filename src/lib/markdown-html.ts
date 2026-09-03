/**
 * Markdown -> HTML for the delivery message body.
 *
 * Lives in src/lib (not the "use client" editor) so the client portal can
 * render delivery bodies on the server. The rich-text editor re-exports it
 * for TipTap ingestion, so both sides share one converter.
 */

import { collapseListItemGaps } from "@/lib/markdown-normalize";

/**
 * Convert basic markdown to HTML for TipTap ingestion.
 * Handles bold, italic, links, headers, and bullet lists.
 */
export function markdownToHtml(md: string): string {
  if (!md) return "";

  // A blank line between bullets would otherwise split one list into two
  // (un-mergeable in TipTap), so a stray gap becomes un-editable. Collapse it.
  let html = collapseListItemGaps(md);

  // Mentions: @[DisplayName](userId) -> TipTap mention span
  // Must run before link conversion since the syntax is similar.
  // TipTap's Mention extension re-renders the node with its own "@" prefix,
  // so the text content here is just for initial parsing.
  html = html.replace(
    /@\[([^\]]+)\]\(([^)]+)\)/g,
    '<span data-type="mention" data-id="$2" data-label="$1" class="mention">$1</span>'
  );

  // Bold: **text** -> <strong>text</strong>
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic: *text* -> <em>text</em> (after bold has been replaced)
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links: [text](url) -> <a href="url">text</a>
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>'
  );

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bullet lists: group consecutive "- " lines into <ul>
  // NOTE: TipTap requires <p> inside <li> for correct parsing.
  // The regex (\n|$) consumes the trailing newline, so we must restore it
  // so that blank lines after the list aren't swallowed.
  html = html.replace(
    /(^- .+$(\n|$))+/gm,
    (match) => {
      const items = match
        .split("\n")
        .filter((line) => line.startsWith("- "))
        .map((line) => `<li><p>${line.slice(2)}</p></li>`)
        .join("");
      // Restore trailing newline consumed by the regex
      const trail = match.endsWith("\n") ? "\n" : "";
      return `<ul>${items}</ul>${trail}`;
    }
  );

  // Ordered lists: group consecutive "1. " lines into <ol>
  // NOTE: TipTap requires <p> inside <li> for correct parsing.
  html = html.replace(
    /(^\d+\. .+$(\n|$))+/gm,
    (match) => {
      const items = match
        .split("\n")
        .filter((line) => /^\d+\. /.test(line))
        .map((line) => `<li><p>${line.replace(/^\d+\. /, "")}</p></li>`)
        .join("");
      const trail = match.endsWith("\n") ? "\n" : "";
      return `<ol>${items}</ol>${trail}`;
    }
  );

  // Paragraphs: every line becomes its own block so headings can be
  // applied independently. Empty lines become empty paragraphs for spacing.
  const lines = html.split("\n");
  html = lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "<p></p>"; // preserve blank line spacing
      // Don't wrap lines that are already block-level elements
      if (/^<(h[1-6]|ul|ol|li|blockquote|div|p)/i.test(trimmed)) {
        return trimmed;
      }
      return `<p>${trimmed}</p>`;
    })
    .join("");

  return html;
}
