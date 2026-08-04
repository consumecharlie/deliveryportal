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
    <div className="flex items-start gap-3 rounded-md bg-[#DBEF00] px-4 py-3 text-sm text-black shadow-md ring-1 ring-black/20">
      <AlertTriangle
        className="mt-0.5 h-5 w-5 shrink-0 text-black"
        strokeWidth={2.5}
      />
      <div className="space-y-1.5">
        <p className="font-bold text-black">
          {preference.clientName}: delivery note
        </p>
        <p className="font-medium text-black whitespace-pre-line">
          {preference.warningMessage}
        </p>
        {preference.destinationLink && (
          <a
            href={preference.destinationLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-bold text-black underline underline-offset-2 hover:opacity-70"
          >
            <ExternalLink className="h-4 w-4" strokeWidth={2.5} />
            Open {preference.clientName}&apos;s folder
          </a>
        )}
      </div>
    </div>
  );
}
