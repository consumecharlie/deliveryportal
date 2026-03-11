"use client";

import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/shared/searchable-select";
import { AlertTriangle } from "lucide-react";
import type { SlackChannel } from "@/lib/types";

interface SlackChannelSectionProps {
  channelId: string;
  onChannelChange: (channelId: string) => void;
  /** Sender email to validate channel membership */
  senderEmail?: string;
}

export function SlackChannelSection({
  channelId,
  onChannelChange,
  senderEmail,
}: SlackChannelSectionProps) {
  const { data, isLoading, isError } = useQuery<{ channels: SlackChannel[] }>({
    queryKey: ["slack-channels"],
    queryFn: async () => {
      const res = await fetch("/api/slack/channels");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to load channels");
      }
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  // Check if the sender is a member of the selected channel
  const { data: membershipData } = useQuery<{
    isMember: boolean;
    reason?: string;
  }>({
    queryKey: ["slack-membership", channelId, senderEmail],
    queryFn: async () => {
      const res = await fetch(
        `/api/slack/check-membership?channelId=${encodeURIComponent(channelId)}&email=${encodeURIComponent(senderEmail!)}`
      );
      if (!res.ok) return { isMember: true }; // Fail open — don't block on errors
      return res.json();
    },
    enabled: !!channelId && !!senderEmail,
    staleTime: 2 * 60_000,
  });

  const senderNotInChannel =
    membershipData && !membershipData.isMember && !!channelId && !!senderEmail;

  const channelName =
    data?.channels.find((ch) => ch.id === channelId)?.name ?? "this channel";

  const channelOptions =
    data?.channels.map((ch) => ({
      value: ch.id,
      label: `#${ch.name}`,
    })) ?? [];

  const placeholder = isLoading
    ? "Loading channels..."
    : isError
      ? "Failed to load channels"
      : "Select Slack channel";

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Slack Channel</Label>
      <SearchableSelect
        options={channelOptions}
        value={channelId}
        onValueChange={onChannelChange}
        placeholder={placeholder}
        searchPlaceholder="Search channels..."
        emptyMessage={
          isError
            ? "Could not connect to Slack. Check that SLACK_BOT_TOKEN is set in .env.local."
            : "No channels found. Ensure the bot has channels:read scope."
        }
        disabled={isLoading}
      />
      {isError && (
        <p className="text-xs text-destructive">
          Slack connection failed. Verify SLACK_BOT_TOKEN in .env.local has a valid xoxb-... token.
        </p>
      )}
      {senderNotInChannel && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {membershipData.reason === "not_in_workspace" ? (
              <>
                <strong>{senderEmail}</strong> is not in the Slack workspace.
                The message will fail to send.
              </>
            ) : (
              <>
                The sender is not a member of <strong>#{channelName}</strong>.
                Slack will reject the message unless they join the channel first.
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
