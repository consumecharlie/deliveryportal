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
