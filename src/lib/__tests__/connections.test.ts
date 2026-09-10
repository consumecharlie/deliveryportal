import { describe, it, expect } from "vitest";
import { isExpired, describeConnection, EXPIRY_SKEW_SECONDS } from "@/lib/connections";

const now = new Date("2026-09-09T20:00:00Z");

describe("isExpired", () => {
  it("treats a token with no expiry as valid", () => {
    // Slack user tokens without rotation never expire; treating them as expired
    // would refresh-loop forever.
    expect(isExpired(null, now)).toBe(false);
    expect(isExpired(undefined, now)).toBe(false);
  });

  it("is valid well before expiry", () => {
    expect(isExpired(new Date("2026-09-09T21:00:00Z"), now)).toBe(false);
  });

  it("is expired after expiry", () => {
    expect(isExpired(new Date("2026-09-09T19:59:00Z"), now)).toBe(true);
  });

  it("refreshes early, inside the skew window", () => {
    // 60s out is inside the 120s skew, so refresh rather than race the clock.
    expect(isExpired(new Date("2026-09-09T20:01:00Z"), now)).toBe(true);
    // 3 minutes out is beyond it.
    expect(isExpired(new Date("2026-09-09T20:03:00Z"), now)).toBe(false);
  });

  it("uses a two minute skew by default", () => {
    expect(EXPIRY_SKEW_SECONDS).toBe(120);
  });
});

describe("describeConnection", () => {
  it("reports a missing connection as not connected", () => {
    expect(describeConnection(null)).toEqual({ state: "not_connected", canSend: false });
  });

  it("blocks sending when the provider revoked access", () => {
    expect(
      describeConnection({ status: "needs_reconnect", expiresAt: null })
    ).toEqual({ state: "needs_reconnect", canSend: false });
    expect(describeConnection({ status: "revoked", expiresAt: null })).toEqual({
      state: "needs_reconnect",
      canSend: false,
    });
  });

  it("stays connected with a merely stale access token", () => {
    // We hold a refresh token, so an expired access token is not a user problem.
    expect(
      describeConnection({ status: "connected", expiresAt: new Date("2020-01-01") }, now)
    ).toEqual({ state: "connected", canSend: true });
  });

  it("is connected when healthy", () => {
    expect(
      describeConnection({ status: "connected", expiresAt: new Date("2026-09-09T23:00:00Z") }, now)
    ).toEqual({ state: "connected", canSend: true });
  });
});
