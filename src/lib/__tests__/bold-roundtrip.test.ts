/**
 * Reproduction for the "**Word: **" trailing-space bold bug.
 *
 * The portal preview renders bold correctly but the email draft shows
 * literal `**` because the markdown that goes to n8n has a space INSIDE
 * the closing `**`. This test locates the step that introduces it.
 */
import { describe, it, expect } from "vitest";
import { magicCleanup } from "../template-cleanup";
import { markdownToHtml, htmlToMarkdown } from "../../components/shared/rich-text-editor";

const CLEAN_OUT_BULLETS = `- **Revision Rounds:** 1 of [revisionRounds]
- **Feedback Windows:** [feedbackWindows]
- **Feedback Deadline:** EOD [nextFeedbackDeadline]
- Additional revisions beyond the included revision rounds will require a scope adjustment.`;

describe("magic cleanup produces canonical bold", () => {
  it("scope bullets use **Word:** with no trailing space", () => {
    const input = `## 🔔 Scope & Timeline Reminders
- old content here`;
    const out = magicCleanup(input);
    expect(out).toContain("**Revision Rounds:**");
    expect(out).not.toContain("**Revision Rounds: **");
  });
});

describe("TipTap markdown roundtrip preserves bold", () => {
  it("preserves **Word:** through markdownToHtml → htmlToMarkdown", () => {
    const html = markdownToHtml(CLEAN_OUT_BULLETS);
    const out = htmlToMarkdown(html);
    expect(out).toContain("**Revision Rounds:**");
    expect(out).not.toContain("**Revision Rounds: **");
  });

  it("preserves **Word:** in standalone paragraphs (e.g. Please note)", () => {
    const md = `**Please note:** Visuals shown are placeholder references only.`;
    const html = markdownToHtml(md);
    const out = htmlToMarkdown(html);
    expect(out).toContain("**Please note:**");
    expect(out).not.toContain("**Please note: **");
  });

  it("preserves **Word:** inside list items with mention/variable", () => {
    const md = `- **Revision Rounds:** 1 of [revisionRounds]`;
    const html = markdownToHtml(md);
    const out = htmlToMarkdown(html);
    expect(out).toContain("**Revision Rounds:**");
    expect(out).not.toContain("**Revision Rounds: **");
  });
});
