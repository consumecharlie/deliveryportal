import { describe, expect, it } from "vitest";
import { versionTag } from "@/components/portal/format";

describe("versionTag", () => {
  it("numbers ordinary versions", () => {
    expect(versionTag("Post Script V1", 1)).toBe("V1");
    expect(versionTag("Edit V2", 2)).toBe("V2");
  });

  it("tags a whole-word Final regardless of case", () => {
    expect(versionTag("Post Script Final", 3)).toBe("FINAL");
    expect(versionTag("Final Delivery", 4)).toBe("FINAL");
    expect(versionTag("FINAL DELIVERABLES", 2)).toBe("FINAL");
  });

  it("ignores Final inside another word", () => {
    expect(versionTag("Finalist Cut", 2)).toBe("V2");
    expect(versionTag("Semifinal", 1)).toBe("V1");
  });

  it("keeps the numbering of the versions around a final", () => {
    const labels = ["Post Script V1", "Post Script V2", "Post Script Final"];
    expect(labels.map((l, i) => versionTag(l, i + 1))).toEqual(["V1", "V2", "FINAL"]);
  });
});
