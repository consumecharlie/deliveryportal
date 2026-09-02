import { describe, it, expect } from "vitest";
import {
  officeHolidays,
  holidaySet,
  isBusinessDay,
  rollForwardToBusinessDay,
  addBusinessDays,
  businessDaysBetween,
} from "@/lib/us-holidays";

describe("officeHolidays", () => {
  // Verified against real-world calendars. These are office-closure days, not
  // the full federal list.
  it.each([
    [2025, ["2025-01-01", "2025-05-26", "2025-07-04", "2025-09-01", "2025-11-27", "2025-11-28", "2025-12-25"]],
    [2026, ["2026-01-01", "2026-05-25", "2026-07-03", "2026-09-07", "2026-11-26", "2026-11-27", "2026-12-25"]],
    [2027, ["2027-01-01", "2027-05-31", "2027-07-05", "2027-09-06", "2027-11-25", "2027-11-26", "2027-12-24", "2027-12-31"]],
    [2028, ["2028-05-29", "2028-07-04", "2028-09-04", "2028-11-23", "2028-11-24", "2028-12-25"]],
  ])("computes %i correctly", (year, expected) => {
    expect(officeHolidays(year as number)).toEqual([...(expected as string[])].sort());
  });

  it("observes a Saturday holiday on the Friday before", () => {
    // Jul 4 2026 is a Saturday.
    expect(officeHolidays(2026)).toContain("2026-07-03");
    expect(officeHolidays(2026)).not.toContain("2026-07-04");
  });

  it("observes a Sunday holiday on the Monday after", () => {
    // Jul 4 2027 is a Sunday.
    expect(officeHolidays(2027)).toContain("2027-07-05");
  });

  it("files a Saturday New Year's under the previous year, not the new one", () => {
    // Jan 1 2028 is a Saturday, so the closure is Fri Dec 31 2027.
    expect(officeHolidays(2027)).toContain("2027-12-31");
    expect(officeHolidays(2028)).not.toContain("2027-12-31");
    expect(officeHolidays(2028)).not.toContain("2028-01-01");
  });

  it("keeps working far in the future without maintenance", () => {
    // Christmas 2033 is a Sunday -> Mon Dec 26. New Year 2040 is a Sunday -> Mon Jan 2.
    expect(officeHolidays(2033)).toContain("2033-12-26");
    expect(officeHolidays(2040)).toContain("2040-01-02");
  });
});

describe("holidaySet", () => {
  it("spans neighbouring years so a boundary closure is never missed", () => {
    // Asking about 2028 alone must still know about the Dec 31 2027 closure.
    expect(holidaySet([2028]).has("2027-12-31")).toBe(true);
  });

  it("accepts one-off company closures", () => {
    expect(holidaySet([2026], ["2026-03-16"]).has("2026-03-16")).toBe(true);
  });
});

describe("business day helpers", () => {
  const closures = holidaySet([2026]);

  it("treats weekends and closures as non-business days", () => {
    expect(isBusinessDay("2026-09-02", closures)).toBe(true); // Wednesday
    expect(isBusinessDay("2026-09-05", closures)).toBe(false); // Saturday
    expect(isBusinessDay("2026-09-06", closures)).toBe(false); // Sunday
    expect(isBusinessDay("2026-09-07", closures)).toBe(false); // Labor Day
  });

  it("rolls a weekend start forward before counting", () => {
    expect(rollForwardToBusinessDay("2026-09-05", closures)).toBe("2026-09-08");
    expect(rollForwardToBusinessDay("2026-09-02", closures)).toBe("2026-09-02");
  });

  it("adds business days across a weekend", () => {
    // Thu Sep 3 + 2 business days = Mon Sep 7... which is Labor Day, so Tue Sep 8.
    expect(addBusinessDays("2026-09-03", 2, closures)).toBe("2026-09-08");
  });

  it("skips a holiday", () => {
    // Fri Sep 4 + 1 business day would be Mon Sep 7 (Labor Day) -> Tue Sep 8.
    expect(addBusinessDays("2026-09-04", 1, closures)).toBe("2026-09-08");
  });

  it("treats zero days as the delivery day itself", () => {
    expect(addBusinessDays("2026-09-02", 0, closures)).toBe("2026-09-02");
  });

  it("inverts cleanly", () => {
    expect(businessDaysBetween("2026-09-02", "2026-09-04", closures)).toBe(2);
    expect(businessDaysBetween("2026-09-02", "2026-09-03", closures)).toBe(1);
    expect(businessDaysBetween("2026-09-04", "2026-09-08", closures)).toBe(1);
  });

  it("returns null when the deadline precedes the anchor", () => {
    expect(businessDaysBetween("2026-09-04", "2026-09-02", closures)).toBeNull();
  });

  it("returns null for a deadline landing on a non-business day", () => {
    expect(businessDaysBetween("2026-09-02", "2026-09-05", closures)).toBeNull();
  });
});
