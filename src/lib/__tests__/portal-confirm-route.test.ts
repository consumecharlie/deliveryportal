import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { delivery: { findFirst: vi.fn() } } }));
vi.mock("@/lib/portal-data", () => ({
  resolveAccess: vi.fn(),
  loadPortal: vi.fn(),
  findPortalFeedbackTask: vi.fn(),
}));
vi.mock("@/lib/portal-confirm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portal-confirm")>()),
  confirmFeedback: vi.fn(),
  undoFeedback: vi.fn(),
  lastFeedbackActivity: vi.fn(),
  lastFeedbackTaskActivity: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { resolveAccess, loadPortal, findPortalFeedbackTask } from "@/lib/portal-data";
import {
  confirmFeedback,
  undoFeedback,
  lastFeedbackActivity,
  lastFeedbackTaskActivity,
  PortalConfirmError,
} from "@/lib/portal-confirm";
import { POST } from "@/app/api/portal/[token]/confirm/route";
import { POST as UNDO } from "@/app/api/portal/[token]/undo/route";

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

/** An item that stands on a ClickUp Feedback Deadline task alone. */
const taskTarget = {
  feedbackTaskId: "fd-9",
  projectListId: "list-9",
  projectName: "2026 Internal Explainer",
  title: "Spinoff Details",
  deadlineLabel: "Thu, Sep 10",
  awaiting: true,
};

function undo(body: unknown, token = "tok") {
  const req = new Request(`http://localhost/api/portal/${token}/undo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return UNDO(req, { params: Promise.resolve({ token }) });
}

describe("POST /api/portal/[token]/confirm with a feedbackTaskId", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(resolveAccess).mockResolvedValue(access);
    vi.mocked(findPortalFeedbackTask).mockResolvedValue(taskTarget);
    vi.mocked(lastFeedbackTaskActivity).mockResolvedValue(null);
    vi.mocked(confirmFeedback).mockResolvedValue({ id: "conf-9", clickupOk: true, slackOk: true });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("confirms the task, passing the resolved project and title, and never looks at a delivery", async () => {
    const res = await post({ feedbackTaskId: "fd-9", name: " Dana " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(findPortalFeedbackTask).toHaveBeenCalledWith(access, "fd-9");
    expect(prisma.delivery.findFirst).not.toHaveBeenCalled();
    expect(loadPortal).not.toHaveBeenCalled();
    expect(confirmFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        clientFolderId: "folder-1",
        task: {
          feedbackTaskId: "fd-9",
          projectListId: "list-9",
          projectName: "2026 Internal Explainer",
          title: "Spinoff Details",
        },
        confirmedByName: "Dana",
        feedbackDeadlineTaskId: "fd-9",
        deadlineLabel: "Thu, Sep 10",
        portalUrl: expect.stringMatching(/\/portal\/tok$/),
      })
    );
    expect(vi.mocked(confirmFeedback).mock.calls[0][0].deliveryId).toBeUndefined();
  });

  it("404s a task that is not in this token's projects", async () => {
    vi.mocked(findPortalFeedbackTask).mockResolvedValue(null);
    const res = await post({ feedbackTaskId: "someone-elses-task" });
    expect(res.status).toBe(404);
    expect(confirmFeedback).not.toHaveBeenCalled();
  });

  it("429s inside the double-click window", async () => {
    vi.mocked(lastFeedbackTaskActivity).mockResolvedValue(new Date(Date.now() - 2_000));
    expect((await post({ feedbackTaskId: "fd-9" })).status).toBe(429);
    expect(confirmFeedback).not.toHaveBeenCalled();
  });

  it("409s when the task is no longer asking the client for anything", async () => {
    vi.mocked(findPortalFeedbackTask).mockResolvedValue({ ...taskTarget, awaiting: false });
    const res = await post({ feedbackTaskId: "fd-9" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Nothing awaiting feedback");
    expect(confirmFeedback).not.toHaveBeenCalled();
  });

  it("400s when neither id is sent, and maps a PortalConfirmError", async () => {
    expect((await post({})).status).toBe(400);
    vi.mocked(confirmFeedback).mockRejectedValue(new PortalConfirmError("Nothing awaiting feedback", 409));
    expect((await post({ feedbackTaskId: "fd-9" })).status).toBe(409);
    vi.mocked(confirmFeedback).mockRejectedValue(new Error("db down"));
    expect((await post({ feedbackTaskId: "fd-9" })).status).toBe(500);
  });
});

describe("POST /api/portal/[token]/undo with a feedbackTaskId", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(resolveAccess).mockResolvedValue(access);
    vi.mocked(findPortalFeedbackTask).mockResolvedValue({ ...taskTarget, awaiting: false });
    vi.mocked(lastFeedbackTaskActivity).mockResolvedValue(null);
    vi.mocked(undoFeedback).mockResolvedValue({ id: "conf-9", clickupOk: true, slackOk: true });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("undoes a confirmed task item; a confirmed task is still in scope", async () => {
    const res = await undo({ feedbackTaskId: "fd-9" });
    expect(res.status).toBe(200);
    expect(undoFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        clientFolderId: "folder-1",
        feedbackTaskId: "fd-9",
        projectName: "2026 Internal Explainer",
      })
    );
  });

  it("404s a foreign task, 429s inside the guard, and 400s with no id", async () => {
    vi.mocked(findPortalFeedbackTask).mockResolvedValue(null);
    expect((await undo({ feedbackTaskId: "nope" })).status).toBe(404);
    vi.mocked(findPortalFeedbackTask).mockResolvedValue({ ...taskTarget, awaiting: false });
    vi.mocked(lastFeedbackTaskActivity).mockResolvedValue(new Date(Date.now() - 1_000));
    expect((await undo({ feedbackTaskId: "fd-9" })).status).toBe(429);
    expect((await undo({})).status).toBe(400);
    expect(undoFeedback).not.toHaveBeenCalled();
  });

  it("502 from the orchestrator reaches the client unchanged", async () => {
    vi.mocked(undoFeedback).mockRejectedValue(
      new PortalConfirmError("Could not reopen the feedback window, please try again", 502)
    );
    const res = await undo({ feedbackTaskId: "fd-9" });
    expect(res.status).toBe(502);
  });
});
