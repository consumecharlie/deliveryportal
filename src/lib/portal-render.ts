/**
 * Delivery body -> HTML for the client portal.
 *
 * markdownToHtml is a plain string converter with no sanitizer, and portal
 * pages render its output with dangerouslySetInnerHTML for anyone holding a
 * link. Bodies come from our own templates and ClickUp fields, but the portal
 * still treats them as untrusted:
 *
 * 1. Mention syntax is replaced by a name before anything else, so a mention
 *    can never carry markup or attribute text into the output.
 * 2. `& < > "` are escaped on the raw markdown, so the only tags in the
 *    result are the ones markdownToHtml itself emits and no attribute can be
 *    broken out of.
 * 3. Every emitted link is scheme-checked. Anything but http, https or
 *    mailto is rendered as plain text (anchor dropped, link text kept).
 */
import { markdownToHtml } from "@/lib/markdown-html";
import { stripMentions } from "@/lib/portal-timeline";

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

export function escapeHtml(raw: string): string {
  return raw.replace(/[&<>"]/g, (ch) => ENTITIES[ch]);
}

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

function isSafeHref(href: string): boolean {
  const h = href.trim();
  if (!SAFE_HREF.test(h)) return false;
  // A real URL has no whitespace and, after escaping, no quote entity.
  if (/\s/.test(h) || /&quot;/i.test(h)) return false;
  return true;
}

/** Keep safe anchors (opening in a new tab); flatten the rest to their text. */
function sanitizeLinks(html: string): string {
  return html.replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, (_m, href: string, text: string) =>
    isSafeHref(href)
      ? `<a href="${href.trim()}" target="_blank" rel="noopener noreferrer">${text}</a>`
      : text
  );
}

export function renderPortalBody(md: string): string {
  if (!md) return "";
  const named = stripMentions(md, {});
  return sanitizeLinks(markdownToHtml(escapeHtml(named)));
}
