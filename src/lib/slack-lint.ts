/**
 * Slack mrkdwn linter.
 *
 * Validates that a string intended as Slack mrkdwn does not contain
 * unconverted markdown syntax or raw HTML. Returns an array of lint
 * errors — an empty array means the input is clean.
 */

export interface SlackLintError {
  line: number;
  message: string;
  text: string;
}

/**
 * Lint a Slack mrkdwn string for common formatting mistakes.
 */
export function lintSlackMrkdwn(mrkdwn: string): SlackLintError[] {
  const errors: SlackLintError[] = [];
  const lines = mrkdwn.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // ── Unconverted bold: ** still present ──
    if (/\*\*/.test(line)) {
      errors.push({
        line: lineNum,
        message: "Unconverted bold markdown (`**`) found",
        text: line,
      });
    }

    // ── Unconverted headers: # at line start ──
    if (/^#{1,6}\s/.test(line)) {
      errors.push({
        line: lineNum,
        message: "Unconverted header markdown (`#`) found",
        text: line,
      });
    }

    // ── Unconverted mentions: @[Name](id) ──
    if (/@\[[^\]]+\]\([^)]+\)/.test(line)) {
      errors.push({
        line: lineNum,
        message: "Unconverted mention (`@[Name](id)`) found",
        text: line,
      });
    }

    // ── Unconverted links: [text](url) — but NOT @[Name](id) which is caught above ──
    // Use a negative lookbehind to exclude @[...](...)
    if (/(?<!@)\[[^\]]+\]\([^)]+\)/.test(line)) {
      errors.push({
        line: lineNum,
        message: "Unconverted link (`[text](url)`) found",
        text: line,
      });
    }

    // ── Raw HTML tags — exclude valid Slack tokens ──
    // Valid Slack: <@U...>, <#C...>, <!...>, <https://...|text>, <mailto:...|text>
    // Invalid: <strong>, <em>, <a href=...>, <h1>, etc.
    // Strategy: find all <...> tokens and check if any look like HTML tags
    const angleBracketMatches = line.matchAll(/<([^>]+)>/g);
    for (const m of angleBracketMatches) {
      const inner = m[1];
      // Skip valid Slack tokens
      if (/^@/.test(inner)) continue; // <@U1234>
      if (/^#/.test(inner)) continue; // <#C1234>
      if (/^!/.test(inner)) continue; // <!here>, <!channel>
      if (/^https?:\/\//.test(inner)) continue; // <https://...|text>
      if (/^mailto:/.test(inner)) continue; // <mailto:...|text>
      // If it looks like an HTML tag, flag it
      if (/^\/?\w/.test(inner)) {
        errors.push({
          line: lineNum,
          message: `Raw HTML tag (\`<${inner.split(/\s/)[0]}>\`) found`,
          text: line,
        });
      }
    }
  }

  // ── Excessive blank lines: 3+ consecutive newlines ──
  const blankLineMatches = mrkdwn.matchAll(/\n{3,}/g);
  for (const m of blankLineMatches) {
    // Find the line number where the excessive blanks start
    const offset = m.index!;
    const lineNum = mrkdwn.slice(0, offset).split("\n").length;
    errors.push({
      line: lineNum,
      message: `Excessive blank lines (${m[0].length - 1} consecutive)`,
      text: "",
    });
  }

  return errors;
}
