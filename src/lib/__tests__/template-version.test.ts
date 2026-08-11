import { describe, it, expect } from "vitest";
import { deriveVersionName } from "@/lib/template-version";

describe("deriveVersionName", () => {
  it("appends when the source has no version token", () => {
    expect(deriveVersionName("Generative Stills", "V2")).toBe("Generative Stills V2");
    expect(deriveVersionName("Generative Stills", "Final")).toBe("Generative Stills Final");
  });

  it("replaces an existing V-number token in place", () => {
    expect(deriveVersionName("Storyboards V1", "V2")).toBe("Storyboards V2");
    expect(deriveVersionName("Storyboards V1", "Final")).toBe("Storyboards Final");
    expect(deriveVersionName("Storyboards V2", "V3")).toBe("Storyboards V3");
  });

  it("replaces a 'Final' token in place", () => {
    expect(deriveVersionName("Storyboards Final", "V2")).toBe("Storyboards V2");
  });

  it("preserves a trailing suffix after the version token", () => {
    expect(deriveVersionName("AV Script V1 + Loom", "V2")).toBe("AV Script V2 + Loom");
    expect(deriveVersionName("Storyboards V1 + Loom & Animatic", "Final")).toBe(
      "Storyboards Final + Loom & Animatic"
    );
  });

  it("is case-insensitive when matching the source token", () => {
    expect(deriveVersionName("Storyboards v1", "V2")).toBe("Storyboards V2");
    expect(deriveVersionName("Storyboards final", "V2")).toBe("Storyboards V2");
  });

  it("only replaces the first version token", () => {
    expect(deriveVersionName("V1 Draft V1", "V2")).toBe("V2 Draft V1");
  });

  it("trims and collapses whitespace it introduces", () => {
    expect(deriveVersionName("Generative Stills ", "V2")).toBe("Generative Stills V2");
  });
});
