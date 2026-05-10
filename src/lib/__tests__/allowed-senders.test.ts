import { describe, it, expect } from "vitest";
import { filterMembersByAllowlist, type WorkspaceMember } from "../allowed-senders";

const members: WorkspaceMember[] = [
  { id: 1, username: "alice", email: "alice@x.com", profilePicture: undefined, initials: "A" },
  { id: 2, username: "bob", email: "bob@x.com", profilePicture: undefined, initials: "B" },
  { id: 3, username: "carol", email: "carol@x.com", profilePicture: undefined, initials: "C" },
];

describe("filterMembersByAllowlist", () => {
  it("returns only members whose id is in the allowlist", () => {
    const result = filterMembersByAllowlist(members, new Set([1, 3]));
    expect(result.map((m) => m.username)).toEqual(["alice", "carol"]);
  });

  it("returns an empty array when the allowlist is empty", () => {
    expect(filterMembersByAllowlist(members, new Set())).toEqual([]);
  });

  it("ignores allowlist ids that are no longer in the workspace", () => {
    const result = filterMembersByAllowlist(members, new Set([1, 999]));
    expect(result.map((m) => m.username)).toEqual(["alice"]);
  });

  it("sorts results alphabetically by username", () => {
    const result = filterMembersByAllowlist(members, new Set([3, 1, 2]));
    expect(result.map((m) => m.username)).toEqual(["alice", "bob", "carol"]);
  });
});
