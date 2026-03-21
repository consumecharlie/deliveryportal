# Slack Formatting Validation System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure Slack messages from the delivery portal are perfectly formatted before they reach Slack, with three layers of gatekeeping: unit tests, a runtime linter, and a live Slack mrkdwn preview.

**Architecture:** A shared `lintSlackMrkdwn()` function and `SlackMrkdwnRenderer` component are consumed by both the template editor and delivery send editor. The linter blocks save/send actions with a manual override. The renderer provides a faithful Slack preview alongside a source view with inline lint highlighting. All backed by a Vitest test suite.

**Tech Stack:** Vitest (new), React components, `convertToSlackFormat()` from `src/lib/template-merge.ts`

---

### Task 1: Set Up Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add vitest dep + test script)

**Step 1: Install vitest**

Run: `npm install -D vitest`

**Step 2: Create vitest config**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

**Step 3: Add test script to package.json**

Add to `"scripts"`: `"test": "vitest run"`, `"test:watch": "vitest"`

**Step 4: Verify setup**

Run: `npx vitest run`
Expected: "No test files found" (success — config works)

**Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add Vitest test framework"
```

---

### Task 2: Test Suite for `convertToSlackFormat()`

**Files:**
- Create: `src/lib/__tests__/template-merge.test.ts`

**Step 1: Write bold conversion tests**

```ts
import { describe, it, expect } from "vitest";
import { convertToSlackFormat } from "../template-merge";

describe("convertToSlackFormat", () => {
  describe("bold conversion", () => {
    it("converts **text** to *text*", () => {
      expect(convertToSlackFormat("**hello**")).toBe("*hello*");
    });

    it("handles trailing whitespace inside bold markers", () => {
      expect(convertToSlackFormat("**Revision Rounds: **2")).toBe(
        "*Revision Rounds:* 2"
      );
    });

    it("converts multiple bold segments on one line", () => {
      expect(convertToSlackFormat("**a** and **b**")).toBe("*a* and *b*");
    });
  });
});
```

**Step 2: Run to verify tests pass**

Run: `npx vitest run src/lib/__tests__/template-merge.test.ts`
Expected: PASS

**Step 3: Add header conversion tests**

```ts
  describe("header conversion", () => {
    it("converts ## text to *text*", () => {
      expect(convertToSlackFormat("## What You're Receiving")).toBe(
        "*What You're Receiving*"
      );
    });

    it("converts ## **emoji text** without triple asterisks", () => {
      expect(convertToSlackFormat("## **⚡ What You're Receiving**")).toBe(
        "*⚡ What You're Receiving*"
      );
    });

    it("converts # text to *text*", () => {
      expect(convertToSlackFormat("# Title")).toBe("*Title*");
    });

    it("converts ### text to *text*", () => {
      expect(convertToSlackFormat("### Sub")).toBe("*Sub*");
    });
  });
```

**Step 4: Add link, mention, bullet, and emoji tests**

```ts
  describe("link conversion", () => {
    it("converts [text](url) to <url|text>", () => {
      expect(convertToSlackFormat("[Click here](https://example.com)")).toBe(
        "<https://example.com|Click here>"
      );
    });
  });

  describe("mention conversion", () => {
    it("converts @[Name](userId) to <@userId>", () => {
      expect(convertToSlackFormat("@[Emily](U05AC4CFK62)")).toBe(
        "<@U05AC4CFK62>"
      );
    });
  });

  describe("bullet conversion", () => {
    it("converts - text to em-space bullet", () => {
      const result = convertToSlackFormat("- Item one");
      expect(result).toContain("•");
      expect(result).toContain("Item one");
      expect(result).not.toStartWith("-");
    });
  });

  describe("emoji conversion", () => {
    it("converts ⚡ to :zap:", () => {
      expect(convertToSlackFormat("⚡")).toBe(":zap:");
    });

    it("strips variation selectors", () => {
      expect(convertToSlackFormat("⚡\uFE0F")).toBe(":zap:");
    });
  });
