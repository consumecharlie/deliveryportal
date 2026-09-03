import { describe, it, expect } from "vitest";
import {
  extractFamilyName,
  extractVersionSuffix,
  getVersionSortKey,
} from "@/lib/template-families";

describe("extractFamilyName", () => {
  it("strips a trailing version suffix", () => {
    expect(extractFamilyName("AV Script V1 + Loom")).toBe("AV Script");
    expect(extractFamilyName("AV Script Final")).toBe("AV Script");
  });

  it("honors explicit overrides before suffix stripping", () => {
    expect(extractFamilyName("Edit V1")).toBe("Edit");
    expect(extractFamilyName("Final Delivery")).toBe("Edit");
  });

  it("does not treat a leading 'Final' as a version word", () => {
    // "Final Music Playlist" is a real deliverable type and its own family;
    // only trailing suffixes and explicit overrides change the family.
    expect(extractFamilyName("Final Music Playlist")).toBe("Final Music Playlist");
  });

  it("leaves a name with no version suffix alone", () => {
    expect(extractFamilyName("Competitive Analysis")).toBe("Competitive Analysis");
  });
});

describe("getVersionSortKey", () => {
  it("orders V1 before V2 before Final within a family", () => {
    expect(getVersionSortKey("AV Script V1")).toBeLessThan(getVersionSortKey("AV Script V2"));
    expect(getVersionSortKey("AV Script V2")).toBeLessThan(getVersionSortKey("AV Script Final"));
  });
});

describe("extractVersionSuffix", () => {
  it("labels trailing suffixes and returns null with none", () => {
    expect(extractVersionSuffix("AV Script V1 + Loom")).toBe("V1 + Loom");
    expect(extractVersionSuffix("Final Delivery")).toBe("Final Delivery");
    expect(extractVersionSuffix("Competitive Analysis")).toBeNull();
  });
});
