/**
 * Template linter — the single source of truth for "is this delivery
 * snippet compliant?". Both the audit page and the in-editor validation
 * use this. Magic Cleanup's self-check uses it as a contract: cleanup
 * must never produce output that the linter flags as an error.
 *
 * Issue model:
 *   - `error`   : actual broken markdown that affects email rendering.
 *                 Must be fixed.
 *   - `warning` : drift from the standard or hygiene issue. Fixable but
 *                 not necessarily broken.
 *
 * Rules (and the bug each one prevents):
 *
 *   FORMATTING (errors)
 *     trailing-space-in-bold   →  `**Word: **` renders literal ** in n8n
 *     leading-space-in-bold    →  `** Word**` same problem, mirror image
 *     orphan-header            →  bare "## " line in template editor
 *     asterisk-bullet-marker   →  inconsistent with the rest of the
 *                                 canonical templates; some renderers
 *                                 treat `*` as italic at line start
 *
 *   VARIABLE HYGIENE (warnings)
 *     unknown-variable         →  typo'd [varName] would be sent as
 *                                 literal brackets in the final email
 *     malformed-link-variable  →  [Label | varName] where varName isn't
 *                                 a link variable would emit junk
 *
 *   CLEANUP COMPLIANCE (warnings)
 *     not-cleanup-compliant    →  catch-all: Magic Cleanup would change
 *                                 the template. Covers deprecated
 *                                 greeting variables, missing section
 *                                 bullets, etc.
 */

import { TEMPLATE_VARIABLE_META } from "../components/shared/template-variable-extension";
import { magicCleanup } from "./template-cleanup";

export type LintSeverity = "error" | "warning";

export interface LintIssue {
  rule: string;
  severity: LintSeverity;
  message: string;
  lineNumber?: number;
  context?: string;
}

const KNOWN_VARIABLES = new Set(Object.keys(TEMPLATE_VARIABLE_META));
const LINK_VARIABLES = new Set(
  Object.entries(TEMPLATE_VARIABLE_META)
    .filter(([, meta]) => meta.category === "link")
    .map(([key]) => key)
);

// Deprecated forms — known but flagged separately by cleanup compliance,
// not as unknown variables.
const DEPRECATED_VARIABLES = new Set(["contact", "feedbackDeadline"]);

/**
 * Check whether the closing `**` in a `**…**` pair is preceded by
 * whitespace, or the opening `**` is followed by whitespace. Standalone
 * passes — handles the typical case where bold spans don't contain
 * intentional whitespace at the boundaries.
 */
function findBoldEmphasisIssues(line: string, lineNumber: number): LintIssue[] {
  const issues: LintIssue[] = [];
  // Find every `**…**` pair on the line. The non-greedy capture stops at
  // the next `**`, which gives us each pair in turn.
  const pairRe = /\*\*([^*\n]*?)\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(line)) !== null) {
    const inner = m[1];
    if (inner.length === 0) continue;
    if (/\s$/.test(inner)) {
      issues.push({
        rule: "trailing-space-in-bold",
        severity: "error",
        message:
          "Bold span has whitespace before its closing `**`. The CommonMark parser used by n8n will render the asterisks literally in the email.",
        lineNumber,
        context: m[0],
      });
    }
    if (/^\s/.test(inner)) {
      issues.push({
        rule: "leading-space-in-bold",
        severity: "error",
        message:
          "Bold span has whitespace right after its opening `**`. Strict markdown parsers will render the asterisks literally.",
        lineNumber,
        context: m[0],
      });
    }
  }
  return issues;
}

function findOrphanHeader(line: string, lineNumber: number): LintIssue | null {
  if (/^#{1,3}\s*$/.test(line)) {
    return {
      rule: "orphan-header",
      severity: "error",
      message:
        "Header line has no content. Shows as a stray `##` in the template editor.",
      lineNumber,
      context: line,
    };
  }
  return null;
}

function findAsteriskBullet(
  line: string,
  lineNumber: number
): LintIssue | null {
  if (/^\s*\*\s+\S/.test(line)) {
    return {
      rule: "asterisk-bullet-marker",
      severity: "error",
      message:
        "Bullet uses `*` instead of `-`. The canonical templates use `-`; mixing markers can be misread as italic at the start of a line.",
      lineNumber,
      context: line,
    };
  }
  return null;
}

/**
 * Walk every `[…]` bracket on the line. Classify each one:
 *   markdown link        →  `[text](url)`         — skip
 *   solo variable        →  `[varName]`           — must be known
 *   linked variable      →  `[Label | varName]`   — varName must be a
 *                                                  link variable
 *   deprecated form      →  `[contact]` etc.      — skip (cleanup
 *                                                  compliance will
 *                                                  surface it)
 */
