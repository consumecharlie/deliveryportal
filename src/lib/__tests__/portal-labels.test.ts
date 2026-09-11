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
  extractLinkTexts,
  normalizeUrl,
  linkKind,
  linkHint,
  cleanLinkText,
  stripClientPrefix,
  feedbackTaskTitle,
  reviewMode,
  reviewLabel,
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

describe("links: anchor texts, kinds, hints, clean labels", () => {
  const DOC = "https://docs.google.com/document/d/1AbC/edit";
  const MP3 = "https://drive.google.com/file/d/1XyZ/view";
  const message = [
    "Hi there,",
    "",
    `- [Final Post Script](${DOC})`,
    `- [CallRail Wiggam Law Virtual Testimonial \u2013 Audio File Final](${MP3}).`,
    "- <https://app.frame.io/reviews/abc|Review the cut>",
    "![poster](https://img.example.com/p.png)",
  ].join("\n");

  it("extractLinkTexts reads markdown and Slack links, keyed by normalized URL, skipping images", () => {
    const texts = extractLinkTexts(message);
    expect(texts.get(DOC)).toBe("Final Post Script");
    expect(texts.get(MP3)).toBe("CallRail Wiggam Law Virtual Testimonial \u2013 Audio File Final");
    expect(texts.get("https://app.frame.io/reviews/abc")).toBe("Review the cut");
    expect(texts.has("https://img.example.com/p.png")).toBe(false);
    expect(extractLinkTexts("**[Bold](https://x.test/a/)**").get("https://x.test/a")).toBe("Bold");
  });

  it("normalizeUrl trims punctuation and a trailing slash", () => {
    expect(normalizeUrl(" https://x.test/a/). ")).toBe("https://x.test/a");
    expect(normalizeUrl("https://x.test/a?b=1")).toBe("https://x.test/a?b=1");
  });

  it("linkKind by host and path", () => {
    expect(linkKind(DOC)).toBe("google-doc");
    expect(linkKind("https://docs.google.com/spreadsheets/d/1/edit")).toBe("google-sheet");
    expect(linkKind("https://docs.google.com/presentation/d/1/edit")).toBe("google-slides");
    expect(linkKind(MP3)).toBe("google-drive");
    expect(linkKind("https://app.frame.io/reviews/abc")).toBe("frame");
    expect(linkKind("https://f.io/abc")).toBe("frame");
    expect(linkKind("https://www.loom.com/share/abc")).toBe("loom");
    expect(linkKind("https://vimeo.com/123")).toBe("vimeo");
    expect(linkKind("https://youtu.be/abc")).toBe("youtube");
    expect(linkKind("https://www.youtube.com/watch?v=abc")).toBe("youtube");
    expect(linkKind("https://consume.box.com/s/abc")).toBe("box");
    expect(linkKind("https://www.dropbox.com/s/abc/file.mp4")).toBe("dropbox");
    expect(linkKind("https://cdn.example.com/mix.MP3")).toBe("audio");
    expect(linkKind("https://cdn.example.com/vo.aiff")).toBe("audio");
    expect(linkKind("https://cdn.example.com/cut.mov")).toBe("video");
    expect(linkKind("https://cdn.example.com/deck.pdf")).toBe("pdf");
    expect(linkKind("https://example.com/page")).toBe("web");
    expect(linkKind("not a url")).toBe("web");
  });

  it("linkHint names every kind", () => {
    expect(linkHint("google-doc")).toBe("Google Doc");
    expect(linkHint("google-drive")).toBe("Google Drive");
    expect(linkHint("frame")).toBe("Frame.io");
    expect(linkHint("audio")).toBe("Audio file");
    expect(linkHint("web")).toBe("Link");
  });

  it("cleanLinkText strips the project name and separator, and drops hint-only text", () => {
    const project = "CallRail Wiggam Law Virtual Testimonial";
    expect(cleanLinkText(`${project} \u2013 Audio File Final`, project)).toBe("Audio File Final");
    expect(cleanLinkText(`${project} - Audio  File Final`, project)).toBe("Audio File Final");
    expect(cleanLinkText(`${project}: Final Cut`, project)).toBe("Final Cut");
    expect(cleanLinkText("Final Post Script", project)).toBe("Final Post Script");
    expect(cleanLinkText(project, project)).toBeNull();
    expect(cleanLinkText("  ", project)).toBeNull();
    expect(cleanLinkText(null, project)).toBeNull();
    expect(cleanLinkText("google doc", project, "Google Doc")).toBeNull();
  });
});

