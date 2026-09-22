import { describe, expect, it } from "vitest";
import { place } from "@/components/portal/message-popover";

const rect = (x: number, y: number, w = 160, h = 24): DOMRect =>
  ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y } as DOMRect);

/** The one invariant that matters: the panel is wholly inside the viewport. */
function inFrame(p: { left: number; top: number; width: number; height: number }, vw: number, vh: number) {
  return p.top >= 0 && p.left >= 0 && p.top + p.height <= vh && p.left + p.width <= vw;
}

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

  it("clamps to either edge and keeps the beak on the control", () => {
    const right = place(rect(1300, 300), 200, 1440, 900);
    expect(right.left + right.width).toBeLessThanOrEqual(1428);
    expect(right.left + right.beakX).toBeCloseTo(1380, 0);
    const left = place(rect(4, 300), 200, 1440, 900);
    expect(left.left).toBeGreaterThanOrEqual(12);
    expect(left.left + left.beakX).toBeCloseTo(84, 0);
  });

  it("shrinks rather than overhanging when a control sits past the midpoint", () => {
    // The reported failure: a tall message, a control just below centre, and
    // neither side with room for the full height.
    const p = place(rect(600, 335), 900, 1440, 900);
    expect(inFrame(p, 1440, 900)).toBe(true);
    expect(p.top + p.height).toBeLessThanOrEqual(888);
    expect(p.height).toBeLessThanOrEqual(540);
  });

  it("stays in frame for a control at any height, at any viewport height", () => {
    for (const vh of [800, 900, 1200]) {
      for (let y = 0; y <= vh - 24; y += 8) {
        for (const natural of [200, 540, 900, 1600, 2500]) {
          const p = place(rect(600, y), natural, 1440, vh);
          expect(inFrame(p, 1440, vh), `y=${y} vh=${vh} natural=${natural}`).toBe(true);
        }
      }
    }
  });

  it("takes the roomier side when neither fits", () => {
    const lowControl = place(rect(600, 700), 900, 1440, 900);
    expect(lowControl.flipped).toBe(true);
    const highControl = place(rect(600, 60), 900, 1440, 900);
    expect(highControl.flipped).toBe(false);
  });

  it("gives up on anchoring when neither side has usable room", () => {
    // A short viewport with the control in the middle: about 210px either way.
    expect(place(rect(600, 240), 900, 1440, 500).fits).toBe(false);
    // The same control with room to work in.
    expect(place(rect(600, 240), 900, 1440, 900).fits).toBe(true);
  });

  it("takes the whole message when the room allows, without an inner scroll", () => {
    const p = place(rect(600, 60), 900, 1440, 1200);
    expect(p.height).toBe(900);
  });

  it("caps a very long message to the room, never beyond it", () => {
    for (const vh of [800, 900, 1200]) {
      const p = place(rect(600, 300), 2500, 1440, vh);
      expect(p.height).toBeLessThanOrEqual(vh - 24);
      expect(inFrame(p, 1440, vh)).toBe(true);
    }
  });

  it("narrows on a small viewport rather than overflowing", () => {
    const p = place(rect(10, 100), 200, 380, 800);
    expect(p.width).toBe(356);
    expect(p.left).toBe(12);
  });
});
