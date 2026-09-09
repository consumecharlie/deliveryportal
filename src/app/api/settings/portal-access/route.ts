import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserEmail } from "@/lib/get-session-user";
import { createOrRotateAccess, parseLogoUrl } from "@/lib/portal-access";

export interface PortalAccessSummary {
  id: string;
  clientFolderId: string;
  clientName: string;
  token: string;
  createdBy: string;
  createdAt: string;
  lastViewedAt: string | null;
  viewCount: number;
  /** Client logo for the portal header (ClientPreference.logoUrl). */
  logoUrl: string | null;
}

/**
 * GET /api/settings/portal-access
 *
 * Every active (unrevoked) client portal link, with view stats.
 */
export async function GET() {
  try {
    const rows = await prisma.portalAccess.findMany({
      where: { revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    const ids = rows.map((r) => r.id);
    const stats = ids.length
      ? await prisma.portalView.groupBy({
          by: ["accessId"],
          where: { accessId: { in: ids } },
          _count: { _all: true },
          _max: { viewedAt: true },
        })
      : [];
    const byAccess = new Map(stats.map((s) => [s.accessId, s]));
    const folderIds = Array.from(new Set(rows.map((r) => r.clientFolderId)));
    const prefs = folderIds.length
      ? await prisma.clientPreference.findMany({
          where: { clientFolderId: { in: folderIds } },
          select: { clientFolderId: true, logoUrl: true },
        })
      : [];
    const logoByFolder = new Map(prefs.map((p) => [p.clientFolderId, p.logoUrl ?? null]));

    const links: PortalAccessSummary[] = rows.map((r) => {
      const s = byAccess.get(r.id);
      return {
        id: r.id,
        clientFolderId: r.clientFolderId,
        clientName: r.clientName,
        token: r.token,
        createdBy: r.createdBy,
        createdAt: r.createdAt.toISOString(),
        lastViewedAt: s?._max.viewedAt?.toISOString() ?? null,
        viewCount: s?._count._all ?? 0,
        logoUrl: logoByFolder.get(r.clientFolderId) ?? null,
      };
    });
    return NextResponse.json({ links });
  } catch (error) {
    console.error("Failed to list portal access:", error);
    return NextResponse.json({ links: [] }, { status: 500 });
  }
}

/**
 * POST /api/settings/portal-access  { clientFolderId, clientName }
 *
 * Create (or rotate) the portal link for a client. Any existing active link
 * for the folder is revoked in the same transaction.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      clientFolderId?: string;
      clientName?: string;
    };
    const clientFolderId = String(body.clientFolderId ?? "").trim();
    const clientName = String(body.clientName ?? "").trim();
    if (!clientFolderId || !clientName) {
      return NextResponse.json(
        { error: "clientFolderId and clientName are required" },
        { status: 400 }
      );
    }
    const createdBy = await getSessionUserEmail();
    const row = await createOrRotateAccess(prisma, {
      clientFolderId,
      clientName,
      createdBy,
    });
    const link: PortalAccessSummary = {
      id: row.id,
      clientFolderId: row.clientFolderId,
      clientName: row.clientName,
      token: row.token,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      lastViewedAt: null,
      viewCount: 0,
      logoUrl: null,
    };
    return NextResponse.json({ link });
  } catch (error) {
    console.error("Failed to create portal access:", error);
    return NextResponse.json(
      { error: "Failed to create portal link" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/settings/portal-access  { clientFolderId, clientName, logoUrl | null }
 *
 * Set or clear the client logo shown in the portal header. Upserts the
 * client's ClientPreference row (with defaults when none exists yet).
 */
export async function PATCH(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      clientFolderId?: string;
      clientName?: string;
      logoUrl?: unknown;
    };
    const clientFolderId = String(body.clientFolderId ?? "").trim();
    const clientName = String(body.clientName ?? "").trim();
    if (!clientFolderId || !clientName) {
      return NextResponse.json(
        { error: "clientFolderId and clientName are required" },
        { status: 400 }
      );
    }
    const parsed = parseLogoUrl(body.logoUrl);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const updatedBy = await getSessionUserEmail();
    const row = await prisma.clientPreference.upsert({
      where: { clientFolderId },
      create: {
        clientFolderId,
        clientName,
        enabled: true,
        warningMessage: "",
        restrictions: [],
        customBlockedDomains: [],
        logoUrl: parsed.value,
        updatedBy,
      },
      update: { logoUrl: parsed.value, updatedBy },
      select: { clientFolderId: true, logoUrl: true },
    });
    return NextResponse.json({ clientFolderId: row.clientFolderId, logoUrl: row.logoUrl ?? null });
  } catch (error) {
    console.error("Failed to update portal logo:", error);
    return NextResponse.json({ error: "Failed to update logo" }, { status: 500 });
  }
}

/**
 * DELETE /api/settings/portal-access?id=<id>
 *
 * Revoke one link. The token stops resolving immediately.
 */
export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const result = await prisma.portalAccess.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      return NextResponse.json(
        { error: "Link not found or already revoked" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to revoke portal access:", error);
    return NextResponse.json(
      { error: "Failed to revoke portal link" },
      { status: 500 }
    );
  }
}
