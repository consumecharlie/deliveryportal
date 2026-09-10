import { NextResponse } from "next/server";
import { resolveAccess, findPortalFeedbackTask } from "@/lib/portal-data";
import {
  undoFeedback,
  lastFeedbackActivity,
  lastFeedbackTaskActivity,
  PortalConfirmError,
} from "@/lib/portal-confirm";
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
  const body = (await req.json().catch(() => ({}))) as {
    deliveryId?: string;
    feedbackTaskId?: string;
  };
  const deliveryId = typeof body.deliveryId === "string" ? body.deliveryId : "";
  const feedbackTaskId = typeof body.feedbackTaskId === "string" ? body.feedbackTaskId : "";
  if (!deliveryId && !feedbackTaskId) {
    return json({ error: "deliveryId or feedbackTaskId required" }, 400);
  }
  const portalUrl = `${getAppBaseUrl(req)}/portal/${token}`;

  // An item with no delivery behind it: the task must belong to one of this
  // token's own projects, exactly as strict as the delivery path.
  if (!deliveryId) {
    try {
      const target = await findPortalFeedbackTask(access, feedbackTaskId);
      if (!target) return json({ error: "Not found" }, 404);
      if (isDoubleClick(await lastFeedbackTaskActivity(feedbackTaskId), Date.now())) {
        return json({ error: "Please wait a moment before trying again" }, 429);
      }
      await undoFeedback({
        clientFolderId: access.clientFolderId,
        clientName: access.clientName,
        feedbackTaskId,
        projectName: target.projectName,
        portalUrl,
      });
      return json({ ok: true });
    } catch (err) {
      if (err instanceof PortalConfirmError) return json({ error: err.message }, err.status);
      console.error("portal undo failed", feedbackTaskId, err);
      return json({ error: "Could not save" }, 500);
    }
  }

  try {
    if (isDoubleClick(await lastFeedbackActivity(deliveryId, access.clientFolderId), Date.now())) {
      return json({ error: "Please wait a moment before trying again" }, 429);
    }
    await undoFeedback({
      clientFolderId: access.clientFolderId,
      clientName: access.clientName,
      deliveryId,
      portalUrl,
    });
    return json({ ok: true });
  } catch (err) {
    if (err instanceof PortalConfirmError) return json({ error: err.message }, err.status);
    console.error("portal undo failed", deliveryId, err);
    return json({ error: "Could not save" }, 500);
  }
}