```

**Step 5: Add round-trip integration test with a real template snippet**

```ts
  describe("real template snippet", () => {
    it("converts a full template section without raw markdown leaking", () => {
      const input = [
        "## **⚡ What You're Receiving**",
        "- **Motion Graphics Storyboards:** A static visual preview.",
        "- **Animatic:** A rough cut showing timing.",
        "",
        "## **📋 How to Submit Feedback**",
        "- **All feedback should be left directly in [Frame.io](https://f.io/abc).**",
        "- Please consolidate feedback before submitting.",
      ].join("\n");

      const result = convertToSlackFormat(input);

      // No raw markdown should remain
      expect(result).not.toContain("**");
      expect(result).not.toContain("##");
      expect(result).not.toMatch(/\[.*\]\(.*\)/);

      // Should contain Slack formatting
      expect(result).toContain("*⚡ What You're Receiving*");
      expect(result).toContain("*Motion Graphics Storyboards:*");
      expect(result).toContain("<https://f.io/abc|Frame.io>");
    });
  });
```

**Step 6: Run full suite**

Run: `npx vitest run src/lib/__tests__/template-merge.test.ts`
Expected: All PASS

**Step 7: Commit**

```bash
git add src/lib/__tests__/template-merge.test.ts
git commit -m "test: add convertToSlackFormat test suite"
```

---

### Task 3: Slack Formatting Linter

**Files:**
- Create: `src/lib/slack-lint.ts`
- Create: `src/lib/__tests__/slack-lint.test.ts`

**Step 1: Write the failing tests for the linter**

```ts
import { describe, it, expect } from "vitest";
import { lintSlackMrkdwn } from "../slack-lint";

describe("lintSlackMrkdwn", () => {
  it("returns empty array for valid mrkdwn", () => {
    expect(lintSlackMrkdwn("*bold* and <https://x.com|link>")).toEqual([]);
  });

  it("detects remaining ** bold markers", () => {
    const errors = lintSlackMrkdwn("**still bold**");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("unconverted bold");
  });

  it("detects remaining ## headers", () => {
    const errors = lintSlackMrkdwn("## Header");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("unconverted header");
  });

  it("detects remaining markdown links", () => {
    const errors = lintSlackMrkdwn("[text](https://example.com)");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("unconverted link");
  });

  it("detects raw HTML tags", () => {
    const errors = lintSlackMrkdwn("<strong>text</strong>");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("HTML");
  });

  it("detects unconverted mention syntax", () => {
    const errors = lintSlackMrkdwn("@[Emily](U05AC4CFK62)");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("unconverted mention");
  });

  it("detects excessive blank lines", () => {
    const errors = lintSlackMrkdwn("line1\n\n\n\nline2");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("blank lines");
  });

  it("does not flag valid Slack mention tokens", () => {
    expect(lintSlackMrkdwn("<@U05AC4CFK62>")).toEqual([]);
  });

  it("does not flag valid Slack links", () => {
    expect(lintSlackMrkdwn("<https://example.com|text>")).toEqual([]);
  });
});
```

**Step 2: Run to verify tests fail**

Run: `npx vitest run src/lib/__tests__/slack-lint.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the linter**

```ts
// src/lib/slack-lint.ts

export interface SlackLintError {
  line: number;
  message: string;
  text: string;
}

export function lintSlackMrkdwn(mrkdwn: string): SlackLintError[] {
  const errors: SlackLintError[] = [];
  const lines = mrkdwn.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Remaining ** bold markers (but not single *)
    if (/\*\*/.test(line)) {
      errors.push({
        line: lineNum,
        message: "Remaining unconverted bold markers (**). Should be single *.",
        text: line,
      });
    }

    // Remaining ## headers
    if (/^#{1,3}\s+/.test(line)) {
      errors.push({
        line: lineNum,
        message: "Remaining unconverted header (##). Should be *Header*.",
        text: line,
      });
    }

    // Remaining markdown links [text](url) — but NOT Slack links <url|text>
    // and NOT mention syntax @[Name](id)
    if (/(?<!@)\[[^\]]+\]\([^)]+\)/.test(line)) {
      errors.push({
        line: lineNum,
        message:
          "Remaining unconverted link [text](url). Should be <url|text>.",
        text: line,
      });
    }

    // Raw HTML tags (common ones from TipTap)
    if (/<\/?(strong|em|b|i|a|h[1-6]|ul|ol|li|p|br|div|span)\b/i.test(line)) {
      // Exclude Slack tokens like <@U...> and <https://...|text>
      const stripped = line
        .replace(/<@[A-Z0-9]+>/g, "")
        .replace(/<https?:\/\/[^>]+>/g, "");
      if (/<\/?(strong|em|b|i|a|h[1-6]|ul|ol|li|p|br|div|span)\b/i.test(stripped)) {
        errors.push({
          line: lineNum,
          message: "Raw HTML tag found. Slack does not render HTML.",
          text: line,
        });
      }
    }

    // Unconverted mention syntax @[Name](id)
    if (/@\[[^\]]+\]\([^)]+\)/.test(line)) {
      errors.push({
        line: lineNum,
        message:
          "Remaining unconverted mention @[Name](id). Should be <@userId>.",
        text: line,
      });
    }
  }

  // Excessive blank lines (3+ consecutive newlines = 2+ blank lines)
  const blankRuns = mrkdwn.match(/\n{3,}/g);
  if (blankRuns) {
    // Find line numbers of excessive blank runs
    let pos = 0;
    for (const run of blankRuns) {
      const idx = mrkdwn.indexOf(run, pos);
      const lineNum = mrkdwn.substring(0, idx).split("\n").length;
      errors.push({
        line: lineNum,
        message: `Excessive blank lines (${run.length - 1}). Slack collapses to max 1 blank line.`,
        text: "",
      });
      pos = idx + run.length;
    }
  }

  return errors;
}
```

**Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/slack-lint.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/lib/slack-lint.ts src/lib/__tests__/slack-lint.test.ts
git commit -m "feat: add Slack mrkdwn linter with test suite"
```

---

### Task 4: Export Emoji Map from `convertToSlackFormat`

The Slack Markdown Preview renderer needs the emoji map. Currently it's a local variable inside `convertToSlackFormat()`. Extract it so it can be reused.

**Files:**
- Modify: `src/lib/template-merge.ts`

**Step 1: Extract emoji map to an exported constant**

Move the `emojiMap` object from inside `convertToSlackFormat()` to a module-level export:

```ts
/** Unicode emoji → Slack shortcode mapping. Used by both convertToSlackFormat and the preview renderer. */
export const SLACK_EMOJI_MAP: Record<string, string> = {
  "\u{1F6A8}": ":rotating_light:",
  // ... (all existing entries)
};
```

Update `convertToSlackFormat()` to reference `SLACK_EMOJI_MAP` instead of the local `emojiMap`.

**Step 2: Run existing tests to verify no regression**

Run: `npx vitest run`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/lib/template-merge.ts
git commit -m "refactor: export SLACK_EMOJI_MAP for reuse by preview renderer"
```

---

### Task 5: Slack Mrkdwn Renderer Component

**Files:**
- Create: `src/components/shared/slack-mrkdwn-renderer.tsx`

**Step 1: Build the renderer**

A React component that takes a mrkdwn string and renders it as Slack would display it.

Key rendering rules:
- `*text*` → `<strong>` (bold)
- `<url|text>` → `<a>` styled link (blue, underlined)
- `<@userId>` → mention chip (blue background, like Slack)
- `:shortcode:` → emoji (reverse lookup from `SLACK_EMOJI_MAP`, plus common Slack shortcodes)
- `\u2003\u2003•\u2002text` → indented bullet (preserve em-space visual indent)
- Line breaks: single `\n` → `<br>`, double `\n\n` → paragraph gap, triple+ collapsed to double
- Plain text passthrough for everything else

The component should accept:
```ts
interface SlackMrkdwnRendererProps {
  content: string;
  className?: string;
}
```

Style it to approximate Slack's appearance: `font-family: 'Lato', sans-serif` (or system-ui), 15px text, #1d1c1d text color in light / #d1d2d3 in dark, white/dark background.

**Step 2: Commit**

```bash
git add src/components/shared/slack-mrkdwn-renderer.tsx
git commit -m "feat: add SlackMrkdwnRenderer component"
```

---

### Task 6: Slack Preview & Source Panel Component

**Files:**
- Create: `src/components/shared/slack-validation-panel.tsx`

**Step 1: Build the panel**

A tabbed panel component with two views:

```ts
interface SlackValidationPanelProps {
  markdown: string; // Raw markdown (pre-conversion)
  className?: string;
}
```

Internally:
1. Run `convertToSlackFormat(markdown)` on the input (debounced 300ms)
2. Run `lintSlackMrkdwn(convertedOutput)` on the result

