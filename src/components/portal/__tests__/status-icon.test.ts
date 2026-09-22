import { describe, expect, it } from "vitest";
import { statusIconKind } from "@/components/portal/status-icon";

describe("statusIconKind", () => {
  it("draws one mark for a state and all its urgent variants", () => {
    for (const state of ["awaiting", "due-today", "overdue"] as const) {
      expect(statusIconKind(state, "feedback")).toBe("bubble");
      expect(statusIconKind(state, "approval")).toBe("check-circle");
    }
  });
  it("fills the same mark once it is settled", () => {
    expect(statusIconKind("confirmed", "feedback")).toBe("bubble-filled");
    expect(statusIconKind("confirmed", "approval")).toBe("check-circle-filled");
  });
  it("uses the tray for something simply delivered", () => {
    expect(statusIconKind("none", "feedback")).toBe("tray");
    expect(statusIconKind("none", "approval")).toBe("tray");
  });
});
