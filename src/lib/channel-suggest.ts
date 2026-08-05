/**
 * Pure, deterministic ranking of candidate Slack channels for a project.
 *
 * Given a client name, the project's contact display names, and a list of
 * candidate channels, produce a scored + sorted list so the setup wizard can
 * suggest the most likely channel. No I/O — everything here is a pure function
 * of its inputs.
 */

export interface ChannelCandidate {
  id: string;
  name: string;
  isMember: boolean;
  memberNames?: string[]; // display names of members, when known (overlap scoring)
}

/**
 * Lowercase, split on non-alphanumeric runs, drop empty tokens, and drop the
 * agency token "consume" (it appears in nearly every client channel name, so it
 * is noise for matching purposes).
 */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && t !== "consume");
}

export function rankChannels(
  clientName: string,
  contactNames: string[],
  channels: ChannelCandidate[]
): Array<ChannelCandidate & { score: number }> {
  const clientTokens = new Set(tokenize(clientName));

  // First token of each contact name — the piece we look for among channel
  // members. Skip contacts that tokenize to nothing.
  const contactFirstTokens = contactNames
    .map((n) => tokenize(n)[0])
    .filter((t): t is string => Boolean(t));

  const scored = channels.map((channel) => {
    const channelTokens = tokenize(channel.name);

    // nameScore: shared tokens between client name and channel name, weighted x2.
    let shared = 0;
    for (const token of new Set(channelTokens)) {
      if (clientTokens.has(token)) shared++;
    }
    const nameScore = shared * 2;

    // overlapScore: how many contacts have their first token appear as a token
    // in ANY of the channel's member names.
    const memberTokens = new Set(
      (channel.memberNames ?? []).flatMap((m) => tokenize(m))
    );
    let overlapScore = 0;
    for (const first of contactFirstTokens) {
      if (memberTokens.has(first)) overlapScore++;
    }

    return { ...channel, score: nameScore + overlapScore };
  });

  // Sort: score DESC, then shorter name first, then name ASC for stability.
  return scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.name.length !== b.name.length) return a.name.length - b.name.length;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}
