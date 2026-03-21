import { describe, it, expect } from "vitest";
import { lintSlackMrkdwn } from "@/lib/slack-lint";

describe("lintSlackMrkdwn", () => {
  // ── Valid mrkdwn should pass clean ──
  describe("valid mrkdwn", () => {
    it("returns empty array for clean Slack mrkdwn", () => {
      const clean = [
        "*Bold text*",
        "<https://example.com|Click here>",
        "<@U05AC4CFK62>",
        "\u2003\u2003•\u2002Bullet item",
        ":zap: Emoji",
      ].join("\n");
      expect(lintSlackMrkdwn(clean)).toEqual([]);
    });

    it("does not flag valid Slack mentions", () => {
      expect(lintSlackMrkdwn("<@U1234567>")).toEqual([]);
    });

    it("does not flag valid Slack links", () => {
      expect(lintSlackMrkdwn("<https://example.com|text>")).toEqual([]);
    });

    it("does not flag channel links", () => {
      expect(lintSlackMrkdwn("<#C1234567>")).toEqual([]);
    });

    it("does not flag special mentions like <!here>", () => {
      expect(lintSlackMrkdwn("<!here> <!channel>")).toEqual([]);
    });
  });

  // ── Unconverted bold ──
  describe("unconverted bold", () => {
    it("flags ** remaining in text", () => {
      const errors = lintSlackMrkdwn("**bold text**");
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("**");
      expect(errors[0].line).toBe(1);
    });

    it("reports correct line number for bold on line 3", () => {
      const errors = lintSlackMrkdwn("line1\nline2\n**oops**");
      expect(errors[0].line).toBe(3);
    });
  });

  // ── Unconverted headers ──
  describe("unconverted headers", () => {
    it("flags ## at line start", () => {
      const errors = lintSlackMrkdwn("## Header");
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("#");
    });

    it("flags # at line start", () => {
      const errors = lintSlackMrkdwn("# Header");
      expect(errors.some((e) => e.message.includes("#"))).toBe(true);
    });

    it("flags ### at line start", () => {
      const errors = lintSlackMrkdwn("### Header");
      expect(errors.some((e) => e.message.includes("#"))).toBe(true);
    });

    it("does not flag # in the middle of text", () => {
      expect(lintSlackMrkdwn("Issue #42 is fixed")).toEqual([]);
    });
  });

  // ── Unconverted links ──
  describe("unconverted links", () => {
    it("flags [text](url) markdown links", () => {
      const errors = lintSlackMrkdwn("[Click](https://example.com)");
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("[text](url)");
    });

    it("does not flag @[Name](id) as a link (caught as mention instead)", () => {
      const errors = lintSlackMrkdwn("@[Emily](U1234)");
      // Should get a mention error, not a link error
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("mention");
    });
  });

  // ── Unconverted mentions ──
  describe("unconverted mentions", () => {
    it("flags @[Name](userId)", () => {
      const errors = lintSlackMrkdwn("@[Bob](U9876)");
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("mention");
    });
  });

  // ── Raw HTML tags ──
  describe("raw HTML tags", () => {
    it("flags <strong> tags", () => {
      const errors = lintSlackMrkdwn("<strong>text</strong>");
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes("strong"))).toBe(true);
    });

    it("flags <em> tags", () => {
      const errors = lintSlackMrkdwn("<em>text</em>");
      expect(errors.some((e) => e.message.includes("em"))).toBe(true);
    });

    it("flags <a href=...> tags", () => {
      const errors = lintSlackMrkdwn('<a href="https://x.com">link</a>');
      expect(errors.some((e) => e.message.includes("<a"))).toBe(true);
    });

    it("flags <h1> tags", () => {
      const errors = lintSlackMrkdwn("<h1>Title</h1>");
      expect(errors.some((e) => e.message.includes("h1"))).toBe(true);
    });

    it("does not flag valid Slack <@U...> tokens as HTML", () => {
      const errors = lintSlackMrkdwn("<@U12345>");
      expect(errors).toEqual([]);
    });

    it("does not flag valid Slack <https://...|text> as HTML", () => {
      const errors = lintSlackMrkdwn("<https://example.com|text>");
      expect(errors).toEqual([]);
    });
  });

  // ── Excessive blank lines ──
  describe("excessive blank lines", () => {
    it("flags 3+ consecutive newlines", () => {
      const errors = lintSlackMrkdwn("line1\n\n\nline2");
      expect(errors.some((e) => e.message.includes("blank lines"))).toBe(true);
    });

    it("does not flag 2 consecutive newlines (single blank line)", () => {
      const errors = lintSlackMrkdwn("line1\n\nline2");
      expect(errors).toEqual([]);
    });
  });

  // ── Multiple errors ──
  describe("multiple errors", () => {
    it("returns multiple errors for multiple issues", () => {
      const input = "**bold**\n## Header\n[link](url)";
      const errors = lintSlackMrkdwn(input);
      expect(errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});
