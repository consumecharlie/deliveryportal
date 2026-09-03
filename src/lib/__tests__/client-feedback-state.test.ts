import { describe, it, expect } from "vitest";
import { deriveClientFeedback } from "@/lib/client-feedback-state";

describe("deriveClientFeedback", () => {
  it("uses only the newest row per delivery", () => {
    const m = deriveClientFeedback([
      { deliveryId: "d1", confirmedAt: new Date("2026-09-03T10:00:00Z"), confirmedByName: "Dana", undoneAt: null },
      { deliveryId: "d1", confirmedAt: new Date("2026-09-01T10:00:00Z"), confirmedByName: "Sam", undoneAt: new Date("2026-09-02T10:00:00Z") },
    ]);
    expect(m.get("d1")).toEqual({
      state: "confirmed",
      confirmedAt: "2026-09-03T10:00:00.000Z",
      confirmedByName: "Dana",
    });
  });

  it("marks a delivery reopened when the newest row was undone", () => {
    const m = deriveClientFeedback([
      { deliveryId: "d2", confirmedAt: "2026-09-03T10:00:00.000Z", confirmedByName: null, undoneAt: "2026-09-03T11:00:00.000Z" },
    ]);
    expect(m.get("d2")?.state).toBe("reopened");
    expect(m.get("d2")?.confirmedByName).toBeNull();
  });

  it("omits deliveries with no rows", () => {
    expect(deriveClientFeedback([]).size).toBe(0);
  });
});
