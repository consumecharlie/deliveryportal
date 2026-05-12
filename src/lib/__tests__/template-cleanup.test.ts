import { describe, it, expect } from "vitest";
import { magicCleanup } from "../template-cleanup";

describe("magicCleanup", () => {
  it("bullets a single-line item under a markdown header (no blank line between)", () => {
    const input = `## Final cut\n[Final cut | googleDeliverableLink]`;
    const out = magicCleanup(input);
    expect(out).toBe(`## Final cut\n- [Final cut | googleDeliverableLink]`);
  });

  it("bullets a single-line item under a bold-only line header when no ## headers exist", () => {
    const input = `**Project Plan**\n[Plan | projectPlanLink]`;
    const out = magicCleanup(input);
    expect(out).toBe(`**Project Plan**\n- [Plan | projectPlanLink]`);
  });

  it("drops bold sub-headers inside a section when the template uses ## headers", () => {
    const input =
      `## 🔔 Scope & Timeline Reminders\n\n**Scope**\n- Revision Rounds: 1 of [revisionRounds]\n- Feedback Windows: [feedbackWindows]`;
    const out = magicCleanup(input);
    expect(out).toBe(
      `## 🔔 Scope & Timeline Reminders\n- Revision Rounds: 1 of [revisionRounds]\n- Feedback Windows: [feedbackWindows]`
    );
  });

  it("leaves multi-line prose paragraphs alone", () => {
    const input =
      `## What you'll be receiving\nThis is a prose paragraph\nthat spans multiple lines.`;
    const out = magicCleanup(input);
    expect(out).toBe(
      `## What you'll be receiving\nThis is a prose paragraph\nthat spans multiple lines.`
    );
  });

  it("preserves already-bulleted lines and normalizes `*` markers to `-`", () => {
    const input = `## Items\n- already\n* with asterisk`;
    const out = magicCleanup(input);
    expect(out).toBe(`## Items\n- already\n- with asterisk`);
  });

  it("does not bullet content before the first header (greetings)", () => {
    const input = `Hi @[Adam](U123),\nHope your week is great!\n\n## Final cut\n[Final cut | googleDeliverableLink]`;
    const out = magicCleanup(input);
    expect(out).toBe(
      `Hi @[Adam](U123),\nHope your week is great!\n\n## Final cut\n- [Final cut | googleDeliverableLink]`
    );
  });

  it("handles a section with both prose and single-line items", () => {
    const input =
      `## Mixed\nA multi-line prose\nblock here.\n\n[Link | foo]`;
    const out = magicCleanup(input);
    expect(out).toBe(
      `## Mixed\nA multi-line prose\nblock here.\n\n- [Link | foo]`
    );
  });

  it("normalizes blank lines to exactly one between sections", () => {
    const input = `## A\n[a | x]\n\n\n\n## B\n[b | y]`;
    const out = magicCleanup(input);
    expect(out).toBe(`## A\n- [a | x]\n\n## B\n- [b | y]`);
  });

  it("collapses pre-existing blank lines between header and its body", () => {
    const input = `## A\n\n- a`;
    const out = magicCleanup(input);
    expect(out).toBe(`## A\n- a`);
  });

  it("leaves a trailing sign-off paragraph alone at the end of the last section", () => {
    const input =
      `## Project Plan\n[View | x]\n\nWe're looking forward to your feedback and next steps!`;
    const out = magicCleanup(input);
    expect(out).toBe(
      `## Project Plan\n- [View | x]\n\nWe're looking forward to your feedback and next steps!`
    );
  });

  it("leaves a multi-block sign-off (e.g. 'Thanks!' + 'Best, Michael') alone", () => {
    const input = `## End\n[a | x]\n\nThanks!\n\nBest,\nMichael`;
    const out = magicCleanup(input);
    expect(out).toBe(`## End\n- [a | x]\n\nThanks!\n\nBest,\nMichael`);
  });

  it("still bullets a single-line note in a section that has no bullets at all", () => {
    // Sign-off skip only kicks in when the last section already has bullet
    // content. A pure-prose section keeps the existing bullet-it behavior.
    const input = `## Note\nThis is the only line.`;
    const out = magicCleanup(input);
    expect(out).toBe(`## Note\n- This is the only line.`);
  });

  it("does not treat prose in non-last sections as a sign-off", () => {
    // Middle-section single-line prose still gets bulleted per the normal
    // rules; sign-off skip is reserved for the final section.
    const input = `## A\nMiddle prose line here.\n\n## B\n[b | y]`;
    const out = magicCleanup(input);
    expect(out).toBe(`## A\n- Middle prose line here.\n\n## B\n- [b | y]`);
  });

  it("is idempotent: running twice produces the same result", () => {
    const input = `## Final cut\n[Final cut | x]\n## Project Plan\n[Plan | y]\n\nThanks!`;
    const once = magicCleanup(input);
    const twice = magicCleanup(once);
    expect(twice).toBe(once);
  });

  it("handles back-to-back headers with no body in between", () => {
    const input = `## Empty\n## Next\n[item | z]`;
    const out = magicCleanup(input);
    expect(out).toBe(`## Empty\n\n## Next\n- [item | z]`);
  });

  it("trims trailing whitespace and blank lines", () => {
    const input = `## A\n[a | x]\n\n\n`;
    const out = magicCleanup(input);
    expect(out).toBe(`## A\n- [a | x]`);
  });
});
