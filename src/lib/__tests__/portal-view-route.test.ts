import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { delivery: { findFirst: vi.fn() } } }));
vi.mock("@/lib/portal-data", () => ({ resolveAccess: vi.fn() }));
vi.mock("@/lib/portal-views", () => ({ recordView: vi.fn() }));

import { prisma } from "@/lib/db";
import { resolveAccess } from "@/lib/portal-data";
import { recordView } from "@/lib/portal-views";
import { POST } from "@/app/api/portal/[token]/view/route";
import { sendPortalView, resetPortalViewBeacons } from "@/lib/portal-view-beacon";

const access = { id: "a1", clientFolderId: "folder-1", clientName: "Acme", token: "tok" };
const DELIVERY = "clx0000000000000000000001";

function post(body: unknown, token = "tok") {
  const req = new Request(`http://localhost/api/portal/${token}/view`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "user-agent": "Mozilla/5.0 test" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ token }) });
}

describe("POST /api/portal/[token]/view", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(resolveAccess).mockResolvedValue(access);
    vi.mocked(prisma.delivery.findFirst).mockResolvedValue({ id: DELIVERY } as never);
    vi.mocked(recordView).mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("404s an unknown or revoked token without touching the database", async () => {
    vi.mocked(resolveAccess).mockResolvedValue(null);
    const res = await post({ deliveryId: DELIVERY });
    expect(res.status).toBe(404);
    expect(prisma.delivery.findFirst).not.toHaveBeenCalled();
    expect(recordView).not.toHaveBeenCalled();
  });

  it("400s a missing or malformed delivery id", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post("not json")).status).toBe(400);
    expect((await post({ deliveryId: "../etc" })).status).toBe(400);
    expect((await post({ deliveryId: 42 })).status).toBe(400);
    expect(prisma.delivery.findFirst).not.toHaveBeenCalled();
  });

  it("404s a delivery that is not inside this client's folder", async () => {
    vi.mocked(prisma.delivery.findFirst).mockResolvedValue(null);
    const res = await post({ deliveryId: DELIVERY });
    expect(res.status).toBe(404);
    expect(prisma.delivery.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: DELIVERY, clientFolderId: "folder-1" } })
    );
    expect(recordView).not.toHaveBeenCalled();
  });

  it("records the view for an owned delivery", async () => {
    const res = await post({ deliveryId: DELIVERY });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true });
    expect(recordView).toHaveBeenCalledWith("a1", DELIVERY, "Mozilla/5.0 test");
  });

  it("still answers ok when the ownership lookup throws", async () => {
    vi.mocked(prisma.delivery.findFirst).mockRejectedValue(new Error("db down"));
    const res = await post({ deliveryId: DELIVERY });
    expect(res.status).toBe(200);
    expect(recordView).not.toHaveBeenCalled();
  });
});

describe("sendPortalView", () => {
  beforeEach(() => resetPortalViewBeacons());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("uses sendBeacon once per delivery per page load", () => {
    const sendBeacon = vi.fn<(url: string, data?: BodyInit) => boolean>(() => true);
    vi.stubGlobal("navigator", { sendBeacon });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    sendPortalView("tok", "d1");
    sendPortalView("tok", "d1");
    sendPortalView("tok", "d2");
    expect(sendBeacon).toHaveBeenCalledTimes(2);
    expect(sendBeacon.mock.calls[0][0]).toBe("/api/portal/tok/view");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to a keepalive fetch when sendBeacon is unavailable or refuses", () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("navigator", {});
    sendPortalView("tok", "d1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/portal/tok/view",
      expect.objectContaining({ method: "POST", keepalive: true, body: JSON.stringify({ deliveryId: "d1" }) })
    );

    vi.stubGlobal("navigator", { sendBeacon: vi.fn(() => false) });
    sendPortalView("tok", "d2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
