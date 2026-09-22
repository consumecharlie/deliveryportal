import { describe, expect, it } from "vitest";
import { allDone, stepsKey } from "@/components/portal/review-steps";

describe("stepsKey", () => {
  it("is scoped to the client and the delivery", () => {
    expect(stepsKey("tok", "del")).toBe("portal:review:tok:del");
    expect(stepsKey("tok", "other")).not.toBe(stepsKey("tok", "del"));
  });
});

describe("allDone", () => {
  it("is true only when every step is ticked", () => {
    expect(allDone(["a", "b"], ["a"])).toBe(false);
    expect(allDone(["a", "b"], ["a", "b"])).toBe(true);
  });
  it("ignores ticks for links that are no longer there", () => {
    expect(allDone(["a"], ["a", "gone"])).toBe(true);
  });
  it("is false when there is nothing to do", () => {
    expect(allDone([], [])).toBe(false);
  });
});
