import { describe, it, expect } from "vitest";
import { magicCleanup } from "../template-cleanup";

describe("magicCleanup — structural", () => {
  it("bullets a single-line item under a markdown header (no blank between)", () => {
    const input = `## Final cut\n[Final cut | googleDeliverableLink]`;
    expect(magicCleanup(input)).toBe(
      `## Final cut\n- [Final cut | googleDeliverableLink]`
    );
  });

  it("bullets every line of a multi-line block under a header", () => {
    // Previously this was treated as multi-line prose; now we bullet each.
    const input =
      `## We Need Your Feedback\nStory clarity and overall flow\nPacing and energy\nMusic and tone fit`;
    expect(magicCleanup(input)).toBe(
      `## We Need Your Feedback\n- Story clarity and overall flow\n- Pacing and energy\n- Music and tone fit`
    );
  });

  it("keeps a prose intro line (ending with `:`) and bullets the rest", () => {
    const input =
      `## We Need Your Feedback\nPlease take a full pass and let us know your thoughts! Most focused on:\nStory clarity\nPacing`;
    expect(magicCleanup(input)).toBe(
      `## We Need Your Feedback\nPlease take a full pass and let us know your thoughts! Most focused on:\n- Story clarity\n- Pacing`
    );
  });

  it("preserves already-bulleted lines and normalizes * to -", () => {
    const input = `## Items\n- already\n* with asterisk`;
    expect(magicCleanup(input)).toBe(
      `## Items\n- already\n- with asterisk`
    );
  });

  it("does not bullet content before the first header", () => {
    const input = `Hi @[Adam](U123),\nHope your week is great!\n\n## Final cut\n[Final cut | x]`;
    expect(magicCleanup(input)).toBe(
      `Hi @[Adam](U123),\nHope your week is great!\n\n[versionNotes]\n\n## Final cut\n- [Final cut | x]`
    );
  });

  it("drops bold-only sub-headers but preserves bold-wrapped template variables", () => {
    // `**Scope**` is a sub-header → dropped.
    // `**[versionNotes]**` is a bold variable → kept (and moved to pre-header).
    const input =
      `**[versionNotes]**\n\n## Scope & Timeline Reminders\n**Scope**\nThis is the first revision round.`;
    const out = magicCleanup(input);
    // versionNotes preserved (in pre-header position); **Scope** dropped;
    // scope/timeline section is rewritten to canonical bullets.
    expect(out).toContain("[versionNotes]");
    expect(out).not.toContain("**Scope**");
    expect(out).toContain("- **Revision Rounds:** 1 of [revisionRounds]");
  });

  it("normalizes blank lines to exactly one between sections", () => {
    const input = `## A\n[a | x]\n\n\n\n## B\n[b | y]`;
    expect(magicCleanup(input)).toBe(
      `## A\n- [a | x]\n\n## B\n- [b | y]`
    );
  });

  it("is idempotent: running twice produces the same result", () => {
    const input = `## Items\n- a\n- b\n\n## ⏭️ Next Step\nremoved.`;
    const once = magicCleanup(input);
    const twice = magicCleanup(once);
    expect(twice).toBe(once);
  });
});

describe("magicCleanup — section-specific transforms", () => {
  it("removes the Next Step section entirely", () => {
    const input =
      `## ⚡ What You're Receiving\nSomething.\n\n## ⏭️ Next Step\nOnce we receive feedback, we'll send V2.\n\n## 🔗 Review Link\n[Edit V1 | frameReviewLink]`;
    const out = magicCleanup(input, {
      deliverableType: "Edit V1",
      department: "Post-Production",
    });
    expect(out).not.toContain("Next Step");
    expect(out).not.toContain("Once we receive feedback");
  });

  it("replaces the Scope & Timeline section with canonical bullets", () => {
    const input =
      `## 🔔 Scope & Timeline Reminders\nSome old text about scope.\nMore old text about timeline.`;
    const out = magicCleanup(input);
    expect(out).toBe(
      `## 🔔 Scope & Timeline Reminders\n- **Revision Rounds:** 1 of [revisionRounds]\n- **Feedback Windows:** [feedbackWindows]\n- **Feedback Deadline:** EOD [nextFeedbackDeadline]\n- Additional revisions beyond the included revision rounds will require a scope adjustment.`
    );
  });

  it("standardizes the Project Plan section to one canonical bullet", () => {
    const input = `## 🗓 Project Plan\nView real-time progress\nhttps://example.com`;
    const out = magicCleanup(input);
    expect(out).toBe(
      `## 🗓 Project Plan\n- [View real-time progress | projectPlanLink]`
    );
  });

  it("injects frameReviewLink for Post-Production non-final deliverables", () => {
    const input = `## 🔗 Review Link\nEdit01`;
    const out = magicCleanup(input, {
      deliverableType: "Edit V1",
      department: "Post-Production",
    });
    expect(out).toContain("[Frame review | frameReviewLink]");
  });

  it("injects google link + 'Final delivery' label for Final Delivery", () => {
    const input = `## 🔗 Review Link\n(empty)`;
    const out = magicCleanup(input, {
      deliverableType: "Final Delivery",
      department: "Post-Production",
    });
    expect(out).toContain("[Final delivery | googleDeliverableLink]");
  });

  it("injects google link + 'Document' label for Pre-Pro deliverables", () => {
    const input = `## 🔗 Review Link\n`;
    const out = magicCleanup(input, {
      deliverableType: "Set Design Moodboard",
      department: "Pre-Pro",
    });
    expect(out).toContain("[Document | googleDeliverableLink]");
  });

  it("adds a loomReviewLink bullet when 'loom' appears in the snippet", () => {
    const input =
      `## ⚡ What You're Receiving\nWe've included a loom walkthrough.\n\n## 🔗 Review Link\nEdit01`;
    const out = magicCleanup(input, {
      deliverableType: "Edit V1",
      department: "Post-Production",
    });
    expect(out).toContain("[Frame review | frameReviewLink]");
    expect(out).toContain("[Loom walkthrough | loomReviewLink]");
  });
});

