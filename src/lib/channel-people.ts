/**
 * Pure, deterministic matcher for "Configure project from channel".
 *
 * Given the EXTERNAL (client-side) people present in a Slack channel and the
 * project's existing ClickUp contacts, produce a plan describing which contacts
 * to create, which to update (to backfill missing fields), and which are too
 * ambiguous to act on automatically. No I/O — everything here is a pure
 * function of its inputs.
 */

export interface SlackPerson {
  userId: string;
  name: string;
  email?: string;
  isExternal: boolean;
}

export interface ExistingContact {
  taskId: string;
  name: string;
  email?: string;
  userId?: string;
}

export interface MatchPlan {
  create: Array<{ name: string; email?: string; userId: string }>;
  update: Array<{ taskId: string; name: string; email?: string; userId?: string }>;
  ambiguous: SlackPerson[];
}

/** A member is external (client-side) when their Slack team differs from ours. */
export function isExternalMember(
  teamId: string | undefined,
  ourTeamId: string
): boolean {
  return teamId !== undefined && teamId !== ourTeamId;
}

/** Normalize an email for comparison: lowercased + trimmed. */
function normEmail(email: string | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** Normalize a name's FIRST token for comparison: lowercased + trimmed. */
function firstToken(name: string | undefined): string {
  return (name ?? "").trim().toLowerCase().split(/\s+/)[0] ?? "";
}

/** Match external channel people to existing contacts → create/update/ambiguous. */
export function matchMembersToContacts(
  people: SlackPerson[],
  existing: ExistingContact[]
): MatchPlan {
  const plan: MatchPlan = { create: [], update: [], ambiguous: [] };

  for (const person of people) {
    const personEmail = normEmail(person.email);

    // 1) Try to match by email (both non-empty, case-insensitive).
    let matches: ExistingContact[] = [];
    if (personEmail) {
      matches = existing.filter((c) => {
        const ce = normEmail(c.email);
        return ce !== "" && ce === personEmail;
      });
    }

    // 2) Fall back to name (normalized first token) when email found nothing.
    if (matches.length === 0) {
      const personToken = firstToken(person.name);
      if (personToken) {
        matches = existing.filter((c) => firstToken(c.name) === personToken);
      }
    }

    if (matches.length === 1) {
      const contact = matches[0];
      const entry: { taskId: string; name: string; email?: string; userId?: string } = {
        taskId: contact.taskId,
        name: person.name,
      };
      let hasFill = false;
      if (normEmail(contact.email) === "" && person.email) {
        entry.email = person.email;
        hasFill = true;
      }
      if ((contact.userId ?? "") === "") {
        entry.userId = person.userId;
        hasFill = true;
      }
      // Only record an update when there is something to backfill.
      if (hasFill) {
        plan.update.push(entry);
      }
    } else if (matches.length === 0) {
      plan.create.push({
        name: person.name,
        email: person.email,
        userId: person.userId,
      });
    } else {
      plan.ambiguous.push(person);
    }
  }

  return plan;
}
