import { describe, it, expect } from "vitest";
import {
  isExternalMember,
  matchMembersToContacts,
  type SlackPerson,
  type ExistingContact,
} from "@/lib/channel-people";

describe("isExternalMember", () => {
  it("returns true for a team different from ours", () => {
    expect(isExternalMember("T_CLIENT", "T_OURS")).toBe(true);
  });

  it("returns false when team matches ours", () => {
    expect(isExternalMember("T_OURS", "T_OURS")).toBe(false);
  });

  it("returns false when teamId is undefined", () => {
    expect(isExternalMember(undefined, "T_OURS")).toBe(false);
  });
});

describe("matchMembersToContacts", () => {
  it("fills a missing userId via email match (update, no create)", () => {
    const people: SlackPerson[] = [
      { userId: "U1", name: "Emily Gardiner", email: "Emily@Client.com", isExternal: true },
    ];
    const existing: ExistingContact[] = [
      { taskId: "t1", name: "Emily Gardiner", email: "emily@client.com" },
    ];

    const plan = matchMembersToContacts(people, existing);

    expect(plan.create).toEqual([]);
    expect(plan.ambiguous).toEqual([]);
    expect(plan.update).toEqual([
      { taskId: "t1", name: "Emily Gardiner", userId: "U1" },
    ]);
  });

  it("matches by first-token name when person has no email", () => {
    const people: SlackPerson[] = [
      { userId: "U2", name: "Dana Scully", isExternal: true },
    ];
    const existing: ExistingContact[] = [
      { taskId: "t2", name: "dana s.", email: "dana@client.com" },
    ];

    const plan = matchMembersToContacts(people, existing);

    expect(plan.create).toEqual([]);
    expect(plan.ambiguous).toEqual([]);
    expect(plan.update).toEqual([
      { taskId: "t2", name: "Dana Scully", userId: "U2" },
    ]);
  });

  it("creates a new contact when there is no match", () => {
    const people: SlackPerson[] = [
      { userId: "U3", name: "New Person", email: "new@client.com", isExternal: true },
    ];
    const existing: ExistingContact[] = [
      { taskId: "t9", name: "Someone Else", email: "else@client.com" },
    ];

    const plan = matchMembersToContacts(people, existing);

    expect(plan.update).toEqual([]);
    expect(plan.ambiguous).toEqual([]);
    expect(plan.create).toEqual([
      { name: "New Person", email: "new@client.com", userId: "U3" },
    ]);
  });

  it("marks a person ambiguous when multiple name matches (no email)", () => {
    const people: SlackPerson[] = [
      { userId: "U4", name: "Dana", isExternal: true },
    ];
    const existing: ExistingContact[] = [
      { taskId: "t3", name: "Dana Scully" },
      { taskId: "t4", name: "Dana White" },
    ];

    const plan = matchMembersToContacts(people, existing);

    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.ambiguous).toEqual([people[0]]);
  });

  it("produces no update and no create when existing contact already complete", () => {
    const people: SlackPerson[] = [
      { userId: "U5", name: "Full Contact", email: "full@client.com", isExternal: true },
    ];
    const existing: ExistingContact[] = [
      { taskId: "t5", name: "Full Contact", email: "full@client.com", userId: "U5" },
    ];

    const plan = matchMembersToContacts(people, existing);

    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.ambiguous).toEqual([]);
  });

  it("does not mutate inputs", () => {
    const people: SlackPerson[] = [
      { userId: "U6", name: "Zoe", email: "zoe@client.com", isExternal: true },
    ];
    const existing: ExistingContact[] = [
      { taskId: "t6", name: "Zoe", email: "zoe@client.com" },
    ];
    const peopleCopy = structuredClone(people);
    const existingCopy = structuredClone(existing);

    matchMembersToContacts(people, existing);

    expect(people).toEqual(peopleCopy);
    expect(existing).toEqual(existingCopy);
  });
});
