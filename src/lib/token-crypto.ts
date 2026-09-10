/**
 * Envelope encryption for stored OAuth tokens.
 *
 * Refresh tokens let the portal act as the user whose account they belong to,
 * so they are never stored in plaintext. AES-256-GCM gives us authenticated
 * encryption: a tampered ciphertext fails to decrypt rather than silently
 * yielding garbage.
 *
 * Key: CONNECTION_ENCRYPTION_KEY, 32 bytes hex-encoded (64 hex chars).
 * Generate with: openssl rand -hex 32
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard
const VERSION = "v1";

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super(
      "CONNECTION_ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32`."
    );
    this.name = "MissingEncryptionKeyError";
  }
}

function getKey(): Buffer {
  const raw = process.env.CONNECTION_ENCRYPTION_KEY?.trim();
  if (!raw) throw new MissingEncryptionKeyError();
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error(
      `CONNECTION_ENCRYPTION_KEY must be 32 bytes hex (64 chars); got ${key.length} bytes.`
    );
  }
  return key;
}

/** Encrypt a token. Output is self-describing: "v1:<iv>:<tag>:<ciphertext>". */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

/** Decrypt a token produced by `encryptToken`. Throws if tampered or malformed. */
export function decryptToken(blob: string): string {
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Malformed encrypted token");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** True when the key is configured, so callers can degrade gracefully. */
export function hasEncryptionKey(): boolean {
  return !!process.env.CONNECTION_ENCRYPTION_KEY?.trim();
}
