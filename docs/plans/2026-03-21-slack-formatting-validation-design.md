# Slack Formatting Validation System

## Problem

The delivery portal converts markdown to Slack mrkdwn at send time via `convertToSlackFormat()`. There is no automated validation, no tests, and the TipTap preview renders HTML — not mrkdwn — so formatting issues (like double-asterisk bold headers) reach Slack undetected.

## Solution

Three layers of gatekeeping to ensure formatting is correct before it reaches Slack.

## Layer 1: Test Suite for `convertToSlackFormat()`

Vitest tests covering every conversion rule with real template patterns.

**Coverage:**
- Bold: `**text**` → `*text*`, trailing whitespace fix
- Headers: `## text` → `*text*`, `## **emoji text**` → `*emoji text*` (no triple asterisks)
- Links: `[text](url)` → `<url|text>`
- Mentions: `@[Name](userId)` → `<@userId>`
- Bullets: `- text` → em-space indented bullets
- Emoji: Unicode → shortcodes, variation selector stripping
- Round-trip: actual template snippets through `mergeTemplate()` → `convertToSlackFormat()`
- Edge cases: empty content, headers only, already-converted content

**Runs in CI. Catches regressions before deployment.**

## Layer 2: Slack Formatting Linter

A `lintSlackMrkdwn(mrkdwn: string)` function that returns an array of errors, each with message, line number, and offending text.

**Checks:**
- `**` remaining (unconverted bold)
- `##` or `#` remaining (unconverted headers)
- `[text](url)` remaining (unconverted markdown links)
- Unmatched/unclosed `*` markers (odd count per line)
- Raw HTML tags (`<strong>`, `<em>`, `<a href=...>`, etc.)
- `@[Name](id)` remaining (unconverted mention syntax)
- Excessive blank lines (3+ consecutive `\n` — Slack collapses these)
- Missing blank line before headers (Slack needs separation)

**Where it runs:**

- **Template editor** — on save. Blocks saving with errors visible. "Save Anyway" override available.
- **Delivery send editor (Slack mode only)** — on Send click. Blocks send confirmation with error panel. "Send Anyway" override available.

**Not checked (too noisy):** emoji without shortcode mappings, line length, whitespace preferences.

## Layer 3: Slack Markdown Preview & Source Panel

A toggle panel with two views, running `convertToSlackFormat()` on current content in real-time (debounced ~300ms).

### "Slack Markdown Preview" tab

A read-only rendered view that interprets mrkdwn the way Slack does:
- `*text*` renders bold
- `<url|text>` renders as clickable links
- `<@userId>` renders as styled mention chips
- `:emoji:` shortcodes render as emoji
- Em-space bullets with proper indentation
- **Line break fidelity** (core requirement):
  - Single `\n` → inline line break (same block, no gap)
  - Double `\n\n` → paragraph break (visible gap)
  - Triple+ `\n\n\n` → same as double (Slack collapses extras)
  - Blank line before/after bullet lists → list separation gap
  - No blank line between bullets → tight list

### "Slack Source" tab

Raw mrkdwn text output with lint errors highlighted inline (red underline + tooltip).

### Where each panel appears

| Feature | Template Editor | Delivery Send Editor (Slack mode) | Delivery Send Editor (Email mode) |
|---------|----------------|----------------------------------|----------------------------------|
| TipTap editor | Yes (authoring) | Yes (inline edits) | Yes (inline edits) |
| Slack Markdown Preview | Yes (always) | Yes | No |
| Slack Source | Yes (always) | Yes | No |
| Lint on save/send | Yes (both channels) | Yes (Slack lint) | No |

**Rationale:** Templates are shared across both channels, so the template editor always validates for Slack. The delivery send editor only shows Slack tooling when in Slack mode — email mode uses TipTap preview which is already faithful to email rendering.

### Implementation

- Lightweight React component — bold, links, mentions, bullets, emoji, line breaks. Not a full Slack clone.
- Reuses existing emoji map from `convertToSlackFormat()`
- In template editor, unmerged variables like `[contacts]` render as placeholder chips
- Panel sits below TipTap editor, collapsible

## Behavior: Lint Blocking

- Lint errors **block** the action (save or send) by default
- Error panel shows all issues with line numbers and offending text
- Manual override available: "Save Anyway" / "Send Anyway" link at bottom of error panel
- Override is intentional friction — requires explicit acknowledgment