describe("review wording", () => {
  it("reviewMode from the task name, else from the type", () => {
    expect(reviewMode("Confirm Edit Feedback or Approval", "Edit V2")).toBe("approval");
    expect(reviewMode("Confirm Video Edit01 Feedback Received", "Final Delivery")).toBe("feedback");
    expect(reviewMode(null, "Final Delivery")).toBe("approval");
    expect(reviewMode(null, "Post Script Final")).toBe("approval");
    expect(reviewMode(null, "Finalize Script")).toBe("feedback");
    expect(reviewMode(undefined, "Edit V1")).toBe("feedback");
  });

  it("reviewLabel by state and mode", () => {
    expect(reviewLabel({ state: "awaiting", mode: "feedback", dueLabel: "Tue, Sep 8" })).toBe("Feedback needed by Tue, Sep 8");
    expect(reviewLabel({ state: "awaiting", mode: "approval", dueLabel: "Tue, Sep 8, 5:00 PM ET" })).toBe("Approval needed by Tue, Sep 8, 5:00 PM ET");
    expect(reviewLabel({ state: "awaiting", mode: "feedback", dueLabel: "Fri, Sep 11", dueIsEstimate: true })).toBe("Feedback by Fri, Sep 11 (suggested)");
    expect(reviewLabel({ state: "awaiting", mode: "approval", dueLabel: "Fri, Sep 11", dueIsEstimate: true })).toBe("Approval by Fri, Sep 11 (suggested)");
    expect(reviewLabel({ state: "due-today", mode: "approval", dueLabel: "Thu, Sep 3" })).toBe("Due today");
    expect(reviewLabel({ state: "due-today", mode: "feedback", dueLabel: "Thu, Sep 3, 12:00 PM ET" })).toBe("Due today, 12:00 PM ET");
    expect(reviewLabel({ state: "overdue", mode: "approval", dueLabel: "Tue, Sep 1" })).toBe("Past due, was Tue, Sep 1");
    expect(reviewLabel({ state: "confirmed", mode: "feedback", confirmedLabel: "Jun 6" })).toBe("Feedback received Jun 6");
    expect(reviewLabel({ state: "confirmed", mode: "feedback" })).toBe("Feedback received");
    expect(reviewLabel({ state: "confirmed", mode: "approval", confirmedLabel: "Jun 6" })).toBe("Approved Jun 6");
    expect(reviewLabel({ state: "confirmed", mode: "approval", confirmedLabel: null })).toBe("Approved");
    expect(reviewLabel({ state: "none", mode: "feedback" })).toBe("Delivered");
  });

  it("reviewLabel says EOD wherever a date carries no time of day", () => {
    const eod = { dueIsEndOfDay: true };
    expect(reviewLabel({ state: "awaiting", mode: "feedback", dueLabel: "Tue, Sep 15", ...eod })).toBe("Feedback needed by EOD Tue, Sep 15");
    expect(reviewLabel({ state: "awaiting", mode: "approval", dueLabel: "Tue, Sep 15", ...eod })).toBe("Approval needed by EOD Tue, Sep 15");
    expect(reviewLabel({ state: "overdue", mode: "feedback", dueLabel: "Tue, Sep 1", ...eod })).toBe("Past due, was EOD Tue, Sep 1");
    expect(reviewLabel({ state: "overdue", mode: "approval", dueLabel: "Tue, Sep 1", ...eod })).toBe("Past due, was EOD Tue, Sep 1");
    expect(reviewLabel({ state: "awaiting", mode: "feedback", dueLabel: "Fri, Sep 11", dueIsEstimate: true, ...eod })).toBe("Feedback by EOD Fri, Sep 11 (suggested)");
    expect(reviewLabel({ state: "awaiting", mode: "approval", dueLabel: "Fri, Sep 11", dueIsEstimate: true, ...eod })).toBe("Approval by EOD Fri, Sep 11 (suggested)");
  });

  it("a real time of day keeps the time and never says EOD", () => {
    const timed = { dueLabel: "Tue, Sep 15, 12:00 PM ET", dueIsEndOfDay: false };
    expect(reviewLabel({ state: "awaiting", mode: "feedback", ...timed })).toBe("Feedback needed by Tue, Sep 15, 12:00 PM ET");
    expect(reviewLabel({ state: "awaiting", mode: "approval", ...timed })).toBe("Approval needed by Tue, Sep 15, 12:00 PM ET");
    expect(reviewLabel({ state: "overdue", mode: "feedback", dueLabel: "Tue, Sep 1, 5:00 PM ET", dueIsEndOfDay: false })).toBe("Past due, was Tue, Sep 1, 5:00 PM ET");
  });

  it("Due today keeps its shape either way", () => {
    expect(reviewLabel({ state: "due-today", mode: "feedback", dueLabel: "Thu, Sep 3", dueIsEndOfDay: true })).toBe("Due today");
    expect(reviewLabel({ state: "due-today", mode: "approval", dueLabel: "Thu, Sep 3, 12:00 PM ET", dueIsEndOfDay: false })).toBe("Due today, 12:00 PM ET");
  });

  it("confirmed and delivered wording ignores the flag", () => {
    expect(reviewLabel({ state: "confirmed", mode: "feedback", confirmedLabel: "Jun 6", dueIsEndOfDay: true })).toBe("Feedback received Jun 6");
    expect(reviewLabel({ state: "none", mode: "approval", dueIsEndOfDay: true })).toBe("Delivered");
  });
});

