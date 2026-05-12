import type { MentionItem } from "@/components/shared/mention-list";

/**
 * Returns every mention item that matches `query` against label, slackHandle,
 * or email (case-insensitive). When `query` is empty, returns the full list.
 *
 * Intentionally does NOT cap results — the dropdown is already scrollable
 * (`max-h-48 overflow-y-auto`) so capping here just hid valid members from
 * channels with more than 10 people.
 */
export function filterMentionItems(items: MentionItem[], query: string): MentionItem[] {
  if (!query) return items;
  const lower = query.toLowerCase();
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(lower) ||
      (item.slackHandle?.toLowerCase().includes(lower) ?? false) ||
      (item.email?.toLowerCase().includes(lower) ?? false)
  );
}