function findVariableIssues(line: string, lineNumber: number): LintIssue[] {
  const issues: LintIssue[] = [];
  // Match every `[…]` pair, capturing the bracket contents and what
  // follows so we can tell links from variables.
  const re = /\[([^\]]+)\](\()?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const inside = m[1];
    const followedByParen = m[2] === "(";
    if (followedByParen) continue; // markdown link, not a variable

    // Linked variable: `[Label | varName]`
    const pipeMatch = inside.match(/^\s*(.+?)\s*\|\s*([A-Za-z_][\w]*)\s*$/);
    if (pipeMatch) {
      const varName = pipeMatch[2];
      if (!LINK_VARIABLES.has(varName)) {
        issues.push({
          rule: "malformed-link-variable",
          severity: "warning",
          message: KNOWN_VARIABLES.has(varName)
            ? `\`${varName}\` is not a link variable, so \`[Label | ${varName}]\` won't render as a hyperlink.`
            : `Unknown link target \`${varName}\`. Expected one of: ${[...LINK_VARIABLES].join(", ")}.`,
          lineNumber,
          context: m[0],
        });
      }
      continue;
    }

    // Solo variable: `[varName]` where varName looks like an identifier.
    //
    // Only treat camelCase-style brackets (starts with a lowercase letter)
    // as template-variable ATTEMPTS. Real template variables all follow
    // that convention (`contacts`, `projectName`, `frameReviewLink`).
    // TitleCase or single-letter brackets like `[Interviewee]`, `[Topic]`,
    // `[X]`, `[Speaker]` are conventional script/template placeholders
    // meant to be human-edited, not portal variables — flagging them
    // produces noise on every script template that contains them.
    const soloMatch = inside.match(/^\s*([a-z][\w]*)\s*$/);
    if (soloMatch) {
      const varName = soloMatch[1];
      if (
        !KNOWN_VARIABLES.has(varName) &&
        !DEPRECATED_VARIABLES.has(varName)
      ) {
        issues.push({
          rule: "unknown-variable",
          severity: "warning",
          message: `\`[${varName}]\` is not a known template variable. It will be sent as literal text in the email.`,
          lineNumber,
          context: m[0],
        });
      }
      continue;
    }
    // Anything else inside brackets (e.g. inline text like
    // `[click here]` with no following `(url)`) — leave alone.
  }
  return issues;
}

/**
 * Cleanup compliance: does Magic Cleanup leave this template alone?
 * If not, the differences are flagged as a single warning so the audit
 * UI can offer a preview-and-fix flow.
 *
 * Pass through `deliverableType` and `department` if the caller knows
 * them — Magic Cleanup's Review Link transform depends on both, so
 * checking compliance without them produces false positives (the
 * canonical bullet for a Pre-Pro template is `[Document | …]`, but
 * without the department option cleanup defaults to `[Frame review | …]`).
 */
export interface LintOptions {
  deliverableType?: string;
  department?: string;
}

function findCleanupComplianceIssues(
  input: string,
  opts: LintOptions
): LintIssue[] {
  const cleaned = magicCleanup(input, opts);
  if (cleaned.trim() === input.trim()) return [];
  return [
    {
      rule: "not-cleanup-compliant",
      severity: "warning",
      message:
        "Template differs from its Magic-Cleanup-normalized form. Run cleanup to bring it in line with the standard.",
    },
  ];
}

export function lintTemplate(
  markdown: string,
  opts: LintOptions = {}
): LintIssue[] {
  if (!markdown) return [];
  const issues: LintIssue[] = [];
  const lines = markdown.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    issues.push(...findBoldEmphasisIssues(line, lineNumber));
    const orphan = findOrphanHeader(line, lineNumber);
    if (orphan) issues.push(orphan);
    const bullet = findAsteriskBullet(line, lineNumber);
    if (bullet) issues.push(bullet);
    issues.push(...findVariableIssues(line, lineNumber));
  }

  issues.push(...findCleanupComplianceIssues(markdown, opts));
  return issues;
}

/** Summary helpers for the audit UI. */
export function countBySeverity(issues: LintIssue[]): {
  errors: number;
  warnings: number;
} {
  let errors = 0;
  let warnings = 0;
  for (const issue of issues) {
    if (issue.severity === "error") errors++;
    else warnings++;
  }
  return { errors, warnings };
}
