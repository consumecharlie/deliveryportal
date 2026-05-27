import { describe, it, expect } from "vitest";
import { mergeAddonDelivery } from "@/lib/template-merge";

const ADDON_TEMPLATE_WITH_EXPLAINER = `
## What you'll be receiving

This is the addon explainer paragraph that should be stripped for repeat clients.

## Final cut

* [Final cut | googleDeliverableLink]

## Project Plan

* [Plan | projectPlanLink]
`;

const ADDON_VARS = {
  revisionRounds: "1",
  feedbackWindows: "24 Hours",
  nextFeedbackDeadline: "Mon, Jan 1",
};

describe("mergeAddonDelivery — repeatClient", () => {
  it("strips addon explainer sections when repeatClient is true", () => {
    const result = mergeAddonDelivery({
      primaryProjectName: "Primary Project",
      primaryContent: "## Final cut\n\n* something\n",
      addonProjectName: "Addon Project",
      addonTemplate: ADDON_TEMPLATE_WITH_EXPLAINER,
      addonContacts: [],
      addonVariables: { ...ADDON_VARS, repeatClient: true },
      isSlack: false,
    });
    expect(result).not.toContain("This is the addon explainer paragraph");
  });

  it("keeps addon explainer sections when repeatClient is false", () => {
    const result = mergeAddonDelivery({
      primaryProjectName: "Primary Project",
      primaryContent: "## Final cut\n\n* something\n",
      addonProjectName: "Addon Project",
      addonTemplate: ADDON_TEMPLATE_WITH_EXPLAINER,
      addonContacts: [],
      addonVariables: { ...ADDON_VARS, repeatClient: false },
      isSlack: false,
    });
    expect(result).toContain("This is the addon explainer paragraph");
  });

  it("keeps addon explainer sections when repeatClient is omitted (defaults to off)", () => {
    const result = mergeAddonDelivery({
      primaryProjectName: "Primary Project",
      primaryContent: "## Final cut\n\n* something\n",
      addonProjectName: "Addon Project",
      addonTemplate: ADDON_TEMPLATE_WITH_EXPLAINER,
      addonContacts: [],
      addonVariables: ADDON_VARS,
      isSlack: false,
    });
    expect(result).toContain("This is the addon explainer paragraph");
  });
});

describe("mergeAddonDelivery — transition line", () => {
  it("names the deliverable type (not the project) when same project", () => {
    const result = mergeAddonDelivery({
      primaryProjectName: "GFB 2026 Commercials",
      primaryContent: "Hello!\n\n## Final cut\n\n* something\n",
      addonProjectName: "GFB 2026 Commercials",
      addonDeliverableType: "Voiceover Script",
      sameProject: true,
      addonTemplate: ADDON_TEMPLATE_WITH_EXPLAINER,
      addonContacts: [],
      addonVariables: ADDON_VARS,
      isSlack: false,
    });
    expect(result).toContain(
      "Second, we also have the **Voiceover Script** ready for your review!"
    );
    // The project name must not be repeated in the transition line.
    expect(result).not.toContain(
      "we also have **GFB 2026 Commercials** deliverables"
    );
  });

  it("names the other project when it's a different project", () => {
    const result = mergeAddonDelivery({
      primaryProjectName: "Primary Project",
      primaryContent: "Hello!\n\n## Final cut\n\n* something\n",
      addonProjectName: "Addon Project",
      addonDeliverableType: "Voiceover Script",
      sameProject: false,
      addonTemplate: ADDON_TEMPLATE_WITH_EXPLAINER,
      addonContacts: [],
      addonVariables: ADDON_VARS,
      isSlack: false,
    });
    expect(result).toContain(
      "Second, we also have **Addon Project** deliverables ready for your review!"
    );
  });
});

describe("mergeAddonDelivery — shared project plan", () => {
  it("dedupes an identical project-plan link instead of repeating it", () => {
    const PLAN_URL = "https://clickup.com/plan/abc";
    const primaryContent = `Hello!

## Final cut

* something

## Project Plan

* [GFB 2026 Commercials – View real-time progress](${PLAN_URL})
`;
    const addonTemplate = `
## Final cut

* [Final cut | googleDeliverableLink]

## Project Plan

* [Plan | projectPlanLink]
`;
    const result = mergeAddonDelivery({
      primaryProjectName: "GFB 2026 Commercials",
      primaryContent,
      addonProjectName: "GFB 2026 Commercials",
      addonDeliverableType: "Voiceover Script",
      sameProject: true,
      addonTemplate,
      addonContacts: [],
      addonVariables: { ...ADDON_VARS, projectPlanLink: PLAN_URL },
      isSlack: false,
    });
    const occurrences = result.split(PLAN_URL).length - 1;
    expect(occurrences).toBe(1);
  });
});