describe("stripClientPrefix", () => {
  const so = (name: string) => stripClientPrefix(name, "Stack Overflow");

  it("drops the full client name and the separators after it", () => {
    expect(so("Stack Overflow BVAS Talking Head Product Videos")).toBe("BVAS Talking Head Product Videos");
    expect(so("Stack Overflow 2026 Internal Explainer")).toBe("2026 Internal Explainer");
    expect(so("Stack Overflow: Animated Ads")).toBe("Animated Ads");
    expect(so("Stack Overflow - Animated Ads")).toBe("Animated Ads");
    expect(so("Stack Overflow \u2013 Animated Ads")).toBe("Animated Ads");
    expect(so("Stack Overflow \u2014 Animated Ads")).toBe("Animated Ads");
    expect(so("Stack Overflow | Animated Ads")).toBe("Animated Ads");
    expect(so("stack overflow animated ads")).toBe("animated ads");
    expect(stripClientPrefix("CallRail Wiggam Law Virtual Testimonial", "CallRail")).toBe("Wiggam Law Virtual Testimonial");
  });

  it("only a full client name counts, at a word boundary", () => {
    expect(so("Stack BVAS")).toBe("Stack BVAS");
    expect(so("Stack Internal AI Workflow")).toBe("Stack Internal AI Workflow");
    expect(so("Stack Internal Animated Explainer")).toBe("Stack Internal Animated Explainer");
    expect(so("Leaders of Code Podcast")).toBe("Leaders of Code Podcast");
    // "Stack Overflowing" is a different word, so nothing is stripped.
    expect(so("Stack Overflowing Ads")).toBe("Stack Overflowing Ads");
    // The client name has to lead.
    expect(so("Animated Ads for Stack Overflow")).toBe("Animated Ads for Stack Overflow");
  });

  it("normalizes whitespace and ampersand spelling for the comparison only", () => {
    expect(stripClientPrefix("Smith and Jones Brand Video", "Smith & Jones")).toBe("Brand Video");
    expect(stripClientPrefix("Smith & Jones Brand Video", "Smith and Jones")).toBe("Brand Video");
    expect(stripClientPrefix("Stack  Overflow  Animated Ads", "Stack Overflow")).toBe("Animated Ads");
    // The result itself is only trimmed, never respaced.
    expect(stripClientPrefix("Stack Overflow Animated  Ads", "Stack Overflow")).toBe("Animated  Ads");
    expect(stripClientPrefix("Stack Overflow Animated Ads", "  Stack   Overflow ")).toBe("Animated Ads");
  });

  it("keeps the original when what is left would be useless", () => {
    expect(so("Stack Overflow")).toBe("Stack Overflow");
    expect(so("Stack Overflow: ")).toBe("Stack Overflow: ");
    expect(so("Stack Overflow AI")).toBe("Stack Overflow AI");
    expect(so("Stack Overflow 2026")).toBe("Stack Overflow 2026");
    expect(so("Stack Overflow - 19")).toBe("Stack Overflow - 19");
  });

  it("a blank client name or project name changes nothing", () => {
    expect(stripClientPrefix("Animated Ads", "")).toBe("Animated Ads");
    expect(stripClientPrefix("Animated Ads", "   ")).toBe("Animated Ads");
    expect(stripClientPrefix("", "Stack Overflow")).toBe("");
  });

  it("a client name with regex characters is matched literally", () => {
    expect(stripClientPrefix("C++ (Europe) Launch Film", "C++ (Europe)")).toBe("Launch Film");
    expect(stripClientPrefix("Cxx Europe Launch Film", "C++ (Europe)")).toBe("Cxx Europe Launch Film");
  });
});

