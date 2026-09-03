import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { delivery: { findFirst: vi.fn() } } }));
vi.mock("@/lib/portal-data", () => ({ resolveAccess: vi.fn(), loadPortal: vi.fn() }));
vi.mock("@/lib/portal-confirm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portal-confirm")>()),
  confirmFeedback: vi.fn(),
  lastFeedbackActivity: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { resolveAccess, loadPortal } from "@/lib/portal-data";
import { confirmFeedback, lastFeedbackActivity, PortalConfirmError } from "@/lib/portal-confirm";
import { POST } from "@/app/api/portal/[token]/confirm/route";

const access = { id: "a1", clientFolderId: "folder-1", clientName: "Acme", token: "tok" };
const awaiting = {
  kind: "awaiting",
  dueMs: 0,
  dueLabel: "Tue, Sep 9",
  source: "live",
  dueIsEstimate: false,
  state: "upcoming",
  feedbackDeadlineTaskId: "task-1",
  confirmedAt: null,
  confirmedByName: null,
};

function post(body: unknown, token = "tok") {
  const req = new Request(`http://localhost/api/portal/${token}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ token }) });
}

describe("POST /api/portal/[token]/confirm", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(resolveAccess).mockResolvedValue(access);
    vi.mocked(prisma.delivery.findFirst).mockResolvedValue({ projectListId: "list-1" } as never);
    vi.mocked(lastFeedbackActivity).mockResolvedValue(null);
    vi.mocked(loadPortal).mockResolvedValue({ status: { d1: awaiting } } as never);
    vi.mocked(confirmFeedback).mockResolvedValue({ id: "conf-1", clickupOk: true, slackOk: true });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("404s an unknown or revoked token", async () => {
    vi.mocked(resolveAccess).mockResolvedValue(null);
    const res = await post({ deliveryId: "d1" });
    expect(res.status).toBe(404);
    expect(confirmFeedback).not.toHaveBeenCalled();
  });

  it("400s without a deliveryId (including a malformed body)", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post("not json")).status).toBe(400);
  });

  it("404s a delivery outside this client's folder", async () => {
    vi.mocked(prisma.delivery.findFirst).mockResolvedValue(null);
    const res = await post({ deliveryId: "d1" });
    expect(res.status).toBe(404);
    const where = vi.mocked(prisma.delivery.findFirst).mock.calls[0][0]?.where;
    expect(where).toEqual({ id: "d1", clientFolderId: "folder-1" });
  });

  it("429s inside the double-click window", async () => {
    vi.mocked(lastFeedbackActivity).mockResolvedValue(new Date(Date.now() - 2_000));
    expect((await post({ deliveryId: "d1" })).status).toBe(429);
    expect(confirmFeedback).not.toHaveBeenCalled();
  });

  it("409s when nothing is awaiting feedback", async () => {
    vi.mocked(loadPortal).mockResolvedValue({ status: { d1: { ...awaiting, kind: "confirmed" } } } as never);
    expect((await post({ deliveryId: "d1" })).status).toBe(409);
    vi.mocked(loadPortal).mockResolvedValue({ status: {} } as never);
    expect((await post({ deliveryId: "d1" })).status).toBe(409);
  });

  it("maps a PortalConfirmError to its status", async () => {
    vi.mocked(confirmFeedback).mockRejectedValue(new PortalConfirmError("Nothing awaiting feedback", 409));
    const res = await post({ deliveryId: "d1" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Nothing awaiting feedback");
  });

  it("500s on an unexpected error", async () => {
    vi.mocked(confirmFeedback).mockRejectedValue(new Error("db down"));
    expect((await post({ deliveryId: "d1" })).status).toBe(500);
  });

  it("confirms with server-side status, trimmed name, and no-store", async () => {
    const res = await post({ deliveryId: "d1", name: "  Dana  " });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true });
    expect(loadPortal).toHaveBeenCalledWith(access, "list-1");
    expect(confirmFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        clientFolderId: "folder-1",
        deliveryId: "d1",
        confirmedByName: "Dana",
        feedbackDeadlineTaskId: "task-1",
        deadlineLabel: "Tue, Sep 9",
        portalUrl: expect.stringMatching(/\/portal\/tok$/),
      })
    );
  });

  it("stores a null name when none is sent", async () => {
    await post({ deliveryId: "d1" });
    expect(vi.mocked(confirmFeedback).mock.calls[0][0].confirmedByName).toBeNull();
  });
});
