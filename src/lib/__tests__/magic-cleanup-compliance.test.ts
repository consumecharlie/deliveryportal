/**
 * Magic Cleanup compliance contract.
 *
 * For every input we throw at it, `magicCleanup(input)` must produce
 * output that the linter does not flag as an ERROR. Cleanup is allowed
 * to surface warnings (e.g. cleanup-compliant means input == output,
 * not "no warnings ever").
 *
 * If this test ever fails, Magic Cleanup itself has drifted out of
 * compliance with the standard it is supposed to enforce.
 */
import { describe, it, expect } from "vitest";
import { magicCleanup } from "../template-cleanup";
import { lintTemplate } from "../template-lint";

const FIXTURES: Array<{ name: string; md: string }> = [
  {
    name: "minimal greeting with one section",
    md: `Hey [contacts],\n\n## 🔔 Scope & Timeline Reminders\n- some content`,
  },
  {
    name: "deprecated [contact] greeting + ## Next Step section",
    md: `Hey [contact],\n\n## ⚡ What You're Receiving\nFoo bar\n\n## ⏭️ Next Step\nDo a thing.\n\n## 🔔 Scope & Timeline Reminders\nold content`,
  },
  {
    name: "asterisk bullets get normalized",
    md: `Hey [contacts],\n\n## 🔔 Scope & Timeline Reminders\n* old bullet\n* another old bullet`,
  },
  {
    name: "Review Link section + Loom mention",
    md: `Hey [contacts],\n\nLoom walkthrough included.\n\n## 🔗 Review Link\nold review link content`,
  },
  {
    name: "Project Plan canonicalization",
    md: `Hey [contacts],\n\n## 🗓 Project Plan\nold content here`,
  },
  {
    name: "Pre-pro deliverable type sets correct review link",
    md: `Hey [contacts],\n\n## 🔗 Review Link\nold content`,
  },
];

describe("Magic Cleanup compliance contract", () => {
  for (const fixture of FIXTURES) {
    it(`produces zero errors for: ${fixture.name}`, () => {
      const out = magicCleanup(fixture.md, {
        deliverableType: "Edit V1",
        department: "Post",
      });
      const errors = lintTemplate(out).filter((i) => i.severity === "error");
      if (errors.length > 0) {
        // Surface the offending output so failures are easy to debug
        console.error("OUTPUT WITH ERRORS:\n" + out);
        console.error("ERRORS:", errors);
      }
      expect(errors).toEqual([]);
    });
  }

  it("is idempotent: cleanup(cleanup(x)) === cleanup(x)", () => {
    for (const fixture of FIXTURES) {
      const once = magicCleanup(fixture.md);
      const twice = magicCleanup(once);
      expect(twice).toBe(once);
    }
  });

  it("cleanup output of an already-compliant template passes lint with zero errors AND no cleanup-compliance warning", () => {
    const compliant = `Hey [contactFirstName],

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
    const out = magicCleanup(compliant, {
      deliverableType: "Edit V1",
      department: "Post",
    });
    const issues = lintTemplate(out);
    expect(issues).toEqual([]);
  });
});