describe("feedbackTaskTitle", () => {
  it("strips the Confirm prefix and the internal suffixes", () => {
    expect(feedbackTaskTitle("Confirm Spinoff Details with Client", null, "Spinoff Details Request")).toBe("Spinoff Details");
    expect(feedbackTaskTitle("Confirm Edit V1 Feedback Received", null, "Edit V1")).toBe("Edit V1");
    expect(feedbackTaskTitle("Confirm Final Deliverables Feedback or Approval", null, "Final Delivery")).toBe("Final Deliverables");
    expect(feedbackTaskTitle("Confirm AV Script V2 Approval", null, "AV Script V2")).toBe("AV Script V2");
    expect(feedbackTaskTitle("Confirm Post Script AV Received", null, "Post AV V1")).toBe("Post Script AV");
    expect(feedbackTaskTitle("confirm  edit v1   feedback received", null, "Edit V1")).toBe("edit v1");
    // A name that says nothing internal is left alone.
    expect(feedbackTaskTitle("Spinoff Details", null, "Edit V1")).toBe("Spinoff Details");
  });

  it("falls back to the parent deliverable, then the deliverable type", () => {
    expect(feedbackTaskTitle("Confirm Feedback Received", "LOC19: Intuit", "Edit V1")).toBe("LOC19: Intuit");
    // A phase-only parent says nothing, so the type wins.
    expect(feedbackTaskTitle("Confirm Feedback Received", "Post-Production", "Edit V1")).toBe("Edit V1");
    expect(feedbackTaskTitle("Confirm Approval", null, "Final Delivery")).toBe("Final Delivery");
    expect(feedbackTaskTitle("", null, "Edit V1")).toBe("Edit V1");
    expect(feedbackTaskTitle(null, null, "Edit V1")).toBe("Edit V1");
    // Department prefixes come off the parent, as everywhere else.
    expect(feedbackTaskTitle("Confirm with Client", "Post-Production - Leaders of Code - Ep #21", "Edit V1")).toBe("Leaders of Code - Ep #21");
  });

  it("never returns an empty string", () => {
    expect(feedbackTaskTitle("Confirm Approval", null, "")).toBe("Confirm Approval");
    expect(feedbackTaskTitle("", null, "")).toBe("");
  });
});
