import { describe, it, expect } from "vitest";
import { convertToSlackFormat } from "@/lib/template-merge";

describe("convertToSlackFormat", () => {
  // ── Bold conversion ──
  describe("bold", () => {
    it("converts **text** to *text*", () => {
      expect(convertToSlackFormat("**hello**")).toBe("*hello*");
    });

    it("moves trailing whitespace outside bold markers", () => {
      // TipTap often produces "**text: **rest" instead of "**text:** rest"
      expect(convertToSlackFormat("**text: **rest")).toBe("*text:* rest");
    });

    it("handles multiple bold segments on one line", () => {
      const input = "**first** and **second**";
      const result = convertToSlackFormat(input);
      expect(result).toBe("*first* and *second*");
    });
  });

  // ── Header conversion ──
  describe("headers", () => {
    it("converts ## text to *text*", () => {
      expect(convertToSlackFormat("## Section Title")).toBe("*Section Title*");
    });

    it("converts # text to *text*", () => {
      expect(convertToSlackFormat("# Main Title")).toBe("*Main Title*");
    });

    it("converts ### text to *text*", () => {
      expect(convertToSlackFormat("### Sub Title")).toBe("*Sub Title*");
    });

    it("avoids triple asterisks on bold headers like ## **⚡ text**", () => {
      // Step 2 converts **⚡ text** → *:zap: text*
      // Step 5 must strip inner * to avoid producing **:zap: text**
      const result = convertToSlackFormat("## **⚡ text**");
      expect(result).toBe("*:zap: text*");
      expect(result).not.toContain("***");
    });
  });

  // ── Link conversion ──
  describe("links", () => {
    it("converts [text](url) to <url|text>", () => {
      expect(convertToSlackFormat("[Click here](https://example.com)")).toBe(
        "<https://example.com|Click here>"
      );
    });
  });

  // ── Mention conversion ──
  describe("mentions", () => {
    it("converts @[Name](userId) to <@userId>", () => {
      expect(convertToSlackFormat("@[Emily](U05AC4CFK62)")).toBe(
        "<@U05AC4CFK62>"
      );
    });

    it("mention conversion runs before link conversion", () => {
      // Ensures @[Name](id) doesn't become a Slack link
      const result = convertToSlackFormat("Hey @[Bob](U1234) check [this](https://x.com)");
      expect(result).toBe("Hey <@U1234> check <https://x.com|this>");
    });
  });

  // ── Bullet points ──
  describe("bullets", () => {
    it("converts - text to em-space bullet", () => {
      const result = convertToSlackFormat("- Item one");
      expect(result).toContain("•");
      expect(result).not.toMatch(/^- /);
    });

    it("preserves multiline bullets", () => {
      const input = "- First\n- Second\n- Third";
      const result = convertToSlackFormat(input);
      const lines = result.split("\n");
      expect(lines).toHaveLength(3);
      lines.forEach((line) => {
        expect(line).toContain("•");
        expect(line).not.toMatch(/^- /);
      });
    });
  });

  // ── Emoji conversion ──
  describe("emoji", () => {
    it("converts ⚡ to :zap:", () => {
      expect(convertToSlackFormat("⚡")).toBe(":zap:");
    });

    it("strips variation selectors (⚡️ with U+FE0F)", () => {
      expect(convertToSlackFormat("⚡\uFE0F")).toBe(":zap:");
    });

    it("converts multiple different emojis", () => {
      const result = convertToSlackFormat("🚀 Launch 🔥 Fire");
      expect(result).toBe(":rocket: Launch :fire: Fire");
    });
  });

  // ── Zero-width character stripping ──
  describe("zero-width characters", () => {
    it("strips zero-width spaces and BOM", () => {
      const input = "\uFEFFHello\u200B world";
      expect(convertToSlackFormat(input)).toBe("Hello world");
    });
  });

  // ── Real template snippet (integration) ──
  describe("real template snippet", () => {
    it("converts a full section with headers, bold, links, and mentions", () => {
      const input = [
        "## **⚡ Review Links**",
        "",
        "Hey @[Emily](U05AC4CFK62), here are the deliverables:",
        "",
        "- [Edit V1](https://frame.io/abc)",
        "- [Project Plan](https://docs.google.com/xyz)",
        "",
        "**Next deadline:** Friday",
      ].join("\n");

      const result = convertToSlackFormat(input);

      // No markdown remnants
      expect(result).not.toContain("**");
      expect(result).not.toMatch(/^##/m);
      expect(result).not.toMatch(/\[.+\]\(.+\)/);

      // Positive checks
      expect(result).toContain("*:zap: Review Links*");
      expect(result).toContain("<@U05AC4CFK62>");
      expect(result).toContain("<https://frame.io/abc|Edit V1>");
      expect(result).toContain("<https://docs.google.com/xyz|Project Plan>");
      expect(result).toContain("•");
      expect(result).toContain("*Next deadline:*");
    });
  });
});
