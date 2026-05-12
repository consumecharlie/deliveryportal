import { describe, it, expect } from "vitest";
import { filterMentionItems } from "../mention-filter";
import type { MentionItem } from "@/components/shared/mention-list";

const ITEMS: MentionItem[] = Array.from({ length: 23 }, (_, i) => ({
  id: `U${i.toString().padStart(3, "0")}`,
  label: `Member ${i.toString().padStart(2, "0")}`,
  slackUserId: `U${i.toString().padStart(3, "0")}`,
  slackHandle: `member.${i}`,
  email: `member${i}@x.com`,
  source: "slack",
}));

describe("filterMentionItems", () => {
  it("returns every item when query is empty (no 10-item cap)", () => {
    expect(filterMentionItems(ITEMS, "")).toHaveLength(23);
  });

  it("returns every matching item when query matches the label (no 10-item cap)", () => {
    // All 23 labels start with "Member", so a "Member" query must return all 23.
    expect(filterMentionItems(ITEMS, "Member")).toHaveLength(23);
  });

  it("matches against label, slackHandle, and email case-insensitively", () => {
    const byLabel = filterMentionItems(ITEMS, "Member 05");
    expect(byLabel.map((i) => i.id)).toEqual(["U005"]);

    const byHandle = filterMentionItems(ITEMS, "member.7");
    expect(byHandle.map((i) => i.id)).toEqual(["U007"]);

    const byEmail = filterMentionItems(ITEMS, "MEMBER12@");
    expect(byEmail.map((i) => i.id)).toEqual(["U012"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterMentionItems(ITEMS, "zzz-nope")).toEqual([]);
  });

  it("returns an empty array when items is empty regardless of query", () => {
    expect(filterMentionItems([], "")).toEqual([]);
    expect(filterMentionItems([], "anything")).toEqual([]);
  });
});
