/**
 * Ranks internal Slack channels as candidates for a project's channel.
 *
 * The existing rankChannels() scores on client name only, but internal
 * channels are named after the project ("callrail-wiggam-law-virtual-
 * testimonial"), so this scores on project-name token coverage with the
 * client name as a tiebreaker. Slack Connect (shared) channels are the
 * client-facing side and are excluded outright. Pure, no I/O.
 */

export interface InternalChannelCandidate {
  id: string;
  name: string;
  isShared: boolean;
  isMember: boolean;
}

export interface RankedInternalChannel extends InternalChannelCandidate {
  score: number;
  confident: boolean;
}

function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && t !== "consume");
}

const CONFIDENT_COVERAGE = 0.75; // share of channel tokens found in the project name
const MIN_HITS = 2;

export function rankInternalChannels(
  projectName: string,
  clientName: string,
  channels: InternalChannelCandidate[]
): RankedInternalChannel[] {
  const proj = new Set(tokens(projectName));
  const client = new Set(tokens(clientName));
  const out: RankedInternalChannel[] = [];
  for (const c of channels) {
    if (c.isShared) continue;
    const ct = tokens(c.name);
    if (ct.length === 0) continue;
    const hits = ct.filter((t) => proj.has(t)).length;
    if (hits < MIN_HITS) continue;
    const coverage = hits / ct.length;
    const clientBonus = ct.some((t) => client.has(t)) ? 0.1 : 0;
    const score = coverage + clientBonus + hits * 0.01;
    out.push({ ...c, score, confident: coverage >= CONFIDENT_COVERAGE && clientBonus > 0 });
  }
  return out.sort((a, b) => b.score - a.score || a.name.length - b.name.length);
}
