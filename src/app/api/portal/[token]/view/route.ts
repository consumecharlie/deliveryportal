/**
 * Per-delivery view beacon. The portal pages log an open per access when
 * they render; this records which delivery the client actually engaged with
 * (a review link click or "Show message"). Best effort: a logging failure is
 * never surfaced to the client.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAccess } from "@/lib/portal-data";
import { recordView } from "@/lib/portal-views";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** cuid / cuid2 shaped: lowercase alphanumerics, 20 to 32 chars. */
const DELIVERY_ID = /^[a-z0-9]{20,32}$/;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await resolveAccess(token);
  if (!access) return json({ error: "Not found" }, 404);

  const body = (await req.json().catch(() => ({}))) as { deliveryId?: unknown };
  const deliveryId = typeof body.deliveryId === "string" && DELIVERY_ID.test(body.deliveryId) ? body.deliveryId : "";
  if (!deliveryId) return json({ error: "deliveryId required" }, 400);

  try {
    // Scope first: a delivery outside this client's folder is simply not found.
    const delivery = await prisma.delivery.findFirst({
      where: { id: deliveryId, clientFolderId: access.clientFolderId },
      select: { id: true },
    });
    if (!delivery) return json({ error: "Not found" }, 404);
    await recordView(access.id, deliveryId, req.headers.get("user-agent"));
  } catch (err) {
    // A view log is never worth an error in the client's console.
    console.error("[portal-view] failed", access.id, deliveryId, err);
  }
  return json({ ok: true });
}
