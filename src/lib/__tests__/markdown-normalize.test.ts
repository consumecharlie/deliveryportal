import { describe, it, expect } from "vitest";
import { collapseListItemGaps } from "@/lib/markdown-normalize";

describe("collapseListItemGaps", () => {
  it("collapses a blank line between two bullets (the Composition/Wardrobe case)", () => {
    const input = "- Lighting\n- Composition\n\n- Wardrobe\n- Overall visual tone";
    expect(collapseListItemGaps(input)).toBe(
      "- Lighting\n- Composition\n- Wardrobe\n- Overall visual tone"
    );
  });

  it("collapses multiple gaps and 2+ blank lines", () => {
    expect(collapseListItemGaps("- a\n\n- b\n\n\n- c")).toBe("- a\n- b\n- c");
  });

  it("preserves a blank line before non-list content", () => {
    const input = "- a\n- b\n\n**Please note:** something";
    expect(collapseListItemGaps(input)).toBe(input);
  });

  it("collapses gaps between ordered items", () => {
    expect(collapseListItemGaps("1. a\n\n2. b")).toBe("1. a\n2. b");
  });

  it("leaves a clean list untouched and handles empty input", () => {
    expect(collapseListItemGaps("- a\n- b")).toBe("- a\n- b");
    expect(collapseListItemGaps("")).toBe("");
  });
});
