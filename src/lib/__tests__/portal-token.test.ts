import { generatePortalToken, isValidPortalToken } from "@/lib/portal-token";

describe("portal token", () => {
  it("is 32 url-safe chars and unique", () => {
    const a = generatePortalToken();
    const b = generatePortalToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(b);
  });

  it("validates shape only", () => {
    expect(isValidPortalToken(generatePortalToken())).toBe(true);
    expect(isValidPortalToken("short")).toBe(false);
    expect(isValidPortalToken("x".repeat(32) + "/")).toBe(false);
  });
});