**"Slack Markdown Preview" tab:**
- Render converted mrkdwn using `SlackMrkdwnRenderer`
- Collapsible, open by default

**"Slack Source" tab:**
- Show raw mrkdwn in a `<pre>` block with monospace font
- Lint errors highlighted: red underline on the offending line, tooltip on hover with error message
- Error count badge on the tab label: "Slack Source (3)"

**Lint error summary:**
- If errors exist, show a banner above the tabs: "N formatting issues found" with a list
- This banner is read by parent components to determine if save/send should be blocked

Expose lint errors via a callback prop:
```ts
  onLintResult?: (errors: SlackLintError[]) => void;
```

**Step 2: Commit**

```bash
git add src/components/shared/slack-validation-panel.tsx
git commit -m "feat: add SlackValidationPanel with preview and source tabs"
```

---

### Task 7: Integrate into Delivery Send Editor (Slack Mode)

**Files:**
- Modify: `src/components/delivery-form/preview-panel.tsx`
- Modify: `src/components/delivery-form/send-bar.tsx`

**Step 1: Add SlackValidationPanel to preview panel**

In `PreviewPanel`, when `showSlack` is true, render `SlackValidationPanel` below the TipTap editor. Pass the current Slack markdown content. Wire up `onLintResult` to track errors in state.

**Step 2: Block send when lint errors exist**

In `SendBar`, accept a new prop `slackLintErrors: SlackLintError[]`. When errors exist:
- The Send button opens an error panel instead of the confirmation dialog
- Error panel lists all issues
- "Send Anyway" link at bottom dismisses errors and opens the normal confirmation dialog

**Step 3: Pass lint errors from delivery form to send bar**

In `delivery-form.tsx`, lift lint error state up from PreviewPanel and pass down to SendBar.

**Step 4: Verify build**

Run: `npx next build`
Expected: Success

**Step 5: Commit**

```bash
git add src/components/delivery-form/preview-panel.tsx src/components/delivery-form/send-bar.tsx src/components/delivery-form/delivery-form.tsx
git commit -m "feat: integrate Slack validation panel into delivery editor"
```

---

### Task 8: Integrate into Template Editor

**Files:**
- Modify: `src/app/templates/[taskId]/page.tsx`

**Step 1: Add SlackValidationPanel to template editor**

Below the TipTap snippet editor, render `SlackValidationPanel` with the current `snippet` markdown. Wire up `onLintResult`.

**Step 2: Block save when lint errors exist**

When lint errors are present:
- The Save button shows an error count badge
- Clicking Save opens a lint error panel instead of saving
- "Save Anyway" button in the panel proceeds with the save

**Step 3: Verify build**

Run: `npx next build`
Expected: Success

**Step 4: Manual test**

- Open a template with `## **⚡ Header**` in the snippet
- Verify the lint panel catches the double bold/header pattern
- Verify Slack Markdown Preview renders the converted output
- Verify Slack Source highlights the error

**Step 5: Commit**

```bash
git add src/app/templates/[taskId]/page.tsx
git commit -m "feat: integrate Slack validation panel into template editor"
```

---

### Task 9: Final Integration Tests

**Files:**
- Modify: `src/lib/__tests__/template-merge.test.ts`

**Step 1: Add end-to-end lint integration tests**

Test that `convertToSlackFormat()` output passes `lintSlackMrkdwn()` with zero errors for well-formed input:

```ts
import { lintSlackMrkdwn } from "../slack-lint";

describe("end-to-end: conversion + lint", () => {
  it("converted output of a valid template has zero lint errors", () => {
    const template = [
      "## ⚡ What You're Receiving",
      "- **Storyboards:** A visual preview.",
      "",
      "## 📋 How to Submit Feedback",
      "- **All feedback in [Frame.io](https://f.io/abc).**",
    ].join("\n");

    const converted = convertToSlackFormat(template);
    const errors = lintSlackMrkdwn(converted);
    expect(errors).toEqual([]);
  });

  it("lint catches unconverted content that bypasses conversion", () => {
    // Simulate content that somehow bypasses conversion
    const bad = "**broken bold** and ## broken header";
    const errors = lintSlackMrkdwn(bad);
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run full suite**

Run: `npx vitest run`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/lib/__tests__/template-merge.test.ts
git commit -m "test: add end-to-end conversion + lint integration tests"
```
