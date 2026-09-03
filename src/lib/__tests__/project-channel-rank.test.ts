import { describe, it, expect } from "vitest";
import { rankInternalChannels } from "@/lib/project-channel-rank";

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
});
