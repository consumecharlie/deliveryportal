import { describe, it, expect } from "vitest";
import { deliverableTitle, variantLabel, milestoneLabel, linkLabel } from "@/lib/portal-labels";

describe("deliverableTitle", () => {
  it("keeps a parent name with no department prefix", () => {
    expect(deliverableTitle("LOC19: Intuit", "Edit")).toBe("LOC19: Intuit");
  });

  it("strips department prefixes with ' - ', ' | ' and ': ' separators, case-insensitively", () => {
    expect(deliverableTitle("Post-Production - Leaders of Code - Ep #21", "Edit")).toBe("Leaders of Code - Ep #21");
    expect(deliverableTitle("Pre-Production - AV Script", "AV Script")).toBe("AV Script");
    expect(deliverableTitle("pre-pro | Storyboards", "Storyboards")).toBe("Storyboards");
    expect(deliverableTitle("Design: Motion Graphics Storyboards", "Storyboards")).toBe("Motion Graphics Storyboards");
    expect(deliverableTitle("Production - Generative", "Generative Stills")).toBe("Generative");
    expect(deliverableTitle("POST-PRODUCTION - (2) 30s Operator Testimonial Videos", "Edit")).toBe("(2) 30s Operator Testimonial Videos");
  });

  it("trims surrounding whitespace", () => {
    expect(deliverableTitle("  Post Script AV  ", "Post AV")).toBe("Post Script AV");
    expect(deliverableTitle("Post-Production - (1) 2 min Customer Testimonial ", "Edit")).toBe("(1) 2 min Customer Testimonial");
  });

  it("leaves a bare department name alone (nothing after the prefix)", () => {
    expect(deliverableTitle("Post-Production", "Edit")).toBe("Post-Production");
  });

  it("falls back when the parent is null, blank, or only a prefix", () => {
    expect(deliverableTitle(null, "Edit")).toBe("Edit");
    expect(deliverableTitle("   ", "Edit")).toBe("Edit");
    expect(deliverableTitle("Design - ", "Storyboards")).toBe("Storyboards");
  });
});

describe("variantLabel", () => {
  it("strips 'Share ' and ' with Client' and keeps the variant", () => {
    expect(variantLabel("Share Video Edit01 with Client", "Edit V1")).toBe("Video Edit01");
    expect(variantLabel("Share Snippets Edit01 with Client", "Edit V1")).toBe("Snippets Edit01");
  });

  it("keeps a variant that differs from the type even when it means the same thing", () => {
    expect(variantLabel("Share Final Deliverables with Client", "Final Delivery")).toBe("Final Deliverables");
  });

  it("returns null when the variant just repeats the deliverable type or its family", () => {
    expect(variantLabel("Share Edit V1 with Client", "Edit V1")).toBeNull();
    expect(variantLabel("share edit v1 WITH CLIENT", "Edit V1")).toBeNull();
    expect(variantLabel("Share Edit with Client", "Edit V2")).toBeNull();
  });

  it("collapses whitespace", () => {
    expect(variantLabel("Share Post Script AV  V1 with Client", "Post AV V1")).toBe("Post Script AV V1");
  });

  it("returns null for null, blank, or fully stripped names", () => {
    expect(variantLabel(null, "Edit V1")).toBeNull();
    expect(variantLabel("", "Edit V1")).toBeNull();
    expect(variantLabel("Share  with Client", "Edit V1")).toBeNull();
  });

  it("leaves names without the Share wrapper as they are", () => {
    expect(variantLabel("Production Schedule", "Production Schedule")).toBeNull();
    expect(variantLabel("Phase 3 Final Deliverables", "Final Delivery")).toBe("Phase 3 Final Deliverables");
  });
});

describe("milestoneLabel", () => {
  it("prefers the variant and falls back to the deliverable type", () => {
    expect(milestoneLabel("Share Video Edit01 with Client", "Edit V1")).toBe("Video Edit01");
    expect(milestoneLabel("Share Edit V1 with Client", "Edit V1")).toBe("Edit V1");
    expect(milestoneLabel(null, "Final Delivery")).toBe("Final Delivery");
  });
});

describe("linkLabel", () => {
  it("maps known review-link variables to client-facing names", () => {
    expect(linkLabel("frameReviewLink", "frameReviewLink")).toBe("Frame.io review");
    expect(linkLabel("googleDeliverableLink", "x")).toBe("Google Drive");
    expect(linkLabel("loomReviewLink", "x")).toBe("Loom walkthrough");
    expect(linkLabel("animaticReviewLink", "x")).toBe("Animatic");
    expect(linkLabel("flexLink", "x")).toBe("Review link");
  });

  it("falls back to the stored label for unknown or missing variables", () => {
    expect(linkLabel("somethingElse", "Project plan")).toBe("Project plan");
    expect(linkLabel(null, "Extra link")).toBe("Extra link");
  });
});
