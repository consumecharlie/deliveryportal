import { describe, it, expect } from "vitest";
import { magicCleanup } from "../template-cleanup";

describe("magicCleanup", () => {
  it("bullets a single-line item under a markdown header", () => {
    const input = `## Final cut\n[Final cut | googleDeliverableLink]`;
    const out = magicCleanup(input);
    expect(out).toBe(
      `## Final cut\n\n- [Final cut | googleDeliverableLink]`
    );
  });

  it("bullets a single-line item under a bold-only line header", () => {
    const input = `**Project Plan**\n[Plan | projectPlanLink]`;
    const out = magicCleanup(input);
    expect(out).toBe(
      `**Project Plan**\n\n- [Plan | projectPlanLink]`
    );
  });

  it("leaves multi-line prose paragraphs alone", () => {
    const input =
      `## What you'll be receiving\nThis is a prose paragraph\nthat spans multiple lines.`;
    const out = magicCleanup(input);
    expect(out).toBe(
      `## What you'll be receiving\n\nThis is a prose paragraph\nthat spans multiple lines.`
    );
  });

  it("preserves already-bulleted lines and normalizes `*` markers to `-`", () => {
    const input = `## Items\n- already\n* with asterisk`;
    const out = magicCleanup(input);
    expect(out).toBe(`## Items\n\n- already\n- with asterisk`);
  });

  it("does not bullet content before the first header (greetings)", () => {
    const input = `Hi @[Adam](U123),\nHope your week is great!\n\n## Final cut\n[Final cut | googleDeliverableLink]`;
    const out = magicCleanup(input);
    expect(out).toBe(
      `Hi @[Adam](U123),\nHope your week is great!\n\n## Final cut\n\n- [Final cut | googleDeliverableLink]`
    );
  });

  it("handles a section with both prose and single-line items", () => {
    const input =
      `## Mixed\nA multi-line prose\nblock here.\n\n[Link | foo]`;
    const out = magicCleanup(input);
    expect(out).toBe(
      `## Mixed\n\nA multi-line prose\nblock here.\n\n- [Link | foo]`
    );
  });

  it("normalizes blank lines to exactly one between sections", () => {
    const input = `## A\n[a | x]\n\n\n\n## B\n[b | y]`;
    const out = magicCleanup(input);
    expect(out).toBe(`## A\n\n- [a | x]\n\n## B\n\n- [b | y]`);
  });

  it("is idempotent: running twice produces the same result", () => {
    const input = `## Final cut\n[Final cut | x]\n## Project Plan\n[Plan | y]`;
    const once = magicCleanup(input);
    const twice = magicCleanup(once);
    expect(twice).toBe(once);
  });

  it("handles back-to-back headers with no body in between", () => {
    const input = `## Empty\n## Next\n[item | z]`;
    const out = magicCleanup(input);
    expect(out).toBe(`## Empty\n\n## Next\n\n- [item | z]`);
  });

  it("trims trailing whitespace and blank lines", () => {
    const input = `## A\n[a | x]\n\n\n`;
    const out = magicCleanup(input);
    expect(out).toBe(`## A\n\n- [a | x]`);
  });
});
