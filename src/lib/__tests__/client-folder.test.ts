import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveClientFolderId } from "@/lib/clickup";

// resolveClientFolderId calls getList inside the same module, so a partial
// vi.mock of the export would not intercept it. Stub global fetch instead,
// which exercises the real getList path end to end.
function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("resolveClientFolderId", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("CLICKUP_API_TOKEN", "test-token");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns the folder id for a list inside a real folder", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: "list-1", name: "Project A", folder: { id: "folder-1", name: "Client A" } })
    );
    await expect(resolveClientFolderId("list-1")).resolves.toBe("folder-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/list/list-1");
  });

  it("returns null for a folderless list (ClickUp reports a hidden phantom folder)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: "list-2", name: "Loose", folder: { id: "phantom", name: "hidden", hidden: true } })
    );
    await expect(resolveClientFolderId("list-2")).resolves.toBeNull();
  });

  it("returns null and does not propagate when getList throws", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ err: "nope" }, false, 500));
    await expect(resolveClientFolderId("list-3")).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalled();

    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(resolveClientFolderId("list-4")).resolves.toBeNull();
  });

  it("returns null for an empty or undefined listId without calling getList", async () => {
    await expect(resolveClientFolderId("")).resolves.toBeNull();
    await expect(resolveClientFolderId(undefined)).resolves.toBeNull();
    await expect(resolveClientFolderId(null)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
