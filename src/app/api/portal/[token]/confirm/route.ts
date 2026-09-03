import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAccess, loadPortal } from "@/lib/portal-data";
import { confirmFeedback, lastFeedbackActivity, PortalConfirmError } from "@/lib/portal-confirm";
import { isDoubleClick } from "@/lib/portal-confirm-guard";
import { getAppBaseUrl } from "@/lib/app-base-url";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await resolveAccess(token);
  if (!access) return json({ error: "Not found" }, 404);
  const body = (await req.json().catch(() => ({}))) as { deliveryId?: string; name?: string };
  const deliveryId = typeof body.deliveryId === "string" ? body.deliveryId : "";
  if (!deliveryId) return json({ error: "deliveryId required" }, 400);

  try {
    // Scope first: a delivery outside this client's folder is simply not found.
    const delivery = await prisma.delivery.findFirst({
      where: { id: deliveryId, clientFolderId: access.clientFolderId },
      select: { projectListId: true },
    });
    if (!delivery) return json({ error: "Not found" }, 404);

    if (isDoubleClick(await lastFeedbackActivity(deliveryId, access.clientFolderId), Date.now())) {
      return json({ error: "Please wait a moment before trying again" }, 429);
    }

    // Recompute status server-side; never trust the client's idea of the task id.
    const data = await loadPortal(access, delivery.projectListId ?? undefined);
    const status = data.status[deliveryId];
    if (!status || status.kind !== "awaiting") return json({ error: "Nothing awaiting feedback" }, 409);

    await confirmFeedback({
      accessId: access.id,
      clientName: access.clientName,
      clientFolderId: access.clientFolderId,
      deliveryId,
      confirmedByName: typeof body.name === "string" ? body.name.trim().slice(0, 80) || null : null,
      feedbackDeadlineTaskId: status.feedbackDeadlineTaskId,
      deadlineLabel: status.dueLabel,
      portalUrl: `${getAppBaseUrl(req)}/portal/${token}`,
    });
    return json({ ok: true });
  } catch (err) {
    if (err instanceof PortalConfirmError) return json({ error: err.message }, err.status);
    console.error("portal confirm failed", deliveryId, err);
    return json({ error: "Could not save" }, 500);
  }
}
