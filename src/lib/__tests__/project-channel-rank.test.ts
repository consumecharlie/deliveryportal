import { describe, it, expect } from "vitest";
import { rankInternalChannels, pickConfident } from "@/lib/project-channel-rank";

const ch = (name: string, shared = false) => ({ id: name, name, isShared: shared, isMember: false });

describe("rankInternalChannels", () => {
  it("prefers the channel whose tokens cover the project name", () => {
    const r = rankInternalChannels("CallRail Wiggam Law Virtual Testimonial", "CallRail", [
      ch("callrail-marketcrest-virtual-testimonial"),
      ch("callrail-wiggam-law-virtual-testimonial"),
      ch("callrail-virtualtestimonials-consume", true),
    ]);
    expect(r[0].name).toBe("callrail-wiggam-law-virtual-testimonial");
    expect(r[0].confident).toBe(true);
    expect(r[1].confident).toBe(false);
    expect(r.find((c) => c.name.endsWith("-consume"))).toBeUndefined();
  });

  it("uses the client name to break generic ties", () => {
    const r = rankInternalChannels("PebblePost SKO NextGen TL", "PebblePost", [
      ch("consume-nextgen-tl"),
      ch("pebblepost-sko-nextgen-tl"),
    ]);
    expect(r[0].name).toBe("pebblepost-sko-nextgen-tl");
  });

  it("is not confident on a weak match", () => {
    const r = rankInternalChannels("Iterable Brand Campaign", "Iterable", [ch("random-general")]);
    expect(r.length === 0 || r[0].confident === false).toBe(true);
  });

  it("is not confident when the project's own channel is missing and a sibling project matches", () => {
    // Same client, same deliverable type, different project: high coverage but
    // a token ("marketcrest") that belongs to neither the project nor the client.
    const r = rankInternalChannels("CallRail Wiggam Law Virtual Testimonial", "CallRail", [
      ch("callrail-marketcrest-virtual-testimonial"),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].confident).toBe(false);
    expect(pickConfident(r)).toBeNull();
  });

  it("demotes the top result when the runner-up is nearly as strong", () => {
    const r = rankInternalChannels("Acme Launch Video", "Acme", [
      ch("acme-launch-video"),
      ch("acme-launch-video-2"),
    ]);
    expect(r[0].name).toBe("acme-launch-video");
    expect(r[0].confident).toBe(true);
    // Both fully covered by the project name apart from "2", which is foreign,
    // so only the exact match can be confident.
    const tie = rankInternalChannels("Acme Launch Video", "Acme", [
      ch("acme-video-launch"),
      ch("acme-launch-video"),
    ]);
    expect(tie.every((c) => c.confident === false)).toBe(true);
    expect(pickConfident(tie)).toBeNull();
  });

  it("breaks exact score ties by name", () => {
    const r = rankInternalChannels("Acme Launch Video", "Acme", [
      ch("acme-video-launch"),
      ch("acme-launch-video"),
    ]);
    expect(r.map((c) => c.name)).toEqual(["acme-launch-video", "acme-video-launch"]);
  });
});

describe("pickConfident", () => {
  it("returns the top result only when it is confident", () => {
    const r = rankInternalChannels("CallRail Wiggam Law Virtual Testimonial", "CallRail", [
      ch("callrail-marketcrest-virtual-testimonial"),
      ch("callrail-wiggam-law-virtual-testimonial"),
    ]);
    expect(pickConfident(r)?.name).toBe("callrail-wiggam-law-virtual-testimonial");
    expect(pickConfident([])).toBeNull();
  });
});
