"use client";

import { Label } from "@/components/ui/label";
import type { ProjectContact } from "@/lib/types";

interface GreetingContactsProps {
  contacts: ProjectContact[];
  /** ClickUp task ids of contacts excluded from the greeting. */
  excludedIds: string[];
  onToggle: (taskId: string) => void;
  /** Slack deliveries say "mentioned", email says "greeted". */
  postToSlack: boolean;
}

/**
 * Per-delivery control over who the message addresses.
 *
 * The `[contacts]` token resolves from every ClickUp Project Contact on the
 * project, which is right almost always and wrong occasionally (someone who
 * should not be named on this particular delivery). Before this existed the
 * only fixes were editing ClickUp, which is wrong for a one-off, or freezing
 * the message in the editor.
 *
 * Deselecting affects the greeting and @mentions ONLY. Email To/CC is
 * unchanged, so the person still receives the delivery, just unaddressed.
 */
export function GreetingContacts({
  contacts,
  excludedIds,
  onToggle,
  postToSlack,
}: GreetingContactsProps) {
  // Role "Log" contacts never appear in the greeting, so they are not offered.
  const addressable = contacts.filter((c) => c.role !== "Log");
  if (addressable.length === 0) return null;

  const excludedCount = addressable.filter((c) => excludedIds.includes(c.taskId)).length;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-medium">
          {postToSlack ? "Mentioned in message" : "Addressed in greeting"}
        </Label>
        {excludedCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {excludedCount} hidden, still receiving it
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {addressable.map((contact) => {
          const excluded = excludedIds.includes(contact.taskId);
          return (
            <label
              key={contact.taskId}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
                excluded
                  ? "border-border bg-muted/40 text-muted-foreground"
                  : "border-[#6AC387]/40 bg-[#6AC387]/5"
              }`}
            >
              <input
                type="checkbox"
                checked={!excluded}
                onChange={() => onToggle(contact.taskId)}
                className="h-4 w-4 rounded border-border accent-[#6AC387]"
              />
              <span className={excluded ? "line-through" : ""}>{contact.name}</span>
              {contact.role === "Primary" && (
                <span className="text-xs text-muted-foreground">Primary</span>
              )}
            </label>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Unchecking removes someone from the greeting{postToSlack ? " and @mentions" : ""}. They
        still receive this delivery.
      </p>
    </div>
  );
}
