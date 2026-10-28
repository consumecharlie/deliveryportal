import { describe, expect, it } from "vitest";
import { parseSendHint, SEND_HINT_PREFIX, shouldQueryDrafts } from "../send-hint";
import { withinBusinessHours } from "../business-hours";

const P = SEND_HINT_PREFIX;

describe("parseSendHint", () => {
  it("is unknown when there are no hint blobs", () => {
    expect(parseSendHint([])).toBeUndefined();
  });

  it("reads 'none' as nothing scheduled", () => {
    expect(parseSendHint([`${P}none`])).toBeNull();
  });

  it("takes the earliest time when several hints exist", () => {
    expect(parseSendHint([`${P}3000`, `${P}none`, `${P}1000`])).toBe(1000);
  });

  it("ignores junk and foreign pathnames", () => {
    expect(parseSendHint([`${P}abc`, "client-logos/x.png"])).toBeUndefined();
  });
});

describe("shouldQueryDrafts", () => {
  const now = new Date(10_000);

  it("always queries during business hours", () => {
    expect(shouldQueryDrafts({ now, hint: null, businessHours: true })).toBe(true);
  });

  it("queries off-hours when the hint is unknown", () => {
    expect(shouldQueryDrafts({ now, hint: undefined, businessHours: false })).toBe(true);
  });

  it("skips off-hours when nothing is scheduled", () => {
    expect(shouldQueryDrafts({ now, hint: null, businessHours: false })).toBe(false);
  });

  it("skips off-hours until the next send is due", () => {
    expect(shouldQueryDrafts({ now, hint: 20_000, businessHours: false })).toBe(false);
    expect(shouldQueryDrafts({ now, hint: 10_000, businessHours: false })).toBe(true);
    expect(shouldQueryDrafts({ now, hint: 5_000, businessHours: false })).toBe(true);
  });
});

describe("withinBusinessHours", () => {
  it("covers 8am to 7pm Eastern on weekdays", () => {
    expect(withinBusinessHours(new Date("2026-10-28T12:00:00Z"))).toBe(true); // Wed 8am EDT
    expect(withinBusinessHours(new Date("2026-10-28T11:59:00Z"))).toBe(false); // Wed 7:59am
    expect(withinBusinessHours(new Date("2026-10-28T23:00:00Z"))).toBe(false); // Wed 7pm
    expect(withinBusinessHours(new Date("2026-10-31T15:00:00Z"))).toBe(false); // Saturday
  });
});
