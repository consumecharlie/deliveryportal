import { describe, it, expect } from "vitest";
import {
  buildCombinedTemplate,
  mergeCombinedTemplate,
  ADDON_NS,
} from "@/lib/template-merge";
import type { ProjectContact } from "@/lib/types";

const PRIMARY_TEMPLATE = `Hello [contactFirstName]!

We're excited to share [projectName] deliverables.

## 🔗 Review Link

- [Edit V1 | googleDeliverableLink]

## ⚡ Scope & Timeline Reminders
- **Revision Rounds:** [revisionRounds]
- **Feedback Windows:** [feedbackWindows]
- **Feedback Deadline:** EOD [feedbackDeadline]

## 📋 Project Plan
- [View real-time progress | projectPlanLink]

Looking forward to your feedback!`;

const ADDON_TEMPLATE = `Hi [contactFirstName],

## 🔗 Review Link

- [Script V1 | googleDeliverableLink]

## ⚡ Scope & Timeline Reminders
- **Revision Rounds:** [revisionRounds]
- **Feedback Windows:** [feedbackWindows]

## 📋 Project Plan
- [View real-time progress | projectPlanLink]`;

const CONTACTS: ProjectContact[] = [
  { name: "Whitney Mooney", email: "wsmooney@gfb.org", role: "Primary" } as ProjectContact,
];

describe("buildCombinedTemplate — namespacing", () => {
  it("namespaces the add-on's per-project tokens but not contact tokens", () => {
    const combined = buildCombinedTemplate({
      primaryTemplate: PRIMARY_TEMPLATE,
      addonTemplate: ADDON_TEMPLATE,
      addonProjectName: "GFB 2026 Commercials",
      addonDeliverableType: "Voiceover Script",
      sameProject: true,
    });
    // Add-on's deliverable link is namespaced…
    expect(combined).toContain(`Script V1 | ${ADDON_NS}googleDeliverableLink`);
    // …while the primary's stays bare.
    expect(combined).toContain("Edit V1 | googleDeliverableLink");
    // Contact tokens are shared and must NOT be namespaced.
    expect(combined).not.toContain(`${ADDON_NS}contactFirstName`);
    expect(combined).toContain("[contactFirstName]");
  });

  it("uses the deliverable-type transition for same project (no repeated name)", () => {
    const combined = buildCombinedTemplate({
      primaryTemplate: PRIMARY_TEMPLATE,
      addonTemplate: ADDON_TEMPLATE,
      addonProjectName: "GFB 2026 Commercials",
      addonDeliverableType: "Voiceover Script",
      sameProject: true,
    });
    expect(combined).toContain("Second, we also have the **Voiceover Script** ready for your review!");
  });

  it("names the other project for a different-project merge", () => {
    const combined = buildCombinedTemplate({
      primaryTemplate: PRIMARY_TEMPLATE,
      addonTemplate: ADDON_TEMPLATE,
      addonProjectName: "Acme Sizzle",
      addonDeliverableType: "Voiceover Script",
      sameProject: false,
    });
    expect(combined).toContain("Second, we also have **Acme Sizzle** deliverables ready for your review!");
  });

  it("keeps a single project-plan section when same project", () => {
    const combined = buildCombinedTemplate({
      primaryTemplate: PRIMARY_TEMPLATE,
      addonTemplate: ADDON_TEMPLATE,
      addonProjectName: "GFB 2026 Commercials",
      addonDeliverableType: "Voiceover Script",
      sameProject: true,
    });
    const planHeaders = combined.split("\n").filter((l) => /Project Plan/i.test(l));
    expect(planHeaders).toHaveLength(1);
    // The shared plan keeps the primary's (bare) plan token, not the namespaced one.
    expect(combined).not.toContain(`${ADDON_NS}projectPlanLink`);
  });
});

