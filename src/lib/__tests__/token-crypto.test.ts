import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptToken,
  decryptToken,
  hasEncryptionKey,
  MissingEncryptionKeyError,
} from "@/lib/token-crypto";

const KEY = "a".repeat(64); // 32 bytes hex

describe("token-crypto", () => {
  const original = process.env.CONNECTION_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.CONNECTION_ENCRYPTION_KEY = KEY;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CONNECTION_ENCRYPTION_KEY;
    else process.env.CONNECTION_ENCRYPTION_KEY = original;
  });

  it("round-trips a token", () => {
    const secret = "1//0gRefreshTokenExampleValue-_.~";
    expect(decryptToken(encryptToken(secret))).toBe(secret);
  });

  it("never emits the plaintext in the stored blob", () => {
    const secret = "super-secret-refresh-token";
    expect(encryptToken(secret)).not.toContain(secret);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptToken("same")).not.toBe(encryptToken("same"));
  });

  it("rejects a tampered ciphertext instead of returning garbage", () => {
    const blob = encryptToken("sensitive");
    const parts = blob.split(":");
    const ct = Buffer.from(parts[3], "base64");
    ct[0] = ct[0] ^ 0xff;
    parts[3] = ct.toString("base64");
    expect(() => decryptToken(parts.join(":"))).toThrow();
  });

  it.each(["", "nonsense", "v1:only:three", "v2:a:b:c"])(
    "rejects malformed blob %p",
    (blob) => {
      expect(() => decryptToken(blob)).toThrow();
    }
  );

  it("fails loudly when the key is missing", () => {
    delete process.env.CONNECTION_ENCRYPTION_KEY;
    expect(hasEncryptionKey()).toBe(false);
    expect(() => encryptToken("x")).toThrow(MissingEncryptionKeyError);
  });

  it("rejects a key of the wrong length", () => {
    process.env.CONNECTION_ENCRYPTION_KEY = "abcd";
    expect(() => encryptToken("x")).toThrow(/32 bytes hex/);
  });
});
