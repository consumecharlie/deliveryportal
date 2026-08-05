import { describe, it, expect } from "vitest";
import { rankChannels, type ChannelCandidate } from "@/lib/channel-suggest";

describe("rankChannels", () => {
  it("ranks channels sharing the client token above unrelated ones, shorter name first on ties", () => {
    const channels: ChannelCandidate[] = [
      { id: "1", name: "iterable-consume", isMember: true },
      { id: "2", name: "random-team", isMember: false },
      { id: "3", name: "iterable-old-project", isMember: false },
    ];
    const ranked = rankChannels("Iterable", [], channels);

    // Both iterable channels outrank random-team
    const names = ranked.map((c) => c.name);
    expect(names.indexOf("iterable-consume")).toBeLessThan(names.indexOf("random-team"));
    expect(names.indexOf("iterable-old-project")).toBeLessThan(names.indexOf("random-team"));

    // Among the two equal-score iterable channels, the shorter name comes first
    expect(names.indexOf("iterable-consume")).toBeLessThan(names.indexOf("iterable-old-project"));

    // random-team has no shared tokens -> score 0
    expect(ranked.find((c) => c.name === "random-team")!.score).toBe(0);
  });

  it("uses member overlap as the deciding factor between equal name scores", () => {
    const channels: ChannelCandidate[] = [
      // name score: shares "iterable" -> 2. No overlapping members.
      { id: "a", name: "iterable-alpha", isMember: true, memberNames: ["Someone Else"] },
      // name score: shares "iterable" -> 2. Overlap on "Dana" -> +1 = 3.
      { id: "b", name: "iterable-bravo", isMember: true, memberNames: ["Dana Smith"] },
    ];
    const ranked = rankChannels("Iterable", ["Dana Rivera"], channels);

    expect(ranked[0].name).toBe("iterable-bravo");
    expect(ranked[0].score).toBe(3);
    expect(ranked[1].name).toBe("iterable-alpha");
    expect(ranked[1].score).toBe(2);
  });

  it("ignores the 'consume' token when computing name score", () => {
    const channels: ChannelCandidate[] = [
      { id: "x", name: "consume-media", isMember: true },
    ];
    const ranked = rankChannels("Iterable", [], channels);
    expect(ranked[0].score).toBe(0);
  });

  it("returns empty for empty channels, and still ranks by name with empty contacts", () => {
    expect(rankChannels("Iterable", [], [])).toEqual([]);

    const channels: ChannelCandidate[] = [
      { id: "1", name: "iterable-consume", isMember: true },
      { id: "2", name: "random", isMember: false },
    ];
    const ranked = rankChannels("Iterable", [], channels);
    expect(ranked[0].name).toBe("iterable-consume");
    expect(ranked[0].score).toBe(2);
  });

  it("preserves every input channel with a numeric score", () => {
    const channels: ChannelCandidate[] = [
      { id: "1", name: "iterable-consume", isMember: true },
      { id: "2", name: "random-team", isMember: false },
      { id: "3", name: "iterable-old-project", isMember: false },
    ];
    const ranked = rankChannels("Iterable", ["Dana Rivera"], channels);
    expect(ranked).toHaveLength(channels.length);
    for (const c of ranked) {
      expect(typeof c.score).toBe("number");
    }
  });
});
