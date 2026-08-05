import { afterEach, describe, expect, it, vi } from "vitest";
import { getOurTeamId, listChannelPeople } from "@/lib/slack-audit";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown) {
  return { json: async () => body } as unknown as Response;
}

describe("listChannelPeople", () => {
  it("maps members + users.info into ChannelPerson[]", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/conversations.members")) {
        return jsonResponse({ ok: true, members: ["U1", "U2"] });
      }
      if (url.includes("/users.info?user=U1")) {
        return jsonResponse({
          ok: true,
          user: {
            name: "emily",
            team_id: "T123",
            is_bot: false,
            profile: { real_name: "Emily Gardiner", email: "emily@example.com" },
          },
        });
      }
      if (url.includes("/users.info?user=U2")) {
        return jsonResponse({
          ok: true,
          user: {
            name: "botname",
            team_id: "T123",
            is_bot: true,
            profile: {},
          },
        });
      }
      return jsonResponse({ ok: false });
    });
    vi.stubGlobal("fetch", fetchMock);

    const people = await listChannelPeople("C1");

    expect(people).toEqual([
      {
        userId: "U1",
        name: "Emily Gardiner",
        email: "emily@example.com",
        teamId: "T123",
        isBot: false,
      },
      {
        userId: "U2",
        name: "botname",
        email: undefined,
        teamId: "T123",
        isBot: true,
      },
    ]);
  });
});

describe("getOurTeamId", () => {
  it("returns team_id when ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true, team_id: "T999" })),
    );
    expect(await getOurTeamId()).toBe("T999");
  });

  it("returns null on error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "invalid_auth" })),
    );
    expect(await getOurTeamId()).toBeNull();
  });
});
