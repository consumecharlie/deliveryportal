import type { PrismaClient } from "@prisma/client";
import { generatePortalToken } from "./portal-token";

export interface PortalAccessRow {
  id: string;
  clientFolderId: string;
  clientName: string;
  token: string;
  createdBy: string;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface CreateOrRotateInput {
  clientFolderId: string;
  clientName: string;
  createdBy: string;
}

/**
 * Create a fresh portal link for a client folder. Runs in one transaction:
 * every active (revokedAt null) row for the folder is revoked first, then the
 * new row is inserted, so there is never more than one live link per client.
 * Used for both "Create link" (no active rows to revoke) and "Rotate".
 */
export async function createOrRotateAccess(
  db: PrismaClient,
  input: CreateOrRotateInput
): Promise<PortalAccessRow> {
  const clientFolderId = input.clientFolderId.trim();
  const clientName = input.clientName.trim();
  if (!clientFolderId || !clientName) {
    throw new Error("clientFolderId and clientName are required");
  }
  const now = new Date();
  return db.$transaction(async (tx) => {
    await tx.portalAccess.updateMany({
      where: { clientFolderId, revokedAt: null },
      data: { revokedAt: now },
    });
    return tx.portalAccess.create({
      data: {
        clientFolderId,
        clientName,
        token: generatePortalToken(),
        createdBy: input.createdBy,
      },
    });
  });
}

/** Build the client-facing portal URL. `listId` adds the project deep link. */
export function buildPortalUrl(
  base: string,
  token: string,
  listId?: string | null
): string {
  const root = `${base.replace(/\/+$/, "")}/portal/${token}`;
  return listId ? `${root}/${listId}` : root;
}

/** `…/portal/abcd…wxyz`: enough to recognise a link, not enough to use it. */
export function maskPortalToken(token: string): string {
  if (token.length <= 8) return `…/portal/${token}`;
  return `…/portal/${token.slice(0, 4)}…${token.slice(-4)}`;
}

/**
 * Validate a client logo URL for the portal header: an https URL, or null to
 * clear it. Returns `{ ok: false }` for anything else (http, blank strings
 * count as clearing).
 */
export function parseLogoUrl(input: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false, error: "logoUrl must be a string or null" };
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: null };
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return { ok: false, error: "logoUrl must be an https URL" };
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false, error: "logoUrl must be a valid https URL" };
  }
}
