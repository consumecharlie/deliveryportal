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

  it("honors explicit overrides before affix stripping", () => {
    expect(extractFamilyName("Edit V1")).toBe("Edit");
    expect(extractFamilyName("Final Delivery")).toBe("Edit");
  });

  it("strips a leading 'Final ' so 'Final Edit' joins the Edit family", () => {
    expect(extractFamilyName("Final Edit")).toBe("Edit");
    expect(extractFamilyName("Final AV Script")).toBe("AV Script");
  });

  it("leaves a name with no version affix alone", () => {
    expect(extractFamilyName("Competitive Analysis")).toBe("Competitive Analysis");
  });
});

describe("getVersionSortKey", () => {
  it("orders a leading 'Final ' after V1/V2/V3 like a trailing Final", () => {
    expect(getVersionSortKey("Final Edit")).toBe(getVersionSortKey("AV Script Final"));
    expect(getVersionSortKey("Final Edit")).toBeGreaterThan(getVersionSortKey("Edit V3"));
  });
});

describe("extractVersionSuffix", () => {
  it("labels a leading 'Final ' as 'Final'", () => {
    expect(extractVersionSuffix("Final Edit")).toBe("Final");
  });

  it("still labels trailing suffixes and returns null with none", () => {
    expect(extractVersionSuffix("AV Script V1 + Loom")).toBe("V1 + Loom");
    expect(extractVersionSuffix("Competitive Analysis")).toBeNull();
  });
});
