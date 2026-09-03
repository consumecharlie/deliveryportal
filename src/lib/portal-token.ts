import { randomBytes } from "crypto";

/** 24 random bytes -> 32 base64url chars. ~144 bits of entropy. */
export function generatePortalToken(): string {
  return randomBytes(24).toString("base64url");
}

export function isValidPortalToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(token);
}
