import { NextResponse } from "next/server";
import { resolveAccess } from "@/lib/portal-data";
import { undoFeedback, lastFeedbackActivity, PortalConfirmError } from "@/lib/portal-confirm";
import { isDoubleClick } from "@/lib/portal-confirm-guard";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await resolveAccess(token);
  if (!access) return json({ error: "Not found" }, 404);
  const body = (await req.json().catch(() => ({}))) as { deliveryId?: string };
  const deliveryId = typeof body.deliveryId === "string" ? body.deliveryId : "";
  if (!deliveryId) return json({ error: "deliveryId required" }, 400);

  try {
    if (isDoubleClick(await lastFeedbackActivity(deliveryId, access.clientFolderId), Date.now())) {
      return json({ error: "Please wait a moment before trying again" }, 429);
    }
    const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    await undoFeedback({
      clientFolderId: access.clientFolderId,
      clientName: access.clientName,
      deliveryId,
      portalUrl: `${base}/portal/${token}`,
    });
    return json({ ok: true });
  } catch (err) {
    if (err instanceof PortalConfirmError) return json({ error: err.message }, err.status);
    console.error("portal undo failed", deliveryId, err);
    return json({ error: "Could not save" }, 500);
  }
}
