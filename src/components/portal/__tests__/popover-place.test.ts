import { describe, expect, it } from "vitest";
import { place } from "@/components/portal/message-popover";

const rect = (x: number, y: number, w = 160, h = 24): DOMRect =>
  ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y } as DOMRect);

describe("place", () => {
  it("sits below the control and centres the beak on it", () => {
    const p = place(rect(600, 300), 300, 1440, 900);
    expect(p.flipped).toBe(false);
    expect(p.top).toBe(334);
    expect(p.left + p.beakX).toBeCloseTo(680, 0);
  });
  it("flips above when there is no room below", () => {
    const p = place(rect(600, 700), 300, 1440, 900);
    expect(p.flipped).toBe(true);
    expect(p.top).toBe(390);
    expect(p.left + p.beakX).toBeCloseTo(680, 0);
  });
  it("clamps to the right edge and keeps the beak on the control", () => {
    const p = place(rect(1300, 300), 200, 1440, 900);
    expect(p.left + p.width).toBeLessThanOrEqual(1428);
    expect(p.left + p.beakX).toBeCloseTo(1380, 0);
  });
  it("clamps to the left edge too", () => {
    const p = place(rect(4, 300), 200, 1440, 900);
    expect(p.left).toBeGreaterThanOrEqual(12);
    expect(p.left + p.beakX).toBeCloseTo(84, 0);
  });
  it("keeps the beak inside the popover when the control is far off to one side", () => {
    const p = place(rect(1430, 300, 6), 200, 1440, 900);
    expect(p.beakX).toBeLessThanOrEqual(p.width - 15);
    expect(p.beakX).toBeGreaterThanOrEqual(15);
  });
  it("narrows on a small viewport rather than overflowing", () => {
    const p = place(rect(10, 100), 200, 380, 800);
    expect(p.width).toBe(356);
    expect(p.left).toBe(12);
  });
  it("stays on screen when it fits neither way", () => {
    const p = place(rect(600, 400), 820, 1440, 900);
    expect(p.top).toBeGreaterThanOrEqual(12);
  });
});
