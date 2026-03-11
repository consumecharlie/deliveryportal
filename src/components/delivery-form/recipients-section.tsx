"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Mail, MessageSquare } from "lucide-react";
import { SenderSelect, type SenderOption } from "./sender-select";

interface RecipientsSectionProps {
  primaryEmail: string;
  ccEmails: string;
  senderEmail: string;
  postToSlack: boolean;
  senderOptions: SenderOption[];
  onPrimaryEmailChange: (value: string) => void;
  onCcEmailsChange: (value: string) => void;
  onSenderEmailChange: (value: string) => void;
}

export function RecipientsSection({
  primaryEmail,
  ccEmails,
  senderEmail,
  postToSlack,
  senderOptions,
  onPrimaryEmailChange,
  onCcEmailsChange,
  onSenderEmailChange,
}: RecipientsSectionProps) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Recipients</Label>
      <div className="rounded-md border p-4 space-y-3 text-sm">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground w-10 shrink-0">To:</span>
          <Input
            value={primaryEmail}
            onChange={(e) => onPrimaryEmailChange(e.target.value)}
            placeholder="Primary recipient email"
            className="h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground w-10 shrink-0">CC:</span>
          <Input
            value={ccEmails}
            onChange={(e) => onCcEmailsChange(e.target.value)}
            placeholder="CC emails (comma-separated)"
            className="h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground w-10 shrink-0">From:</span>
          <div className="flex-1">
            <SenderSelect
              senders={senderOptions}
              value={senderEmail}
              onValueChange={onSenderEmailChange}
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Delivery channels:</span>
          <div className="flex gap-2">
            <Badge variant="outline" className="gap-1">
              <Mail className="h-3 w-3" />
              Email
            </Badge>
            {postToSlack && (
              <Badge variant="outline" className="gap-1">
                <MessageSquare className="h-3 w-3" />
                Slack
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
