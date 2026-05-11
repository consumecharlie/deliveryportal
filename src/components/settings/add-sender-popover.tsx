"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar } from "@/components/dashboard/assignee-filter";
import type { WorkspaceMember } from "@/lib/allowed-senders";

interface AddSenderPopoverProps {
  allowedIds: Set<number>;
}

export function AddSenderPopover({ allowedIds }: AddSenderPopoverProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ members: WorkspaceMember[] }>({
    queryKey: ["settings", "workspace-members"],
    queryFn: async () => {
      const res = await fetch("/api/settings/workspace-members");
      if (!res.ok) throw new Error("Failed to fetch workspace members");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const addMutation = useMutation({
    mutationFn: async (member: WorkspaceMember) => {
      const res = await fetch("/api/settings/senders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clickupUserId: member.id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        const err = new Error(body.error || "Failed to add sender") as Error & {
          status?: number;
        };
        err.status = res.status;
        throw err;
      }
      return member;
    },
    onSuccess: (member) => {
      queryClient.invalidateQueries({
        queryKey: ["settings", "allowed-senders"],
      });
      queryClient.invalidateQueries({ queryKey: ["field-options-senders"] });
      toast.success(`Added ${member.username}`);
      setOpen(false);
    },
    onError: (error: Error & { status?: number }) => {
      if (error.status === 409) {
        toast.info("Already added");
        setOpen(false);
        queryClient.invalidateQueries({
          queryKey: ["settings", "allowed-senders"],
        });
        return;
      }
      toast.error(error.message || "Failed to add sender");
    },
  });

  const members = data?.members ?? [];
  const selectable = members.filter((m) => !allowedIds.has(m.id));
  const isAdding = addMutation.isPending;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="default" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Add sender
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="end">
        <Command>
          <CommandInput placeholder="Search members..." />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Loading members..." : "No members found."}
            </CommandEmpty>
            <CommandGroup>
              {selectable.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.username} ${m.email}`}
                  disabled={isAdding}
                  aria-disabled={isAdding}
                  onSelect={() => {
                    if (isAdding) return;
                    addMutation.mutate(m);
                  }}
                >
                  <Avatar
                    src={m.profilePicture}
                    name={m.username}
                    size={22}
                  />
                  <span className="ml-2 truncate">{m.username}</span>
                  <span className="text-xs text-muted-foreground ml-auto truncate">
                    {m.email}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
