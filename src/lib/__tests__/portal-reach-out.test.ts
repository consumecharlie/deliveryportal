import { describe, it, expect } from "vitest";
import {
  validateReachOut,
  buildReachOutText,
  REACH_OUT_NAME_MAX,
  REACH_OUT_MESSAGE_MAX,
} from "@/lib/portal-reach-out";

describe("validateReachOut", () => {
  it("trims fields and normalises line endings", () => {
    const r = validateReachOut({ name: "  Dana ", message: " Hello\r\nthere ", listId: " list-1 " });
    expect(r).toEqual({ ok: true, value: { name: "Dana", message: "Hello\nthere", listId: "list-1" } });
  });

  it("rejects a missing name or message", () => {
    expect(validateReachOut({ message: "hi" })).toEqual({ ok: false, error: "Please add your name" });
    expect(validateReachOut({ name: "Dana", message: "   " })).toEqual({ ok: false, error: "Please write a message" });
    expect(validateReachOut(null).ok).toBe(false);
    expect(validateReachOut("junk").ok).toBe(false);
  });

  it("caps name and message length", () => {
    expect(validateReachOut({ name: "x".repeat(REACH_OUT_NAME_MAX + 1), message: "hi" }).ok).toBe(false);
    expect(validateReachOut({ name: "Dana", message: "x".repeat(REACH_OUT_MESSAGE_MAX + 1) }).ok).toBe(false);
    expect(validateReachOut({ name: "x".repeat(REACH_OUT_NAME_MAX), message: "x".repeat(REACH_OUT_MESSAGE_MAX) }).ok).toBe(true);
  });

  it("treats a blank listId as none and rejects an odd one", () => {
    const r = validateReachOut({ name: "Dana", message: "hi", listId: "" });
    expect(r.ok && r.value.listId).toBeNull();
    expect(validateReachOut({ name: "Dana", message: "hi", listId: "../x" })).toEqual({ ok: false, error: "Invalid project" });
  });
});

describe("buildReachOutText", () => {
  it("escapes every field and quotes each line of the message", () => {
    const text = buildReachOutText({
      clientName: "Acme & Co",
      name: "Dana <PM>",
      message: "Can we move the call?\nAlso: love the cut > version 2",
      portalUrl: "https://portal.example.com/portal/tok/list-1",
    });
    expect(text).toBe(
      [
        ":speech_balloon: Message from Acme &amp; Co via the client portal (Dana &lt;PM&gt;):",
        "> Can we move the call?",
        "> Also: love the cut &gt; version 2",
        "<https://portal.example.com/portal/tok/list-1|Open client portal>",
      ].join("\n")
    );
  });
});
