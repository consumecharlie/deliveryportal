import { describe, it, expect } from "vitest";
import { mergeTemplate } from "@/lib/template-merge";

const TEMPLATE = [
  "## Scope & Timeline Reminders",
  "- **Revision Rounds:** [revisionRounds]",
  "- **Feedback Windows:** [feedbackWindows]",
  "- **Feedback Deadline:** EOD [nextFeedbackDeadline]",
  "- Additional revisions beyond the included revision rounds will require a scope adjustment.",
].join("\n");

function baseVars(overrides: Record<string, unknown> = {}) {
  return {
    contacts: [{ name: "Jane Doe", role: "Primary" as const }],
    projectName: "AODocs Product Demo",
    versionNotes: "",
    revisionRounds: "2 of 3",
    feedbackWindows: "Flexible",
    nextFeedbackDeadline: "Mon, Jul 6",
    ...overrides,
  };
}

describe("flexible feedback deadline", () => {
  it("reframes the deadline as a soft target when Flexible", () => {
    const { emailContent } = mergeTemplate(TEMPLATE, "subj", baseVars());
    expect(emailContent).toContain(
      "**Feedback Deadline:** Flexible. We're aiming for ~Mon, Jul 6 to stay aligned with the project plan, but this can flex with your team's timeline."
    );
    // No em dashes in client-facing copy.
    expect(emailContent).not.toContain("—");
    // The hard "EOD <date>" phrasing should be gone.
    expect(emailContent).not.toContain("EOD Mon, Jul 6");
    // The Feedback Windows line is untouched.
    expect(emailContent).toContain("**Feedback Windows:** Flexible");
  });

  it("leaves the hard deadline intact for non-flexible windows", () => {
    const { emailContent } = mergeTemplate(
      TEMPLATE,
      "subj",
      baseVars({ feedbackWindows: "48 Hours" })
    );
    expect(emailContent).toContain("**Feedback Deadline:** EOD Mon, Jul 6");
    expect(emailContent).not.toContain("we're aiming for");
  });

  it("defers to the rushed-project notice when both are set", () => {
    const { emailContent } = mergeTemplate(
      TEMPLATE,
      "subj",
      baseVars({ rushedProject: true })
    );
    // Rushed wins: fixed-deadline alert present, flexible wording absent.
    expect(emailContent).toContain("URGENT");
    expect(emailContent).not.toContain("can flex with your team's timeline");
  });

  it("applies to the Slack version too", () => {
    const { slackContent } = mergeTemplate(TEMPLATE, "subj", baseVars());
    expect(slackContent).toContain(
      "Flexible. We're aiming for ~Mon, Jul 6"
    );
  });
});
