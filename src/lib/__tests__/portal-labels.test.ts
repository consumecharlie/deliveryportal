import { describe, it, expect } from "vitest";
import {
  deliverableTitle,
  variantLabel,
  variantStem,
  deliverableKey,
  milestoneLabel,
  linkLabel,
  isPhaseOnlyParent,
  stripVersionTokens,
  versionMarkers,
  nameTokens,
  deliverableIdentityTokens,
  countsLine,
  PHASE_ONLY_WORDS,
} from "@/lib/portal-labels";

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

  it("treats a bare phase or department name as no parent at all", () => {
    expect(deliverableTitle("Post-Production", "Edit")).toBe("Edit");
    expect(deliverableTitle("post production", "Edit")).toBe("Edit");
    expect(deliverableTitle("Post", "Post Script")).toBe("Post Script");
    expect(deliverableTitle("PRE-PRO", "AV Script")).toBe("AV Script");
    expect(deliverableTitle("Design", "Storyboards")).toBe("Storyboards");
    expect(deliverableTitle("Editing", "Edit")).toBe("Edit");
    expect(deliverableTitle("Animation", "Edit")).toBe("Edit");
    for (const w of PHASE_ONLY_WORDS) expect(deliverableTitle(w, "fallback")).toBe("fallback");
  });

  it("keeps a parent that merely contains a phase word", () => {
    expect(deliverableTitle("Post Script AV", "Post AV")).toBe("Post Script AV");
    expect(deliverableTitle("Production Prep", "Production Schedule")).toBe("Production Prep");
    // A prefix followed by a phase word is still just a phase.
    expect(deliverableTitle("Post-Production - Post", "Edit")).toBe("Edit");
  });

  it("isPhaseOnlyParent covers missing, blank, prefix-only and phase names", () => {
    expect(isPhaseOnlyParent(null)).toBe(true);
    expect(isPhaseOnlyParent(" ")).toBe(true);
    expect(isPhaseOnlyParent("Design - ")).toBe(true);
    expect(isPhaseOnlyParent("Post-Production")).toBe(true);
    expect(isPhaseOnlyParent("LOC19: Intuit")).toBe(false);
    expect(isPhaseOnlyParent("Post Script AV")).toBe(false);
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

describe("variantStem / deliverableKey", () => {
  it("separates distinct deliverables under one parent and merges versions of one deliverable", () => {
    expect(variantStem("Share Video Edit01 with Client", "Edit V1")).toBe("video");
    expect(variantStem("Share Snippets Edit01 with Client", "Edit V1")).toBe("snippets");
    expect(variantStem("Share Edit V1 with Client", "Edit V1")).toBe("");
    expect(variantStem("Share Edit V2 with Client", "Edit V2")).toBe("");
    expect(variantStem("Share Potential Master with Client", "Potential Master")).toBe("");
    expect(variantStem("Share Final Deliverables with Client", "Final Delivery")).toBe("");
    expect(variantStem("Share Spinoff Edit V1 with Client", "Edit V1")).toBe("spinoff");
    expect(variantStem("Share Final Spinoff Deliverables with Client", "Final Delivery")).toBe("spinoff");
    expect(variantStem("Share Graphics V2 with Client", "Storyboards V2")).toBe("graphics");
    expect(variantStem("Share Animatic + Graphics V1 with Client", "Storyboards V1 + Loom & Animatic")).toBe("graphics");
    expect(variantStem("Share Final AV Script with Client", "AV Script Final")).toBe("");
    expect(variantStem(null, "Edit V1")).toBe("");
  });

  it("keys by parent (plus stem) or by family without a parent", () => {
    const P19 = { parentTaskId: "P19", parentTaskName: "LOC19: Intuit" };
    const P1 = { parentTaskId: "P1", parentTaskName: "Post-Production - (1) 90s Product Demo (16:9)" };
    expect(deliverableKey({ ...P19, shareTaskName: "Share Video Edit01 with Client", deliverableType: "Edit V1" })).toBe("P19:video");
    expect(deliverableKey({ ...P19, shareTaskName: "Share Snippets Edit01 with Client", deliverableType: "Edit V1" })).toBe("P19:snippets");
    expect(deliverableKey({ ...P1, shareTaskName: "Share Edit V2 with Client", deliverableType: "Edit V2" })).toBe("P1");
    expect(deliverableKey({ ...P1, shareTaskName: "Share Final Deliverables with Client", deliverableType: "Final Delivery" })).toBe("P1");
    expect(deliverableKey({ parentTaskId: null, parentTaskName: null, shareTaskName: "Share Edit V2 with Client", deliverableType: "Edit V2" })).toBe("family:Edit");
    expect(deliverableKey({ parentTaskId: null, parentTaskName: null, shareTaskName: null, deliverableType: "Potential Master" })).toBe("family:Edit");
  });

  it("a phase-only parent keys by family: versions stack, different deliverables still split", () => {
    const PP = { parentTaskId: "PP", parentTaskName: "Post-Production" };
    const v1 = deliverableKey({ ...PP, shareTaskName: "Share Post Script V1 with Client", deliverableType: "Post Script V1" });
    const v2 = deliverableKey({ ...PP, shareTaskName: "Share Post Script V2 with Client", deliverableType: "Post Script V2" });
    const fin = deliverableKey({ ...PP, shareTaskName: "Share Final Post Script with Client", deliverableType: "Post Script Final" });
    expect(v1).toBe("family:Post Script");
    expect(v2).toBe(v1);
    expect(fin).toBe(v1);
    const av = deliverableKey({ ...PP, shareTaskName: "Share Post Script AV V1 with Client", deliverableType: "Post AV V1" });
    expect(av).not.toBe(v1);
    expect(deliverableKey({ ...PP, shareTaskName: "Share Post Script AV V2 with Client", deliverableType: "Post AV V2" })).toBe(av);
    // Same type family, different variant, same phase-only parent: separate deliverables.
    const a = deliverableKey({ ...PP, shareTaskName: "Share Video Edit01 with Client", deliverableType: "Edit V1" });
    const b = deliverableKey({ ...PP, shareTaskName: "Share Snippets Edit01 with Client", deliverableType: "Edit V1" });
    expect(a).toBe("family:Edit:video");
    expect(b).toBe("family:Edit:snippets");
  });
});

describe("stripVersionTokens", () => {
  it("removes version markers and keeps the rest", () => {
    expect(stripVersionTokens("Post Script AV V1")).toBe("post script av");
    expect(stripVersionTokens("Final Post Script")).toBe("post script");
    expect(stripVersionTokens("Video Edit01")).toBe("video");
    expect(stripVersionTokens("Edit V2")).toBe("edit");
  });
});

describe("identity tokens", () => {
  it("keeps what names the deliverable and drops boilerplate and version markers", () => {
    expect(deliverableIdentityTokens("Share Video Edit01 with Client", "Edit V1")).toEqual(["video"]);
    expect(deliverableIdentityTokens("Share Snippets Edit01 with Client", "Edit V1")).toEqual(["snippets"]);
    expect(deliverableIdentityTokens("Share Edit V1 with Client", "Edit V1")).toEqual([]);
    expect(deliverableIdentityTokens(null, "Post AV V1")).toEqual(["post", "av"]);
    expect(nameTokens("Confirm Video Edit01 Feedback Received")).toEqual(["video"]);
    expect(nameTokens("Confirm Snippets Feedback or Approval")).toEqual(["snippets"]);
    expect(nameTokens("Confirm Edit Feedback or Approval")).toEqual([]);
  });

  it("versionMarkers picks the markers out of a type, client prefix or not", () => {
    expect(versionMarkers("LoC Edit V2")).toEqual(["v2"]);
    expect(versionMarkers("Edit V2")).toEqual(["v2"]);
    expect(versionMarkers("Final Delivery")).toEqual(["final"]);
    expect(versionMarkers("Storyboards")).toEqual([]);
  });
});

describe("countsLine", () => {
  it("says nothing with nothing to count", () => {
    expect(countsLine({ inProgress: 0, completed: 0 })).toBe("");
  });
  it("counts each side, with plural handling", () => {
    expect(countsLine({ inProgress: 0, completed: 4 })).toBe("4 completed");
    expect(countsLine({ inProgress: 1, completed: 0 })).toBe("1 project in progress");
    expect(countsLine({ inProgress: 2, completed: 1 })).toBe("2 projects in progress, 1 completed");
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
