import { describe, it, expect } from "vitest";
import { mergeTemplate } from "@/lib/template-merge";
import type { ProjectContact } from "@/lib/types";

const contacts: ProjectContact[] = [
  { taskId: "c1", name: "Shawn", email: "shawn@example.com", role: "Primary" },
];

const base = {
  contacts,
  projectName: "CINC Animated Tradeshow Video",
  versionNotes: "",
  revisionRounds: "1",
  feedbackWindows: "24 Hours",
  nextFeedbackDeadline: "Fri, Sep 4",
  googleDeliverableLink: "https://docs.google.com/doc/1",
};

const TEMPLATE = "🔗 **Review Link**\n\n- [AV Script V1 | googleDeliverableLink] Leave feedback here!";

describe("project-name prefix on standalone links", () => {
  it("prefixes by default, preserving existing behaviour", () => {
    const { emailContent } = mergeTemplate(TEMPLATE, "Subject", base);
    expect(emailContent).toContain("[CINC Animated Tradeshow Video – AV Script V1]");
  });

  it("drops the prefix when turned off for this delivery", () => {
    const { emailContent } = mergeTemplate(TEMPLATE, "Subject", {
      ...base,
      prefixLinksWithProjectName: false,
    });
    expect(emailContent).toContain("[AV Script V1](https://docs.google.com/doc/1)");
    expect(emailContent).not.toContain("CINC Animated Tradeshow Video – AV Script V1");
  });

  it("still honours a custom label with the prefix off", () => {
    const { emailContent } = mergeTemplate(TEMPLATE, "Subject", {
      ...base,
      prefixLinksWithProjectName: false,
      linkLabels: { googleDeliverableLink: "The script" },
    });
    expect(emailContent).toContain("[The script](https://docs.google.com/doc/1)");
  });

  it("leaves inline links alone either way, since they never got a prefix", () => {
    const inline = "Please review in [Google Docs | googleDeliverableLink].";
    for (const prefix of [true, false]) {
      const { emailContent } = mergeTemplate(inline, "Subject", {
        ...base,
        prefixLinksWithProjectName: prefix,
      });
      expect(emailContent).toContain("[Google Docs](https://docs.google.com/doc/1)");
    }
  });
});
