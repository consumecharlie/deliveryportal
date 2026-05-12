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
