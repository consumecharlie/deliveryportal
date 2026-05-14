"use client";

import { Suspense } from "react";
import { SentTable } from "@/components/dashboard/sent-table";

export default function SentPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-eighties text-2xl">Sent</h1>
        <p className="text-muted-foreground">
          Previously sent client deliverables.
        </p>
      </div>

      {/* SentTable uses useSearchParams() to read ?open= for deep links
          from the analytics activity log. Next.js requires that to be
          inside a Suspense boundary so the static prerender doesn't
          bail out. */}
      <Suspense fallback={null}>
        <SentTable />
      </Suspense>
    </div>
  );
}
