"use client";

import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Users } from "lucide-react";
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
import type { DeliverableTask } from "@/lib/types";

interface Assignee {
  id: number;
  name: string;
  avatar?: string;
}

interface AssigneeFilterProps {
  tasks: DeliverableTask[];
  value: string;
  onValueChange: (value: string) => void;
}

function Avatar({ src, name, size = 20 }: { src?: string; name: string; size?: number }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  // Fallback: initials
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground shrink-0"
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

export { Avatar };

export function AssigneeFilter({
  tasks,
  value,
  onValueChange,
}: AssigneeFilterProps) {
  const [open, setOpen] = useState(false);

  const assignees = useMemo<Assignee[]>(() => {
    const seen = new Map<number, Assignee>();
    for (const t of tasks) {
      if (t.assignee && !seen.has(t.assignee.id)) {
        seen.set(t.assignee.id, {
          id: t.assignee.id,
          name: t.assignee.name,
          avatar: t.assignee.avatar,
        });
      }
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [tasks]);

  const selected = assignees.find((a) => String(a.id) === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[280px] justify-between"
        >
          <span className="flex items-center gap-2 truncate">
            {selected ? (
              <>
                <Avatar src={selected.avatar} name={selected.name} size={18} />
                {selected.name}
              </>
            ) : (
              <>
                <Users className="h-4 w-4 text-muted-foreground" />
                All Assignees
              </>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0">
        <Command>
          <CommandInput placeholder="Search assignees..." />
          <CommandList>
            <CommandEmpty>No assignees found.</CommandEmpty>
            <CommandGroup>
              {/* All Assignees option */}
              <CommandItem
                value="All Assignees"
                onSelect={() => {
                  onValueChange("");
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    !value ? "opacity-100" : "opacity-0"
                  )}
                />
                <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                All Assignees
              </CommandItem>

              {/* Individual assignees */}
              {assignees.map((a) => (
                <CommandItem
                  key={a.id}
                  value={a.name}
                  onSelect={() => {
                    onValueChange(String(a.id));
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === String(a.id) ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <Avatar src={a.avatar} name={a.name} size={20} />
                  <span className="ml-2">{a.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
