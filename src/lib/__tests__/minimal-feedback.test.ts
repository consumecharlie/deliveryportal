import { describe, it, expect } from "vitest";
import {
  mergeTemplate,
  mergeCombinedTemplate,
  buildCombinedTemplate,
  convertToSlackFormat,
} from "@/lib/template-merge";

const TEMPLATE = [
  "Hi [contacts],",
  "",
  "## Scope & Timeline Reminders",
  "- **Revision Rounds:** 1 of [revisionRounds]",
  "- **Feedback Windows:** [feedbackWindows]",
  "- **Feedback Deadline:** EOD [nextFeedbackDeadline]",
  "- Additional revisions beyond the included revision rounds will require a scope adjustment.",
  "",
  "Thanks!",
].join("\n");

const NOTE_GENERIC =
  "- **Next Step:** If feedback is minimal, we'll incorporate it and move straight to the next step of the process.";

function baseVars(overrides: Record<string, unknown> = {}) {
  return {
    contacts: [
      { taskId: "c1", name: "Jane Doe", email: "jane@example.com", role: "Primary" },
    ],
    projectName: "AODocs Product Demo",
    versionNotes: "",
    revisionRounds: "2",
    feedbackWindows: "48 Hours",
    nextFeedbackDeadline: "Mon, Jul 6",
    ...overrides,
  };
}

describe("minimal feedback next-step note", () => {
  it("is absent unless the option is on", () => {
    const { emailContent, slackContent } = mergeTemplate(TEMPLATE, "s", baseVars());
    expect(emailContent).not.toContain("Next Step");
    expect(slackContent).not.toContain("Next Step");
  });

  it("adds the bullet right after the feedback deadline, in both channels", () => {
    const { emailContent, slackContent } = mergeTemplate(
      TEMPLATE,
      "s",
      baseVars({ minimalFeedbackNextStep: true })
    );
    for (const content of [emailContent, slackContent]) {
      const lines = content.split("\n");
      const idx = lines.findIndex((l) => l.includes("**Feedback Deadline:**"));
      expect(lines[idx]).toBe("- **Feedback Deadline:** EOD Mon, Jul 6");
      expect(lines[idx + 1]).toBe(NOTE_GENERIC);
    }
    // No em dashes in client-facing copy.
    expect(emailContent).not.toContain("—");
  });

  it("names the next step when one is given", () => {
    const { emailContent } = mergeTemplate(
      TEMPLATE,
      "s",
      baseVars({ minimalFeedbackNextStep: true, nextStepName: " Final Deliverables. " })
    );
    expect(emailContent).toContain(
      "- **Next Step:** If feedback is minimal, we'll incorporate it and move straight to Final Deliverables."
    );
  });

  it("survives Slack conversion as a bullet with a bold label", () => {
    const { slackContent } = mergeTemplate(
      TEMPLATE,
      "s",
      baseVars({ minimalFeedbackNextStep: true })
    );
    expect(convertToSlackFormat(slackContent)).toContain(
      "• *Next Step:* If feedback is minimal"
    );
  });

  it("leaves the flexible and timed deadline rewrites working", () => {
    const flexible = mergeTemplate(
      TEMPLATE,
      "s",
      baseVars({ minimalFeedbackNextStep: true, feedbackWindows: "Flexible" })
    ).emailContent;
    expect(flexible).toContain("**Feedback Deadline:** We're aiming for ~Mon, Jul 6");
    expect(flexible).toContain(NOTE_GENERIC);

    const timed = mergeTemplate(
      TEMPLATE,
      "s",
      baseVars({ minimalFeedbackNextStep: true, feedbackDeadlineTime: "12:00 PM ET" })
    ).emailContent;
    expect(timed).toContain("- **Feedback Deadline:** Mon, Jul 6 by 12:00 PM ET");
    expect(timed).toContain(NOTE_GENERIC);
  });

  it("follows the rushed block instead of landing inside it", () => {
    const { emailContent } = mergeTemplate(
      TEMPLATE,
      "s",
      baseVars({ minimalFeedbackNextStep: true, rushedProject: true })
    );
    const lines = emailContent.split("\n");
    const noteIdx = lines.indexOf(NOTE_GENERIC);
    expect(noteIdx).toBeGreaterThan(-1);
    expect(lines[noteIdx - 1]).toContain("rushed fees will apply");
    expect(emailContent.split(NOTE_GENERIC)).toHaveLength(2);
  });

  it("anchors on the approval deadline for final-stage templates", () => {
    const finalTemplate = [
      "- **Approval Window:** [feedbackWindows]",
      "- **Approval Deadline:** EOD [nextFeedbackDeadline]",
      "- Additional revision rounds may affect scope.",
    ].join("\n");
    const lines = mergeTemplate(
      finalTemplate,
      "s",
      baseVars({ minimalFeedbackNextStep: true })
    ).emailContent.split("\n");
    expect(lines[2]).toBe(NOTE_GENERIC);
  });

  it("appends the note when the template has no scope bullets", () => {
    const { emailContent } = mergeTemplate(
      "Hi [contacts],\n\nHere is the cut.\n",
      "s",
      baseVars({ minimalFeedbackNextStep: true })
    );
    expect(emailContent.endsWith(`Here is the cut.\n\n${NOTE_GENERIC}`)).toBe(true);
  });

  it("adds the note once, under the primary deadline, in a merged delivery", () => {
    const combinedTemplate = buildCombinedTemplate({
      primaryTemplate: TEMPLATE,
      addonTemplate: TEMPLATE,
      addonProjectName: "Second Project",
      addonDeliverableType: "Edit V1",
      sameProject: false,
    });
    const { emailContent } = mergeCombinedTemplate({
      combinedTemplate,
      subjectLine: "s",
      primaryProjectName: "AODocs Product Demo",
      addonProjectName: "Second Project",
      primaryVariables: baseVars({ minimalFeedbackNextStep: true }),
      addonVariables: {
        revisionRounds: "2",
        feedbackWindows: "24 Hours",
        nextFeedbackDeadline: "Tue, Jul 7",
      },
    });
    expect(emailContent.split(NOTE_GENERIC)).toHaveLength(2);
    const lines = emailContent.split("\n");
    expect(lines[lines.indexOf(NOTE_GENERIC) - 1]).toContain("Mon, Jul 6");
  });
});
