"use client";

import { AlertTriangle, ExternalLink } from "lucide-react";
import type { ClientPreferenceData } from "@/lib/client-preferences";

export function ClientPreferenceBanner({
  preference,
}: {
  preference: ClientPreferenceData | null | undefined;
}) {
  if (!preference || !preference.enabled || !preference.warningMessage.trim()) {
    return null;
  }
  return (
    <div className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <div className="space-y-2">
        <p className="font-medium">{preference.clientName} — delivery note</p>
        <p className="text-muted-foreground whitespace-pre-line">
          {preference.warningMessage}
        </p>
        {preference.destinationLink && (
          <a
            href={preference.destinationLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-amber-600 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open {preference.clientName}&apos;s folder
          </a>
        )}
      </div>
    </div>
  );
}
