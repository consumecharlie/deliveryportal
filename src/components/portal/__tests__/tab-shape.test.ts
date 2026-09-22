import { describe, expect, it } from "vitest";
import {
  ACTIVE_H,
  INACTIVE_H,
  MIN_TAB_W,
  STRIP_H,
  baselineY,
  stripWidth,
  tabOutline,
  tabPath,
  tabSlots,
} from "@/components/portal/tab-shape";

describe("stripWidth", () => {
  it("fills the strip when the tabs fit", () => {
    expect(stripWidth(900, 3)).toBe(900);
    expect(stripWidth(900, 1)).toBe(900);
  });
  it("overflows once tabs would go under the floor", () => {
    expect(stripWidth(300, 6)).toBe(6 * MIN_TAB_W);
  });
});

describe("tabSlots", () => {
  it("divides the strip into equal shares", () => {
    const slots = tabSlots(902, 3);
    const widths = slots.map((s) => s.x1 - s.x0);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  });
  it("gives one tab the whole strip", () => {
    const [only] = tabSlots(902, 1);
    // the strip less half a stroke at each end
    expect(only.x1 - only.x0).toBe(900);
  });
  it("has neighbours share an edge exactly, with no gap or overlap", () => {
    const slots = tabSlots(637, 5);
    for (let i = 1; i < slots.length; i++) expect(slots[i].x0).toBe(slots[i - 1].x1);
  });
  it("stays inside the strip", () => {
    const slots = tabSlots(500, 4);
    expect(slots[0].x0).toBeGreaterThanOrEqual(1);
    expect(slots[slots.length - 1].x1).toBeLessThanOrEqual(499);
  });
});

describe("tabPath", () => {
  it("starts and ends on the baseline, so the strip's edge closes it", () => {
    const [slot] = tabSlots(400, 1);
    const d = tabPath(slot, ACTIVE_H);
    expect(d.startsWith(`M ${slot.x0} ${baselineY}`)).toBe(true);
    expect(d.endsWith(`L ${slot.x1} ${baselineY}`)).toBe(true);
  });
  it("never draws outside the strip", () => {
    for (const count of [1, 3, 5]) {
      for (const slot of tabSlots(900, count)) {
        for (const [x, y] of tabOutline(slot, ACTIVE_H)) {
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(STRIP_H);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(900);
        }
      }
    }
  });
  it("keeps the top edge inside the slot, so the keystone really narrows", () => {
    const [slot] = tabSlots(300, 1);
    const top = tabOutline(slot, INACTIVE_H).filter(([, y]) => y <= baselineY - INACTIVE_H + 0.01);
    expect(Math.min(...top.map(([x]) => x))).toBeGreaterThan(slot.x0);
    expect(Math.max(...top.map(([x]) => x))).toBeLessThan(slot.x1);
  });
  it("degrades without inverting when a tab is at the floor", () => {
    const slots = tabSlots(MIN_TAB_W * 5, 5);
    for (const slot of slots) {
      const pts = tabOutline(slot, ACTIVE_H);
      // x never runs backwards: no crossed or folded corner
      for (let i = 1; i < pts.length; i++) expect(pts[i][0]).toBeGreaterThanOrEqual(pts[i - 1][0] - 0.01);
    }
  });
});
