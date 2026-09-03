import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  createOrRotateAccess,
  buildPortalUrl,
  maskPortalToken,
} from "@/lib/portal-access";
import { getAppBaseUrl } from "@/lib/app-base-url";

function mockDb() {
  const calls: string[] = [];
  const updateMany = vi.fn(async () => {
    calls.push("updateMany");
    return { count: 1 };
  });
  const create = vi.fn(async (args: { data: Record<string, unknown> }) => {
    calls.push("create");
    return {
      id: "new-id",
      createdAt: new Date("2026-09-03T12:00:00Z"),
      revokedAt: null,
      ...args.data,
    };
  });
  const tx = { portalAccess: { updateMany, create } };
  const $transaction = vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
    calls.push("tx:start");
    const out = await fn(tx);
    calls.push("tx:end");
    return out;
  });
  const db = { $transaction, portalAccess: tx.portalAccess } as unknown as PrismaClient;
  return { db, calls, updateMany, create, $transaction };
}

describe("createOrRotateAccess", () => {
  it("revokes active rows before creating, inside one transaction", async () => {
    const { db, calls, updateMany, create, $transaction } = mockDb();
    const row = await createOrRotateAccess(db, {
      clientFolderId: "folder-1",
      clientName: "CallRail",
      createdBy: "michael@consume-media.com",
    });

    expect($transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["tx:start", "updateMany", "create", "tx:end"]);

    expect(updateMany).toHaveBeenCalledWith({
      where: { clientFolderId: "folder-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    const createArgs = create.mock.calls[0][0];
    expect(createArgs.data).toMatchObject({
      clientFolderId: "folder-1",
      clientName: "CallRail",
      createdBy: "michael@consume-media.com",
    });
    expect(createArgs.data.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(row.id).toBe("new-id");
    expect(row.token).toBe(createArgs.data.token);
  });

  it("trims inputs and rejects blanks without opening a transaction", async () => {
    const { db, $transaction, create } = mockDb();
    await expect(
      createOrRotateAccess(db, { clientFolderId: "  ", clientName: "X", createdBy: "u" })
    ).rejects.toThrow(/required/);
    expect($transaction).not.toHaveBeenCalled();

    await createOrRotateAccess(db, {
      clientFolderId: " f2 ",
      clientName: " Acme ",
      createdBy: "u",
    });
    expect(create.mock.calls[0][0].data).toMatchObject({
      clientFolderId: "f2",
      clientName: "Acme",
    });
  });

  it("generates a distinct token per call", async () => {
    const { db, create } = mockDb();
    await createOrRotateAccess(db, { clientFolderId: "f", clientName: "A", createdBy: "u" });
    await createOrRotateAccess(db, { clientFolderId: "f", clientName: "A", createdBy: "u" });
    expect(create.mock.calls[0][0].data.token).not.toBe(create.mock.calls[1][0].data.token);
  });
});

describe("buildPortalUrl", () => {
  it("builds the client root link and the project deep link", () => {
    expect(buildPortalUrl("https://app.example.com", "tok")).toBe(
      "https://app.example.com/portal/tok"
    );
    expect(buildPortalUrl("https://app.example.com/", "tok", "901")).toBe(
      "https://app.example.com/portal/tok/901"
    );
    expect(buildPortalUrl("https://app.example.com", "tok", null)).toBe(
      "https://app.example.com/portal/tok"
    );
  });
});

describe("maskPortalToken", () => {
  it("shows only the first and last four characters", () => {
    expect(maskPortalToken("abcd0123456789wxyz")).toBe("…/portal/abcd…wxyz");
  });
});

describe("getAppBaseUrl", () => {
  const req = new Request("https://preview.example.com/api/deliveries/1");

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("VERCEL_URL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("prefers a non-empty NEXT_PUBLIC_APP_URL, else the request origin", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://portal.example.com/");
    expect(getAppBaseUrl(req)).toBe("https://portal.example.com");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(getAppBaseUrl(req)).toBe("https://preview.example.com");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "   ");
    expect(getAppBaseUrl(req)).toBe("https://preview.example.com");
  });

  it("falls back to NEXTAUTH_URL, then VERCEL_URL, before the request", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://auth.example.com/");
    vi.stubEnv("VERCEL_URL", "deploy-abc.vercel.app");
    expect(getAppBaseUrl(req)).toBe("https://auth.example.com");
    vi.stubEnv("NEXTAUTH_URL", "");
    expect(getAppBaseUrl(req)).toBe("https://deploy-abc.vercel.app");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://portal.example.com");
    expect(getAppBaseUrl(req)).toBe("https://portal.example.com");
  });

  it("gives a bare host an https scheme and keeps an explicit http one", () => {
    vi.stubEnv("NEXTAUTH_URL", "auth.example.com/");
    expect(getAppBaseUrl(req)).toBe("https://auth.example.com");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    expect(getAppBaseUrl(req)).toBe("http://localhost:3000");
  });

  it("honours x-forwarded-proto and host on the request when no env is set", () => {
    const forwarded = new Request("http://internal:3000/api/cron/portal-reminders", {
      headers: { "x-forwarded-proto": "https", host: "portal.example.com" },
    });
    expect(getAppBaseUrl(forwarded)).toBe("https://portal.example.com");
    expect(getAppBaseUrl(new Request("http://internal:3000/x", { headers: { host: "only-host" } }))).toBe(
      "http://internal:3000"
    );
  });

  it("returns an empty string with no env, no request and no window", () => {
    expect(getAppBaseUrl()).toBe("");
  });
});
