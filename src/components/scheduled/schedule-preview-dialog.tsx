"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mail, MessageSquare, CalendarClock } from "lucide-react";
import { markdownToHtml } from "@/components/shared/rich-text-editor";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  row: {
    primaryEmail: string;
    ccEmails: string;
    senderEmail: string;
    deliverableType: string;
    postToSlack: boolean;
    slackChannelName: string;
    subjectLine: string;
    emailContent: string;
    slackContent: string;
    projectName: string;
    clientName: string;
    scheduledFor: string | null;
  } | null;
}

function fmtET(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/**
 * Make Slack mention tokens readable in the preview.
 * Raw `<@U05AC4CFK62>` becomes `@U05AC4CFK62` (we don't have the contact list
 * here to resolve display names — Slack itself will render the real name on
 * send). TipTap-style `@[name](id)` mentions are passed through unchanged so
 * markdownToHtml renders them as mention chips.
 */
function prepareSlackForDisplay(md: string): string {
  return md.replace(/<@([A-Z0-9]+)>/g, "@[$1]($1)");
}

export function SchedulePreviewDialog({ open, onOpenChange, row }: Props) {
  if (!row) return null;
  const meta = [
    row.deliverableType,
    [row.clientName, row.projectName].filter(Boolean).join(" / "),
  ]
    .filter(Boolean)
    .join(" · ");

  const bodyHtml = row.postToSlack
    ? markdownToHtml(prepareSlackForDisplay(row.slackContent))
    : markdownToHtml(row.emailContent);

  const recipientLine = row.postToSlack
    ? row.slackChannelName
      ? `#${row.slackChannelName}`
      : "(Slack)"
    : row.primaryEmail || "(no recipient)";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {row.postToSlack ? (
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Mail className="h-4 w-4 text-muted-foreground" />
            )}
            <DialogTitle>
              {row.postToSlack ? "Slack" : "Email"} preview
            </DialogTitle>
          </div>
          <DialogDescription>{meta || "—"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto pr-1">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              <span>Sends {fmtET(row.scheduledFor)}</span>
            </div>
            {!row.postToSlack && (
              <>
                <div>
                  <span className="text-muted-foreground">To:</span>{" "}
                  <span className="font-medium">{recipientLine}</span>
                </div>
                {row.ccEmails && (
                  <div>
                    <span className="text-muted-foreground">CC:</span>{" "}
                    <span className="font-medium">{row.ccEmails}</span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">From:</span>{" "}
                  <span className="font-medium">
                    {row.senderEmail || "(no sender)"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Subject:</span>{" "}
                  <span className="font-medium">{row.subjectLine || "—"}</span>
                </div>
              </>
            )}
            {row.postToSlack && (
              <div>
                <span className="text-muted-foreground">Channel:</span>{" "}
                <span className="font-mono">{recipientLine}</span>
              </div>
            )}
          </div>

          <div
            className="tiptap rounded-md border bg-background px-4 py-3 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: bodyHtml || "<p class=\"text-muted-foreground italic\">(empty body)</p>" }}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
