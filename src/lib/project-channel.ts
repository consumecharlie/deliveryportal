/**
 * Which internal Slack channel gets the "client confirmed feedback" note for a
 * project. An existing mapping (PM-confirmed or earlier auto-match) wins;
 * otherwise crawl Slack, rank by project name, and auto-select only a
 * confident top match. The confirm flow persists that match as autoMatched so
 * a PM can see and override it in Project Setup.
 */
import { prisma } from "@/lib/db";
import { listVisibleChannels } from "@/lib/slack-audit";
import {
  rankInternalChannels,
  pickConfident,
  type RankedInternalChannel,
} from "@/lib/project-channel-rank";

export interface ProjectChannelResolution {
  channelId: string | null;
  channelName: string | null;
  source: "confirmed" | "auto" | "none";
  /** True when the row came from auto-matching rather than a PM. */
  autoMatched: boolean;
  /** Top-ranked candidates (empty when a mapping already existed). */
  suggestions: RankedInternalChannel[];
}

const MAX_SUGGESTIONS = 5;

/** Crawl Slack and rank internal (non-shared) channels for a project. Never writes. */
export async function rankProjectChannels(
  projectName: string,
  clientName: string
): Promise<RankedInternalChannel[]> {
  const channels = await listVisibleChannels();
  return rankInternalChannels(
    projectName,
    clientName,
    channels.map((c) => ({ id: c.id, name: c.name, isShared: c.isShared, isMember: c.isMember }))
  ).slice(0, MAX_SUGGESTIONS);
}

/**
 * @param opts.persist Save a confident auto-match as a ProjectChannel row.
 *   Only the confirm flow does this; admin reads must stay side-effect free.
 */
export async function resolveProjectChannel(
  projectListId: string,
  projectName: string,
  clientName: string,
  opts: { persist?: boolean } = {}
): Promise<ProjectChannelResolution> {
  const existing = await prisma.projectChannel.findUnique({ where: { projectListId } });
  if (existing) {
    return {
      channelId: existing.channelId,
      channelName: existing.channelName,
      source: existing.autoMatched ? "auto" : "confirmed",
      autoMatched: existing.autoMatched,
      suggestions: [],
    };
  }
  const ranked = await rankProjectChannels(projectName, clientName);
  const top = pickConfident(ranked);
  if (top) {
    if (opts.persist) {
      // Create-only: a concurrent confirm that raced us to the same list
      // must not throw P2002, and must not overwrite what it wrote.
      await prisma.projectChannel.upsert({
        where: { projectListId },
        create: {
          projectListId,
          channelId: top.id,
          channelName: top.name,
          autoMatched: true,
          confirmedBy: "auto-match",
        },
        update: {},
      });
    }
    return { channelId: top.id, channelName: top.name, source: "auto", autoMatched: true, suggestions: ranked };
  }
  return { channelId: null, channelName: null, source: "none", autoMatched: false, suggestions: ranked };
}
