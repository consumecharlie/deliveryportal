/**
 * Tests for the template linter.
 *
 * The linter is the single source of truth for "is this template
 * compliant?" — both the audit page and Magic Cleanup self-check use
 * it.
 */
import { describe, it, expect } from "vitest";
import { lintTemplate } from "../template-lint";

describe("formatting rules (errors)", () => {
  it("flags trailing-space-in-bold", () => {
    const issues = lintTemplate("- **Revision Rounds: **1 of 2");
    expect(issues).toContainEqual(
      expect.objectContaining({
        rule: "trailing-space-in-bold",
        severity: "error",
      })
    );
  });

  it("flags leading-space-in-bold", () => {
    const issues = lintTemplate("- ** Revision Rounds:**1 of 2");
    expect(issues).toContainEqual(
      expect.objectContaining({
        rule: "leading-space-in-bold",
        severity: "error",
      })
    );
  });

  it("does NOT flag well-formed bold", () => {
    const errors = lintTemplate("- **Revision Rounds:** 1 of 2").filter(
      (i) => i.severity === "error"
    );
    expect(errors).toEqual([]);
  });

  it("does NOT flag two adjacent well-formed bolds on one line", () => {
    // From the real fix: **Revision Rounds:** 1 of **[revisionRounds]**
    const errors = lintTemplate(
      "- **Revision Rounds:** 1 of **[revisionRounds]**"
    ).filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });

  it("flags orphan header line (## with no content)", () => {
    const issues = lintTemplate("# Greeting\n\n## \n\n## Real Section");
    expect(issues).toContainEqual(
      expect.objectContaining({ rule: "orphan-header", severity: "error" })
    );
  });

  it("flags asterisk bullet markers (canonical is dash)", () => {
    const issues = lintTemplate("* item one\n* item two");
    expect(issues).toContainEqual(
      expect.objectContaining({
        rule: "asterisk-bullet-marker",
        severity: "error",
      })
    );
  });

  it("does NOT flag dash bullets", () => {
    const errors = lintTemplate("- item one\n- item two").filter(
      (i) => i.severity === "error"
    );
    expect(errors).toEqual([]);
  });
});

describe("variable hygiene rules (warnings)", () => {
  it("flags unknown solo template variables", () => {
    const issues = lintTemplate("Hello [unknownVarName]");
    expect(issues).toContainEqual(
      expect.objectContaining({
        rule: "unknown-variable",
        severity: "warning",
      })
    );
  });

  it("does NOT flag known solo variables", () => {
    const warnings = lintTemplate("Hello [contacts], [projectName]").filter(
      (i) => i.severity === "warning" && i.rule.includes("variable")
    );
    expect(warnings).toEqual([]);
  });

  it("does NOT confuse markdown links with template variables", () => {
    const issues = lintTemplate("See [our docs](https://example.com)");
    expect(issues.filter((i) => i.rule === "unknown-variable")).toEqual([]);
  });

  it("flags malformed link variables (non-link target)", () => {
    // projectName is a string variable, not a link variable
    const issues = lintTemplate("[See the project | projectName]");
    expect(issues).toContainEqual(
      expect.objectContaining({
        rule: "malformed-link-variable",
        severity: "warning",
      })
    );
  });

  it("does NOT flag well-formed link variables", () => {
    const warnings = lintTemplate(
      "- [Frame review | frameReviewLink]"
    ).filter((i) => i.rule === "malformed-link-variable");
    expect(warnings).toEqual([]);
  });

  it("flags unknown link variable target", () => {
    const issues = lintTemplate("- [Link | nonexistentLink]");
    expect(issues).toContainEqual(
      expect.objectContaining({
        rule: "malformed-link-variable",
        severity: "warning",
      })
    );
  });

  it("does NOT flag the deprecated [contact] greeting — handled by cleanup compliance", () => {
    const issues = lintTemplate("Hey [contact],");
    // It's not an "unknown-variable" because it's a known deprecated form;
    // the cleanup-compliance rule will surface it instead.
    expect(issues.filter((i) => i.rule === "unknown-variable")).toEqual([]);
  });
});

describe("cleanup compliance rules (warnings)", () => {
  it("flags templates that would change when run through Magic Cleanup", () => {
    // Deprecated [contact] greeting is rewritten to [contactFirstName] by cleanup
    const issues = lintTemplate("Hey [contact], welcome.\n\n## Section\n- item");
    expect(issues).toContainEqual(
      expect.objectContaining({
        rule: "not-cleanup-compliant",
        severity: "warning",
      })
    );
  });

  it("does NOT flag a template that is already cleanup-compliant", () => {
    const compliant = `Hey [contactFirstName], welcome.

[versionNotes]

## 🔔 Scope & Timeline Reminders
- **Revision Rounds:** 1 of [revisionRounds]
- **Feedback Windows:** [feedbackWindows]
- **Feedback Deadline:** EOD [nextFeedbackDeadline]
- Additional revisions beyond the included revision rounds will require a scope adjustment.

## 🔗 Review Link
- [Frame review | frameReviewLink]

## 🗓 Project Plan
- [View real-time progress | projectPlanLink]`;
    const warnings = lintTemplate(compliant).filter(
      (i) => i.rule === "not-cleanup-compliant"
    );
    expect(warnings).toEqual([]);
  });
});

describe("issue metadata", () => {
  it("returns lineNumber for line-anchored issues", () => {
    const issues = lintTemplate("line 1\n* bullet on line 2");
    const bulletIssue = issues.find((i) => i.rule === "asterisk-bullet-marker");
    expect(bulletIssue?.lineNumber).toBe(2);
  });

  it("returns an empty array for a clean template", () => {
    const compliant = `Hey [contactFirstName], welcome.

[versionNotes]

## 🔔 Scope & Timeline Reminders
- **Revision Rounds:** 1 of [revisionRounds]
- **Feedback Windows:** [feedbackWindows]
- **Feedback Deadline:** EOD [nextFeedbackDeadline]
- Additional revisions beyond the included revision rounds will require a scope adjustment.

## 🔗 Review Link
- [Frame review | frameReviewLink]

## 🗓 Project Plan
- [View real-time progress | projectPlanLink]`;
    expect(lintTemplate(compliant)).toEqual([]);
  });
});
