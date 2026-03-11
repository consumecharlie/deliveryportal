"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
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

export interface SenderOption {
  id: number;
  username: string;
  email: string;
  profilePicture?: string;
  initials: string;
}

interface SenderSelectProps {
  senders: SenderOption[];
  /** Currently selected sender email */
  value: string;
  onValueChange: (email: string) => void;
}

export function SenderSelect({
  senders,
  value,
  onValueChange,
}: SenderSelectProps) {
  const [open, setOpen] = useState(false);

  const selected = senders.find((s) => s.email === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-8 text-sm font-normal"
        >
          <span className="flex items-center gap-2 truncate">
            {selected ? (
              <>
                <Avatar
                  src={selected.profilePicture}
                  name={selected.username}
                  size={18}
                />
                {selected.username}
              </>
            ) : value ? (
              // Show the email if we have a value but it's not in the list
              <span className="text-muted-foreground">{value}</span>
            ) : (
              <span className="text-muted-foreground">Select sender...</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search senders..." />
          <CommandList>
            <CommandEmpty>No senders found.</CommandEmpty>
            <CommandGroup>
              {senders.map((sender) => (
                <CommandItem
                  key={sender.id}
                  value={sender.username}
                  onSelect={() => {
                    onValueChange(sender.email);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === sender.email ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <Avatar
                    src={sender.profilePicture}
                    name={sender.username}
                    size={22}
                  />
                  <span className="ml-2">{sender.username}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
