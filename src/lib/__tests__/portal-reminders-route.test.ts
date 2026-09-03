import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    portalAccess: { findMany: vi.fn() },
    portalReminder: { create: vi.fn(), deleteMany: vi.fn() },
    delivery: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/portal-data", () => ({ loadPortal: vi.fn() }));
vi.mock("@/lib/project-channel", () => ({ resolveProjectChannel: vi.fn() }));
vi.mock("@/lib/slack-dm", () => ({ postChannelMessage: vi.fn(), sendSlackDM: vi.fn() }));

import { prisma } from "@/lib/db";
import { loadPortal } from "@/lib/portal-data";
import { resolveProjectChannel } from "@/lib/project-channel";
import { postChannelMessage, sendSlackDM } from "@/lib/slack-dm";
import { dateOnlySentinelMs } from "@/lib/portal-deadline";
import { GET } from "@/app/api/cron/portal-reminders/route";

// Thu Sep 10 2026, 9:00 AM ET.
const NOW = Date.parse("2026-09-10T13:00:00Z");
const SENT_ON = "2026-09-10";
const access = { id: "a1", clientFolderId: "folder-1", clientName: "Acme & Co", token: "tok" };

function item(id: string, due: string, state: "due-today" | "overdue" | "open", listId: string | null = "list-1") {
  return {
    entry: { id, projectListId: listId, deliverableType: "Rough <Cut>", sentAt: new Date("2026-09-01T15:00:00Z") },
    projectName: "Spring Launch",
    status: { dueMs: dateOnlySentinelMs(due), state, dueLabel: `Due ${due}`, kind: "awaiting" },
  };
}

const dueToday = item("d-today", "2026-09-10", "due-today");
const overdue = item("d-late", "2026-09-09", "overdue");

function run(query = "") {
  const req = new Request(`http://localhost/api/cron/portal-reminders${query}`, {
    headers: { Authorization: "Bearer test-secret" },
  });
  return GET(req);
}

function p2002() {
  return new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" });
}

