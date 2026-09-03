/**
 * Which internal Slack channel gets the "client confirmed feedback" note for a
 * project. A PM-confirmed mapping wins; otherwise crawl Slack, rank by project
 * name, and auto-select only a confident top match (persisted as autoMatched
 * so a PM can see and override it in Project Setup).
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

export async function resolveProjectChannel(
  projectListId: string,
  projectName: string,
  clientName: string,
  opts: { dryRun?: boolean } = {}
): Promise<ProjectChannelResolution> {
  const existing = await prisma.projectChannel.findUnique({ where: { projectListId } });
  if (existing) {
    return {
      channelId: existing.channelId,
      channelName: existing.channelName,
      source: "confirmed",
      autoMatched: existing.autoMatched,
      suggestions: [],
    };
  }
  const channels = await listVisibleChannels();
  const ranked = rankInternalChannels(
    projectName,
    clientName,
    channels.map((c) => ({ id: c.id, name: c.name, isShared: c.isShared, isMember: c.isMember }))
  ).slice(0, MAX_SUGGESTIONS);
  const top = pickConfident(ranked);
  if (top) {
    if (!opts.dryRun) {
      await prisma.projectChannel.create({
        data: {
          projectListId,
          channelId: top.id,
          channelName: top.name,
          autoMatched: true,
          confirmedBy: "auto-match",
        },
      });
    }
    return { channelId: top.id, channelName: top.name, source: "auto", autoMatched: true, suggestions: ranked };
  }
  return { channelId: null, channelName: null, source: "none", autoMatched: false, suggestions: ranked };
}
