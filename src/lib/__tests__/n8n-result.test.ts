import { describe, it, expect } from "vitest";
import { interpretN8nResponse, isFailedSend } from "@/lib/n8n-result";

describe("interpretN8nResponse", () => {
  it("recognizes a real Gmail draft", () => {
    // Exact shape returned by Landon's successful draft on 2026-09-08.
    const body = {
      id: "r-5505990870206496936",
      message: { id: "1a082a2210761141", threadId: "1a082a2210761141", labelIds: ["DRAFT"] },
    };
    expect(interpretN8nResponse(body, false)).toEqual({ status: "drafted" });
  });

  it("catches the expired-credential failure that started all this", () => {
    // Exact shape from Tony's Shepard NGAUS send, execution 11127.
    const body = { error: 'The credential "Tony\'s Gmail account" needs to be reconnected. (item 0)' };
    expect(interpretN8nResponse(body, false)).toEqual({
      status: "failed",
      detail: 'The credential "Tony\'s Gmail account" needs to be reconnected. (item 0)',
    });
  });

  it("treats n8n's immediate ack as pending, never as a failure", () => {
    // While the webhook still responds onReceived, we cannot know the outcome.
    // Reporting that as failed would cry wolf on every send.
    expect(interpretN8nResponse({ message: "Workflow was started" }, false)).toEqual({
      status: "pending",
    });
    expect(interpretN8nResponse({ message: "Workflow was started" }, true)).toEqual({
      status: "pending",
    });
  });

  it("unwraps n8n's array-of-items responses", () => {
    const body = [{ id: "r-1", message: { id: "abc", labelIds: ["DRAFT"] } }];
    expect(interpretN8nResponse(body, false)).toEqual({ status: "drafted" });
  });

  it("recognizes a posted Slack message", () => {
    expect(interpretN8nResponse({ ok: true, ts: "1725900000.123" }, true)).toEqual({
      status: "slack_posted",
    });
  });

  it("reports a Slack error as failed", () => {
    expect(interpretN8nResponse({ error: "channel_not_found" }, true)).toEqual({
      status: "failed",
      detail: "channel_not_found",
    });
  });

  it.each([null, undefined, "", 42, {}, { something: "else" }])(
    "falls back to unknown for %p rather than guessing",
    (body) => {
      expect(interpretN8nResponse(body, false).status).toBe("unknown");
    }
  );

  it("only flags an outright failure", () => {
    expect(isFailedSend("failed")).toBe(true);
    // Stored rows carry the detail alongside the status.
    expect(isFailedSend('failed: The credential "Tony\'s Gmail account" needs to be reconnected.')).toBe(true);
    // Legacy value the Sent table already looked for.
    expect(isFailedSend("error")).toBe(true);
    for (const s of ["drafted", "slack_posted", "pending", "unknown", null, undefined]) {
      expect(isFailedSend(s)).toBe(false);
    }
  });
});