describe("GET /api/cron/portal-reminders", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("CRON_SECRET", "test-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://portal.example.com");
    vi.stubEnv("N8N_PORTAL_REMINDER_WEBHOOK_URL", "https://n8n.example.com/hook");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});

    vi.mocked(prisma.portalAccess.findMany).mockResolvedValue([access] as never);
    vi.mocked(prisma.portalReminder.create).mockResolvedValue({ id: "r1" } as never);
    vi.mocked(prisma.portalReminder.deleteMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.delivery.findUnique).mockResolvedValue({
      id: "x",
      primaryEmail: "dana@acme.com",
      ccEmails: "cc@acme.com",
      senderEmail: "pm@consume-media.com",
      emailContent: "Hi Dana,\n\nHere is the cut.",
    } as never);
    vi.mocked(loadPortal).mockResolvedValue({ actionItems: [dueToday] } as never);
    vi.mocked(resolveProjectChannel).mockResolvedValue({
      channelId: "C1",
      channelName: "acme-spring",
      source: "confirmed",
      autoMatched: false,
      suggestions: [],
    });
    vi.mocked(postChannelMessage).mockResolvedValue("171.1");
    vi.mocked(sendSlackDM).mockResolvedValue(true);
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("401s without the cron secret", async () => {
    const res = await GET(new Request("http://localhost/api/cron/portal-reminders"));
    expect(res.status).toBe(401);
    expect(loadPortal).not.toHaveBeenCalled();
  });

  it("emails a due-today item: claims the slot, posts the webhook payload, greets by the delivery's salutation", async () => {
    const res = await run();
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, dryRun: false, accesses: 1, emailed: 1, nudged: 0, skipped: 0 });
    expect(prisma.portalReminder.create).toHaveBeenCalledWith({
      data: { deliveryId: "d-today", kind: "today", sentOn: SENT_ON },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://n8n.example.com/hook");
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload).toMatchObject({
      to: "dana@acme.com",
      cc: "cc@acme.com",
      from: "pm@consume-media.com",
      subject: "Reminder: feedback on Rough <Cut> is due today",
      portal_url: "https://portal.example.com/portal/tok/list-1",
      delivery_id: "d-today",
      kind: "today",
    });
    expect(payload.text).toContain("Hi Dana,");
    expect(prisma.portalReminder.deleteMany).not.toHaveBeenCalled();
  });

  it("with the webhook env unset, writes no PortalReminder rows and still returns a summary", async () => {
    vi.stubEnv("N8N_PORTAL_REMINDER_WEBHOOK_URL", "");
    const res = await run();
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, emailed: 0, skipped: 1 });
    expect(body.items[0]).toMatchObject({ kind: "today", result: "skipped", reason: "webhook not configured" });
    expect(prisma.portalReminder.create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith("N8N_PORTAL_REMINDER_WEBHOOK_URL not set; skipping");
  });

  it("releases the claim when the webhook fails", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    const body = await (await run()).json();
    expect(body).toMatchObject({ emailed: 0, skipped: 1 });
    expect(body.items[0].reason).toBe("webhook call failed");
    expect(prisma.portalReminder.deleteMany).toHaveBeenCalledWith({
      where: { deliveryId: "d-today", kind: "today", sentOn: SENT_ON },
    });
  });

  it("skips an item already sent today (P2002 on claim) without sending", async () => {
    vi.mocked(prisma.portalReminder.create).mockRejectedValue(p2002());
    const body = await (await run()).json();
    expect(body).toMatchObject({ emailed: 0, skipped: 1 });
    expect(body.items[0]).toMatchObject({ result: "skipped", reason: "already sent today" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.portalReminder.deleteMany).not.toHaveBeenCalled();
  });

  it("dryRun=1 classifies without creating rows or sending", async () => {
    vi.mocked(loadPortal).mockResolvedValue({ actionItems: [dueToday, overdue] } as never);
    const body = await (await run("?dryRun=1")).json();
    expect(body).toMatchObject({ ok: true, dryRun: true, accesses: 1, emailed: 1, nudged: 1, skipped: 0 });
    expect(body.items.map((i: { result: string }) => i.result)).toEqual(["would-send", "would-send"]);
    expect(prisma.portalReminder.create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(postChannelMessage).not.toHaveBeenCalled();
    expect(sendSlackDM).not.toHaveBeenCalled();
  });

  it("nudges the internal channel for an overdue item with escaped text and records the row", async () => {
    vi.mocked(loadPortal).mockResolvedValue({ actionItems: [overdue] } as never);
    const body = await (await run()).json();
    expect(body).toMatchObject({ emailed: 0, nudged: 1, skipped: 0 });
    expect(resolveProjectChannel).toHaveBeenCalledWith("list-1", "Spring Launch", "Acme & Co");
    expect(postChannelMessage).toHaveBeenCalledWith(
      "C1",
      ":hourglass: Acme &amp; Co has not confirmed feedback on Rough &lt;Cut&gt; (Spring Launch). Due Due 2026-09-09. <https://portal.example.com/portal/tok/list-1|Open client portal>"
    );
    expect(sendSlackDM).not.toHaveBeenCalled();
    expect(prisma.portalReminder.create).toHaveBeenCalledWith({
      data: { deliveryId: "d-late", kind: "overdue", sentOn: SENT_ON },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to a DM when no channel is mapped, and releases the claim when both fail", async () => {
    vi.mocked(loadPortal).mockResolvedValue({ actionItems: [overdue] } as never);
    vi.mocked(resolveProjectChannel).mockResolvedValue({
      channelId: null,
      channelName: null,
      source: "none",
      autoMatched: false,
      suggestions: [],
    });
    let body = await (await run()).json();
    expect(body.nudged).toBe(1);
    expect(sendSlackDM).toHaveBeenCalledWith("pm@consume-media.com", expect.stringContaining(":hourglass:"));

    vi.mocked(sendSlackDM).mockResolvedValue(false);
    body = await (await run()).json();
    expect(body).toMatchObject({ nudged: 0, skipped: 1 });
    expect(prisma.portalReminder.deleteMany).toHaveBeenCalledWith({
      where: { deliveryId: "d-late", kind: "overdue", sentOn: SENT_ON },
    });
  });

  it("skips a Slack-only delivery (no primary email) without claiming", async () => {
    vi.mocked(prisma.delivery.findUnique).mockResolvedValue({
      id: "x",
      primaryEmail: "",
      ccEmails: null,
      senderEmail: "pm@consume-media.com",
      emailContent: "",
    } as never);
    const body = await (await run()).json();
    expect(body).toMatchObject({ emailed: 0, skipped: 1 });
    expect(body.items[0].reason).toContain("no primary email");
    expect(prisma.portalReminder.create).not.toHaveBeenCalled();
  });

  it("isolates a failing item so the rest still send", async () => {
    const second = item("d-today-2", "2026-09-10", "due-today");
    vi.mocked(loadPortal).mockResolvedValue({ actionItems: [dueToday, second] } as never);
    vi.mocked(prisma.delivery.findUnique)
      .mockRejectedValueOnce(new Error("db hiccup"))
      .mockResolvedValueOnce({
        id: "x",
        primaryEmail: "dana@acme.com",
        ccEmails: null,
        senderEmail: "pm@consume-media.com",
        emailContent: "",
      } as never);
    const body = await (await run()).json();
    expect(body).toMatchObject({ ok: true, emailed: 1, skipped: 1 });
    expect(body.items[0]).toMatchObject({ result: "skipped", reason: "unexpected error" });
    expect(body.items[1]).toMatchObject({ result: "sent" });
  });

  it("isolates a failing access so the next one still runs", async () => {
    vi.mocked(prisma.portalAccess.findMany).mockResolvedValue([{ ...access, id: "bad" }, access] as never);
    vi.mocked(loadPortal)
      .mockRejectedValueOnce(new Error("clickup down"))
      .mockResolvedValueOnce({ actionItems: [dueToday] } as never);
    const body = await (await run()).json();
    expect(body).toMatchObject({ ok: true, accesses: 2, emailed: 1, skipped: 1 });
  });
});
