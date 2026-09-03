import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTaskComment, buildStructuredCommentBody, buildTextCommentBody } from "@/lib/clickup";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const members = [
  { id: 1, username: "Ann PM" },
  { id: 2, username: "Bob PM" },
];

describe("createTaskComment", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("CLICKUP_API_TOKEN", "test-token");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("builds tag chunks per member followed by the text", () => {
    const body = buildStructuredCommentBody({ text: "hi", mentions: members, groupAssignee: "g1" });
    expect(body.comment).toEqual([
      { type: "tag", user: { id: 1 } },
      { text: " " },
      { type: "tag", user: { id: 2 } },
      { text: " " },
      { text: "hi" },
    ]);
    expect(body.group_assignee).toBe("g1");
    expect(body.notify_all).toBe(true);
  });

  it("text fallback prefixes @username per member and assigns the first", () => {
    const body = buildTextCommentBody({ text: "hi", mentions: members });
    expect(body.comment_text).toBe("@Ann PM @Bob PM hi");
    expect(body.assignee).toBe(1);
  });

  it("posts the structured body and stops there on success", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "c1" }));
    await expect(createTaskComment("t1", { text: "hi", mentions: members })).resolves.toEqual({ id: "c1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.comment[0]).toEqual({ type: "tag", user: { id: 1 } });
  });

  it("retries with comment_text when the structured body gets a 4xx", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ err: "bad" }, false, 400))
      .mockResolvedValueOnce(jsonResponse({ id: "c2" }));
    await expect(createTaskComment("t1", { text: "hi", mentions: members })).resolves.toEqual({ id: "c2" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sent = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(sent.comment_text).toBe("@Ann PM @Bob PM hi");
    expect(sent.assignee).toBe(1);
  });

  it("does not retry on a 5xx", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ err: "down" }, false, 502));
    await expect(createTaskComment("t1", { text: "hi", mentions: members })).rejects.toThrow("502");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
