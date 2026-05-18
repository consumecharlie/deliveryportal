/**
 * Tests for quillDeltaToMarkdown — specifically the cases we hit in
 * production where ClickUp stores formatting in ways that produce
 * INVALID markdown if you naively wrap with `**`/`*`/`#`.
 *
 * Real bug we tracked down for task 86a9683wp (AV Script V1 + Loom):
 * the Quill Delta had `{"bold": true}` applied to "AV Script: " (with
 * trailing space). Wrapping that as `**AV Script: **` is invalid
 * CommonMark — the closing `**` is preceded by whitespace, so strict
 * parsers like n8n's render the asterisks literally in the email.
 */
import { describe, it, expect } from "vitest";
import { quillDeltaToMarkdown } from "../markdown-to-quill";

describe("quillDeltaToMarkdown: bold/italic whitespace handling", () => {
  it("moves trailing space out of a bold span (the actual prod bug)", () => {
    // From the real stored Delta for task 86a9683wp
    const delta = {
      ops: [
        { insert: "Revision Rounds: ", attributes: { bold: true } },
        { insert: "1 of " },
        { insert: "[revisionRounds]", attributes: { bold: true } },
        { insert: "\n", attributes: { list: "bullet" } },
      ],
    };
    const md = quillDeltaToMarkdown(delta);
    // The bad output would be:
    //   - **Revision Rounds: **1 of **[revisionRounds]**
    // We want:
    //   - **Revision Rounds:** 1 of **[revisionRounds]**
    expect(md).toContain("**Revision Rounds:**");
    expect(md).not.toMatch(/\*\*Revision Rounds: \*\*/);
  });

  it("moves trailing space out of a bold span in a regular paragraph", () => {
    const delta = {
      ops: [
        { insert: "AV Script: ", attributes: { bold: true } },
        { insert: "The AV Script combines audio." },
        { insert: "\n", attributes: { list: "bullet" } },
      ],
    };
    const md = quillDeltaToMarkdown(delta);
    expect(md).toContain("**AV Script:**");
    expect(md).not.toMatch(/\*\*AV Script: \*\*/);
  });

  it("moves trailing space out of bold even at end of bullet (after exclamation)", () => {
    const delta = {
      ops: [
        { insert: "[AV Script V1 | googleDeliverableLink] " },
        { insert: "Leave feedback here! ", attributes: { bold: true } },
        { insert: "\n", attributes: { list: "bullet" } },
      ],
    };
    const md = quillDeltaToMarkdown(delta);
    expect(md).toContain("**Leave feedback here!**");
    expect(md).not.toMatch(/\*\*Leave feedback here! \*\*/);
  });

  it("moves leading space out of a bold span", () => {
    const delta = {
      ops: [
        { insert: "Hello " },
        { insert: " bold", attributes: { bold: true } },
        { insert: " world" },
        { insert: "\n" },
      ],
    };
    const md = quillDeltaToMarkdown(delta);
    expect(md).not.toMatch(/\*\* bold\*\*/);
    expect(md).toContain("**bold**");
  });

  it("same fix applies to italic", () => {
    const delta = {
      ops: [
        { insert: "Watch this first. ", attributes: { italic: true } },
        { insert: "Then come back." },
        { insert: "\n" },
      ],
    };
    const md = quillDeltaToMarkdown(delta);
    expect(md).not.toMatch(/\*Watch this first\. \*/);
    expect(md).toContain("*Watch this first.*");
  });

  it("does not wrap a segment that is whitespace only", () => {
    const delta = {
      ops: [
        { insert: "before " },
        { insert: " ", attributes: { bold: true } },
        { insert: "after" },
        { insert: "\n" },
      ],
    };
    const md = quillDeltaToMarkdown(delta);
    // Empty/whitespace-only bold should not produce stray `**`s
    expect(md).not.toMatch(/\*\*\s\*\*/);
    expect(md).not.toContain("**");
  });
});

describe("quillDeltaToMarkdown: empty header handling", () => {
  it("does not emit a bare `## ` when the header has no inline content", () => {
    const delta = {
      ops: [
        { insert: "" },
        { insert: "\n", attributes: { header: 2 } },
        { insert: "🔔 Scope & Timeline Reminders", attributes: { bold: true } },
        { insert: "\n", attributes: { header: 3 } },
      ],
    };
    const md = quillDeltaToMarkdown(delta);
    // We should NOT see an orphan "## " line in the output
    const lines = md.split("\n");
    for (const line of lines) {
      expect(line).not.toMatch(/^#{1,3}\s*$/);
    }
  });
});
