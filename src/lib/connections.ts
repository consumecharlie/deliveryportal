/**
 * Per-user OAuth connections (Google, Slack) used to send deliveries on that
 * person's behalf.
 *
 * The point of this module is self-service: a user can see their own connection
 * health and fix it themselves. Previously these credentials lived in n8n, so
 * when Tony's Gmail token expired on 2026-09-09 he could not see the failure and
 * could not fix it, while the administrator who could fix it never saw it.
 *
 * See docs/plans/2026-09-09-portal-native-send-design.md.
 */

import { prisma } from "@/lib/db";
import { decryptToken, encryptToken } from "@/lib/token-crypto";

export type Provider = "google" | "slack";
export type ConnectionStatus = "connected" | "needs_reconnect" | "revoked";

/** Refresh this many seconds before actual expiry, to avoid racing the clock. */
export const EXPIRY_SKEW_SECONDS = 120;

export interface ConnectionRecord {
  userEmail: string;
  provider: Provider;
  status: ConnectionStatus;
  expiresAt: Date | null;
  scopes: string;
  externalLabel: string | null;
  lastError: string | null;
}

/** Raised when a token cannot be refreshed and the user must reconnect. */
export class ReconnectRequiredError extends Error {
  constructor(
    public readonly provider: Provider,
    public readonly userEmail: string,
    detail?: string
  ) {
    super(
      `${userEmail} needs to reconnect their ${provider} account${detail ? `: ${detail}` : ""}`
    );
    this.name = "ReconnectRequiredError";
  }
}

/**
 * Whether a token needs refreshing. Pure so the skew logic is testable without
 * a database or a clock.
 */
export function isExpired(
  expiresAt: Date | null | undefined,
  now: Date = new Date(),
  skewSeconds: number = EXPIRY_SKEW_SECONDS
): boolean {
  // No expiry recorded means a non-expiring token (Slack user tokens without
  // rotation). Treating those as expired would refresh-loop forever.
  if (!expiresAt) return false;
  return expiresAt.getTime() - skewSeconds * 1000 <= now.getTime();
}

/**
 * Reduce a stored row to what the UI should say. Kept pure and separate from
 * the DB so the sender picker and Settings agree on wording.
 */
export function describeConnection(
  record: Pick<ConnectionRecord, "status" | "expiresAt"> | null
): { state: "connected" | "needs_reconnect" | "not_connected"; canSend: boolean } {
  if (!record) return { state: "not_connected", canSend: false };
  if (record.status !== "connected") return { state: "needs_reconnect", canSend: false };
  // An expired access token is fine when we hold a refresh token; the caller
  // refreshes transparently. Status is the authority, not the clock.
  return { state: "connected", canSend: true };
}

export async function getConnection(
  userEmail: string,
  provider: Provider
): Promise<ConnectionRecord | null> {
  try {
    const row = await prisma.connection.findUnique({
      where: { userEmail_provider: { userEmail, provider } },
    });
    if (!row) return null;
    return {
      userEmail: row.userEmail,
      provider: row.provider as Provider,
      status: row.status as ConnectionStatus,
      expiresAt: row.expiresAt,
      scopes: row.scopes,
      externalLabel: row.externalLabel,
      lastError: row.lastError,
    };
  } catch {
    // DB down: the portal degrades to "not connected" rather than crashing.
    return null;
  }
}

export async function listConnections(userEmail: string): Promise<ConnectionRecord[]> {
  try {
    const rows = await prisma.connection.findMany({ where: { userEmail } });
    return rows.map((row) => ({
      userEmail: row.userEmail,
      provider: row.provider as Provider,
      status: row.status as ConnectionStatus,
      expiresAt: row.expiresAt,
      scopes: row.scopes,
      externalLabel: row.externalLabel,
      lastError: row.lastError,
    }));
  } catch {
    return [];
  }
}

export async function saveConnection(input: {
  userEmail: string;
  provider: Provider;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes: string;
  externalId?: string | null;
  externalLabel?: string | null;
}): Promise<void> {
  const data = {
    accessToken: encryptToken(input.accessToken),
    // Google only returns a refresh token on the first consent (or with
    // prompt=consent). Never overwrite a stored one with null.
    ...(input.refreshToken
      ? { refreshToken: encryptToken(input.refreshToken) }
      : {}),
    expiresAt: input.expiresAt ?? null,
    scopes: input.scopes,
    status: "connected",
    externalId: input.externalId ?? null,
    externalLabel: input.externalLabel ?? null,
    lastError: null,
    lastCheckedAt: new Date(),
  };

  await prisma.connection.upsert({
    where: { userEmail_provider: { userEmail: input.userEmail, provider: input.provider } },
    create: {
      userEmail: input.userEmail,
      provider: input.provider,
      refreshToken: input.refreshToken ? encryptToken(input.refreshToken) : null,
      ...data,
    },
    update: data,
  });
}

export async function markNeedsReconnect(
  userEmail: string,
  provider: Provider,
  detail: string
): Promise<void> {
  try {
    await prisma.connection.update({
      where: { userEmail_provider: { userEmail, provider } },
      data: { status: "needs_reconnect", lastError: detail.slice(0, 500), lastCheckedAt: new Date() },
    });
  } catch {
    // Non-fatal: the send has already failed and the caller reports that.
  }
}

export async function deleteConnection(userEmail: string, provider: Provider): Promise<void> {
  try {
    await prisma.connection.delete({
      where: { userEmail_provider: { userEmail, provider } },
    });
  } catch {
    // Already gone.
  }
}

/** Decrypted tokens for internal use. Never return these to the browser. */
export async function getDecryptedTokens(
  userEmail: string,
  provider: Provider
): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: Date | null } | null> {
  const row = await prisma.connection.findUnique({
    where: { userEmail_provider: { userEmail, provider } },
  });
  if (!row) return null;
  return {
    accessToken: decryptToken(row.accessToken),
    refreshToken: row.refreshToken ? decryptToken(row.refreshToken) : null,
    expiresAt: row.expiresAt,
  };
}
