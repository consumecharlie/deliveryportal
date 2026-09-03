import { describe, it, expect } from "vitest";
import { generatePortalToken, isValidPortalToken } from "@/lib/portal-token";

describe("portal token", () => {
  it("is 32 url-safe chars and unique", () => {
    const a = generatePortalToken();
    const b = generatePortalToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(b);
  });

  it("is unique across 100 generated tokens", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(generatePortalToken());
    expect(seen.size).toBe(100);
  });

  it("validates shape only", () => {
    expect(isValidPortalToken(generatePortalToken())).toBe(true);
    expect(isValidPortalToken("short")).toBe(false);
    expect(isValidPortalToken("x".repeat(32) + "/")).toBe(false);
  });

  it("rejects wrong lengths", () => {
    expect(isValidPortalToken("x".repeat(31))).toBe(false);
    expect(isValidPortalToken("x".repeat(33))).toBe(false);
    expect(isValidPortalToken("")).toBe(false);
  });

  it("rejects standard base64 characters that are not url-safe", () => {
    expect(isValidPortalToken("x".repeat(31) + "+")).toBe(false);
    expect(isValidPortalToken("x".repeat(31) + "=")).toBe(false);
  });
});