describe("mergeCombinedTemplate — distinct per-project values", () => {
  const basePrimaryVars = {
    contacts: CONTACTS,
    projectName: "GFB 2026 Commercials",
    versionNotes: "",
    revisionRounds: "2",
    feedbackWindows: "48 Hours",
    nextFeedbackDeadline: "Fri, May 29",
  };

  it("resolves primary and add-on links to different URLs", () => {
    const combined = buildCombinedTemplate({
      primaryTemplate: PRIMARY_TEMPLATE,
      addonTemplate: ADDON_TEMPLATE,
      addonProjectName: "Acme Sizzle",
      addonDeliverableType: "Voiceover Script",
      sameProject: false,
    });
    const result = mergeCombinedTemplate({
      combinedTemplate: combined,
      subjectLine: "Ready for review",
      primaryProjectName: "GFB 2026 Commercials",
      addonProjectName: "Acme Sizzle",
      primaryVariables: {
        ...basePrimaryVars,
        googleDeliverableLink: "https://primary.example/edit",
        projectPlanLink: "https://primary.example/plan",
      },
      addonVariables: {
        revisionRounds: "1",
        feedbackWindows: "24 Hours",
        nextFeedbackDeadline: "Mon, Jun 1",
        googleDeliverableLink: "https://addon.example/script",
        projectPlanLink: "https://addon.example/plan",
      },
    });
    expect(result.emailContent).toContain("https://primary.example/edit");
    expect(result.emailContent).toContain("https://addon.example/script");
    // No unresolved tokens should remain.
    expect(result.emailContent).not.toMatch(/\[[^\]]*\|[^\]]*\]/);
    expect(result.emailContent).not.toContain(ADDON_NS);
  });

  it("enriches each standalone link with the owning project's name", () => {
    const combined = buildCombinedTemplate({
      primaryTemplate: PRIMARY_TEMPLATE,
      addonTemplate: ADDON_TEMPLATE,
      addonProjectName: "Acme Sizzle",
      addonDeliverableType: "Voiceover Script",
      sameProject: false,
    });
    const result = mergeCombinedTemplate({
      combinedTemplate: combined,
      subjectLine: "Ready for review",
      primaryProjectName: "GFB 2026 Commercials",
      addonProjectName: "Acme Sizzle",
      primaryVariables: {
        ...basePrimaryVars,
        googleDeliverableLink: "https://primary.example/edit",
      },
      addonVariables: {
        revisionRounds: "1",
        feedbackWindows: "24 Hours",
        nextFeedbackDeadline: "Mon, Jun 1",
        googleDeliverableLink: "https://addon.example/script",
      },
    });
    expect(result.emailContent).toContain("[GFB 2026 Commercials – Edit V1](https://primary.example/edit)");
    expect(result.emailContent).toContain("[Acme Sizzle – Script V1](https://addon.example/script)");
  });

  it("collapses an identical plan link to one for same project", () => {
    const combined = buildCombinedTemplate({
      primaryTemplate: PRIMARY_TEMPLATE,
      addonTemplate: ADDON_TEMPLATE,
      addonProjectName: "GFB 2026 Commercials",
      addonDeliverableType: "Voiceover Script",
      sameProject: true,
    });
    const planUrl = "https://primary.example/plan";
    const result = mergeCombinedTemplate({
      combinedTemplate: combined,
      subjectLine: "Ready for review",
      primaryProjectName: "GFB 2026 Commercials",
      addonProjectName: "GFB 2026 Commercials",
      primaryVariables: {
        ...basePrimaryVars,
        googleDeliverableLink: "https://primary.example/edit",
        projectPlanLink: planUrl,
      },
      addonVariables: {
        revisionRounds: "1",
        feedbackWindows: "24 Hours",
        nextFeedbackDeadline: "Mon, Jun 1",
        googleDeliverableLink: "https://addon.example/script",
        projectPlanLink: planUrl,
      },
    });
    expect(result.emailContent.split(planUrl).length - 1).toBe(1);
  });

  it("strips repeat-client explainer sections from both projects", () => {
    const primaryWithExplainer = `Hello [contactFirstName]!

## What you'll be receiving

Primary explainer text here.

## 🔗 Review Link

- [Edit V1 | googleDeliverableLink]`;
    const addonWithExplainer = `## What you'll be receiving

Addon explainer text here.

## 🔗 Review Link

- [Script V1 | googleDeliverableLink]`;
    const combined = buildCombinedTemplate({
      primaryTemplate: primaryWithExplainer,
      addonTemplate: addonWithExplainer,
      addonProjectName: "GFB 2026 Commercials",
      addonDeliverableType: "Voiceover Script",
      sameProject: true,
    });
    const result = mergeCombinedTemplate({
      combinedTemplate: combined,
      subjectLine: "x",
      primaryProjectName: "GFB 2026 Commercials",
      addonProjectName: "GFB 2026 Commercials",
      primaryVariables: {
        ...basePrimaryVars,
        repeatClient: true,
        googleDeliverableLink: "https://primary.example/edit",
      },
      addonVariables: {
        revisionRounds: "1",
        feedbackWindows: "24 Hours",
        nextFeedbackDeadline: "Mon, Jun 1",
        googleDeliverableLink: "https://addon.example/script",
      },
    });
    expect(result.emailContent).not.toContain("Primary explainer text here.");
    expect(result.emailContent).not.toContain("Addon explainer text here.");
  });
});
