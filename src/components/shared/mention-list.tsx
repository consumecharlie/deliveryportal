"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { cn } from "@/lib/utils";

export interface MentionItem {
  id: string;
  label: string; // Primary label (Slack display_name)
  realName?: string; // Muted secondary line (Slack real_name); omit if same as label
  slackUserId?: string;
  slackHandle?: string;
  email?: string;
  avatar?: string;
  source: "project" | "all" | "slack";
}

interface MentionListProps {
  items: MentionItem[];
  command: (item: { id: string; label: string }) => void;
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

/**
 * Dropdown suggestion list for TipTap Mention extension.
 * Shows matching contacts/Slack members when the user types @.
 */
export const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) {
        command({ id: item.id, label: item.label });
      }
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) =>
            prev <= 0 ? items.length - 1 : prev - 1
          );
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) =>
            prev >= items.length - 1 ? 0 : prev + 1
          );
          return true;
        }
        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (!items.length) {
      return (
        <div className="rounded-md border bg-popover p-2 text-sm text-muted-foreground shadow-md">
          No results
        </div>
      );
    }

    return (
      <div className="z-50 max-h-96 w-[420px] overflow-y-auto rounded-md border bg-popover shadow-md">
        {items.map((item, index) => {
          const initials = item.label
            .split(/\s+/)
            .map((w) => w[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")
            .toUpperCase();
          const secondary =
            item.realName && item.realName !== item.label
              ? item.realName
              : item.slackHandle && item.label !== item.slackHandle
                ? `@${item.slackHandle.replace(/^@/, "")}`
                : null;
          const isSelected = index === selectedIndex;
          return (
            <button
              key={item.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-left",
                "hover:bg-accent",
                isSelected && "bg-accent"
              )}
              onClick={() => selectItem(index)}
            >
              {item.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.avatar}
                  alt={item.label}
                  width={36}
                  height={36}
                  className="rounded-md object-cover shrink-0"
                  style={{ width: 36, height: 36 }}
                />
              ) : (
                <span
                  className="inline-flex items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground shrink-0"
                  style={{ width: 36, height: 36 }}
                >
                  {initials || "?"}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{item.label}</div>
                {secondary && (
                  <div className="text-xs text-muted-foreground truncate">
                    {secondary}
                  </div>
                )}
              </div>
              {isSelected && (
                <span className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5 shrink-0">
                  Enter
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }
);

MentionList.displayName = "MentionList";