describe("magicCleanup — greeting + versionNotes", () => {
  it("replaces deprecated [contact] with [contactFirstName]", () => {
    const input = `Hello [contact]!\n\n## ⚡ Items\nfoo`;
    const out = magicCleanup(input);
    expect(out).toContain("Hello [contactFirstName]!");
    expect(out).not.toContain("[contact]!");
  });

  it("leaves [contacts] / [contactFirstName] / [contactName] alone", () => {
    const input = `Hello [contacts] and [contactName]!\n\n## A\nfoo`;
    const out = magicCleanup(input);
    expect(out).toContain("[contacts]");
    expect(out).toContain("[contactName]");
  });

  it("inserts [versionNotes] between greeting and first header when missing", () => {
    const input = `Hello [contactFirstName]!\nWe're excited to share...\n\n## A\nfoo`;
    const out = magicCleanup(input);
    const lines = out.split("\n");
    const headerIdx = lines.findIndex((l) => l.startsWith("## A"));
    const vnIdx = lines.findIndex((l) => l.includes("[versionNotes]"));
    expect(vnIdx).toBeGreaterThanOrEqual(0);
    expect(vnIdx).toBeLessThan(headerIdx);
  });

  it("preserves [versionNotes] when already in the right place (even when bold-wrapped)", () => {
    const input = `Hello!\n\n**[versionNotes]**\n\n## A\nfoo`;
    const out = magicCleanup(input);
    expect(out).toContain("[versionNotes]");
    // Should only appear once
    expect(out.match(/\[versionNotes\]/g)!.length).toBe(1);
  });
});

describe("magicCleanup — [automated] placeholder replacement", () => {
  it("replaces [automated] in greeting line with [contacts]", () => {
    const input = `Hello [automated]!\n\n## ⚡ Items\nfoo`;
    const out = magicCleanup(input);
    expect(out).toContain("Hello [contacts]!");
    expect(out).not.toContain("[automated]");
  });

  it("replaces [automated] in deadline sentence with [nextFeedbackDeadline]", () => {
    const input = `Hello [contactFirstName]!\n\n## 🔔 Reminders\nTo stay on track, please submit consolidated feedback by [automated].`;
    const out = magicCleanup(input);
    expect(out).toContain("[nextFeedbackDeadline]");
    expect(out).not.toContain("[automated]");
  });

  it("handles both placeholders in the same template (Edit02 - Animated case)", () => {
    const input = `Hello [automated]!\nWe're excited to share the second version!\n\n## 🔔 Reminders\nTo stay on track, please submit consolidated feedback by [automated].`;
    const out = magicCleanup(input);
    expect(out).toContain("Hello [contacts]!");
    expect(out).toContain("by [nextFeedbackDeadline]");
    expect(out).not.toContain("[automated]");
  });

  it("does NOT touch [automated] outside greeting or deadline contexts", () => {
    // We only replace where we're confident. An [automated] in some
    // unrelated sentence should be left for the linter to surface.
    const input = `Hello [contactFirstName]!\n\n## Notes\nWe ran [automated] checks on this build.`;
    const out = magicCleanup(input);
    expect(out).toContain("[automated]");
  });
});
