import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { postChannelMessage } from "@/lib/slack-dm";

function slackJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe("postChannelMessage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const method = (i: number) => String(fetchMock.mock.calls[i][0]).split("/api/")[1];
  const body = (i: number) => JSON.parse(fetchMock.mock.calls[i][1].body as string);

  it("returns the ts on a direct post", async () => {
    fetchMock.mockResolvedValueOnce(slackJson({ ok: true, ts: "1.1" }));
    await expect(postChannelMessage("C1", "hello")).resolves.toBe("1.1");
    expect(method(0)).toBe("chat.postMessage");
    expect(body(0)).toMatchObject({ channel: "C1", text: "hello", unfurl_links: false });
  });

  it("threads when threadTs is given", async () => {
    fetchMock.mockResolvedValueOnce(slackJson({ ok: true, ts: "1.2" }));
    await postChannelMessage("C1", "reply", { threadTs: "1.1" });
    expect(body(0).thread_ts).toBe("1.1");
  });

  it("joins and retries on not_in_channel", async () => {
    fetchMock
      .mockResolvedValueOnce(slackJson({ ok: false, error: "not_in_channel" }))
      .mockResolvedValueOnce(slackJson({ ok: true }))
      .mockResolvedValueOnce(slackJson({ ok: true, ts: "2.2" }));
    await expect(postChannelMessage("C1", "hello")).resolves.toBe("2.2");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(method(1)).toBe("conversations.join");
    expect(method(2)).toBe("chat.postMessage");
  });

  it("returns null when the join is refused (missing_scope)", async () => {
    fetchMock
      .mockResolvedValueOnce(slackJson({ ok: false, error: "not_in_channel" }))
      .mockResolvedValueOnce(slackJson({ ok: false, error: "missing_scope" }));
    await expect(postChannelMessage("C1", "hello")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null on any other failure without retrying", async () => {
    fetchMock.mockResolvedValueOnce(slackJson({ ok: false, error: "channel_not_found" }));
    await expect(postChannelMessage("C1", "hello")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
