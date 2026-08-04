import { describe, it, expect } from "vitest";
import {
  RESTRICTION_OPTIONS,
  resolveBlockedDomains,
  findBlockedLinks,
  collectReviewLinkUrls,
  type ClientPreferenceData,
} from "@/lib/client-preferences";

function pref(over: Partial<ClientPreferenceData> = {}): ClientPreferenceData {
  return {
    clientFolderId: "f1",
    clientName: "KeyBank",
    enabled: true,
    warningMessage: "KeyBank can't access Google Docs.",
    destinationLink: "https://app.box.com/folder/123",
    restrictions: ["google"],
    customBlockedDomains: [],
    ...over,
  };
}

describe("resolveBlockedDomains", () => {
  it("expands the google restriction to its domains", () => {
    expect(resolveBlockedDomains(pref())).toEqual(
      expect.arrayContaining(["docs.google.com", "drive.google.com"])
    );
  });

  it("unions restriction domains with custom domains", () => {
    const domains = resolveBlockedDomains(
      pref({ restrictions: ["google"], customBlockedDomains: ["wetransfer.com"] })
    );
    expect(domains).toEqual(
      expect.arrayContaining(["docs.google.com", "drive.google.com", "wetransfer.com"])
    );
  });

  it("returns nothing for a disabled preference", () => {
    expect(resolveBlockedDomains(pref({ enabled: false }))).toEqual([]);
  });

  it("dedupes and lowercases custom domains", () => {
    const domains = resolveBlockedDomains(
      pref({ restrictions: [], customBlockedDomains: ["Docs.Google.com", "docs.google.com"] })
    );
    expect(domains).toEqual(["docs.google.com"]);
  });
});

describe("findBlockedLinks", () => {
  const p = pref();

  it("flags a google docs link", () => {
    const hits = findBlockedLinks(p, ["https://docs.google.com/document/d/abc/edit"]);
    expect(hits).toEqual(["https://docs.google.com/document/d/abc/edit"]);
  });

  it("flags subdomains of a blocked domain", () => {
    const hits = findBlockedLinks(p, ["https://drive.google.com/file/d/xyz"]);
    expect(hits).toHaveLength(1);
  });

  it("does not flag an allowed link (Box)", () => {
    expect(findBlockedLinks(p, ["https://app.box.com/folder/123"])).toEqual([]);
  });

  it("ignores empty/invalid urls", () => {
    expect(findBlockedLinks(p, ["", "not a url", null as unknown as string])).toEqual([]);
  });

  it("flags nothing when preference is disabled", () => {
    expect(
      findBlockedLinks(pref({ enabled: false }), ["https://docs.google.com/x"])
    ).toEqual([]);
  });

  it("exposes google as a predefined restriction option", () => {
    expect(RESTRICTION_OPTIONS.map((o) => o.key)).toContain("google");
  });
});

describe("collectReviewLinkUrls", () => {
  it("collects standard + extra link urls, dropping empties", () => {
    const urls = collectReviewLinkUrls(
      { googleDeliverableLink: "https://docs.google.com/x", frameReviewLink: "" },
      [{ url: "https://app.box.com/y" }, { url: "" }]
    );
    expect(urls).toEqual(["https://docs.google.com/x", "https://app.box.com/y"]);
  });

  it("handles undefined inputs", () => {
    expect(collectReviewLinkUrls(undefined, undefined)).toEqual([]);
  });
});
