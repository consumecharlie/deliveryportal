"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Hash, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SlackChannel } from "@/lib/types";

export interface ProjectChannelMapping {
  projectListId: string;
  channelId: string;
  channelName: string;
  autoMatched: boolean;
}

interface Suggestion {
  id: string;
  name: string;
  confident: boolean;
}

interface Resolution {
  channelId: string | null;
  channelName: string | null;
  autoMatched: boolean;
  suggestions: Suggestion[];
}

interface Props {
  listId: string;
  projectName: string;
  clientName: string;
  mapping: ProjectChannelMapping | null;
}

const MAX_SEARCH_RESULTS = 8;

/**
 * "Internal channel" cell for a Project Setup row: where portal confirmations
 * post. Shows the mapped channel (with an "auto" tag when auto-matched) and a
 * Change popover with ranked suggestions plus a search over all channels.
 */
export function ProjectChannelCell({ listId, projectName, clientName, mapping }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const suggestQuery = useQuery<Resolution>({
    queryKey: ["project-channel-suggest", listId],
    enabled: open,
    queryFn: async () => {
      const params = new URLSearchParams({ listId, projectName, clientName });
      const res = await fetch(`/api/settings/project-channel?${params}`);
      if (!res.ok) throw new Error("Failed to load suggestions");
      return res.json();
    },
  });

  const channelsQuery = useQuery<{ channels: SlackChannel[] }>({
    queryKey: ["slack-channels"],
    enabled: open && search.trim().length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch("/api/slack/channels");
      if (!res.ok) throw new Error("Failed to load channels");
      return res.json();
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["project-channels"] });
    queryClient.invalidateQueries({ queryKey: ["project-channel-suggest", listId] });
  };

  const setMutation = useMutation({
    mutationFn: async (v: { channelId: string; channelName: string }) => {
      const res = await fetch("/api/settings/project-channel", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId, ...v }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; joined?: boolean };
      if (!res.ok) throw new Error(body.error || "Save failed");
      return body;
    },
    onSuccess: (body, v) => {
      toast.success(
        body.joined
          ? `Internal channel set to #${v.channelName}`
          : `Internal channel set to #${v.channelName}. The bot could not join; invite @n8n there.`
      );
      setOpen(false);
      setSearch("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/settings/project-channel?listId=${encodeURIComponent(listId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Clear failed");
    },
    onSuccess: () => {
      toast.success("Internal channel cleared");
      setOpen(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = setMutation.isPending || clearMutation.isPending;
  const term = search.trim().toLowerCase();
  const searchResults = term
    ? (channelsQuery.data?.channels ?? [])
        .filter((c) => !c.isExtShared && c.name.toLowerCase().includes(term))
        .slice(0, MAX_SEARCH_RESULTS)
    : [];
  const suggestions = (suggestQuery.data?.suggestions ?? []).filter((s) => s.id !== mapping?.channelId);

  const option = (id: string, name: string, note?: string) => (
    <button
      key={id}
      type="button"
      disabled={busy}
      onClick={() => setMutation.mutate({ channelId: id, channelName: name })}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-muted disabled:opacity-50"
    >
      <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">{name}</span>
      {note ? <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wider text-[#6AC387]">{note}</span> : null}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">Internal channel</span>
      {mapping ? (
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <Hash className="h-3 w-3 text-muted-foreground" />
          {mapping.channelName}
          {mapping.autoMatched ? (
            <span className="ml-1 rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              auto
            </span>
          ) : null}
        </span>
      ) : (
        <span className="text-muted-foreground">Not set</span>
      )}
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <Button size="xs" variant="outline" className="h-6 rounded-md px-2 text-[11px]">
            Change
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-3">
          <div className="space-y-3">
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search channels"
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {term ? (
              <div className="space-y-0.5">
                {channelsQuery.isLoading ? (
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading channels
                  </div>
                ) : searchResults.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">No internal channels match.</p>
                ) : (
                  searchResults.map((c) => option(c.id, c.name))
                )}
              </div>
            ) : (
              <div className="space-y-0.5">
                <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  Suggestions
                </p>
                {suggestQuery.isLoading ? (
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Ranking channels
                  </div>
                ) : suggestQuery.isError ? (
                  <p className="px-2 py-1.5 text-xs text-red-400">Could not load suggestions.</p>
                ) : suggestions.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    Nothing close to the project name. Search instead.
                  </p>
                ) : (
                  suggestions.map((s) => option(s.id, s.name, s.confident ? "match" : undefined))
                )}
              </div>
            )}
            {mapping ? (
              <div className="border-t border-border/60 pt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => clearMutation.mutate()}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  Clear mapping
                </button>
              </div>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
