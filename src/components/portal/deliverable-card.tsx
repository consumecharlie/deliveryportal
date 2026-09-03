"use client";

import { useMemo, useState } from "react";
import type { DeliverableGroup, TimelineLink } from "@/lib/portal-timeline";
import type { FeedbackStatus } from "@/lib/portal-data";
import { renderPortalBody } from "@/lib/portal-render";
import { FeedbackBadge } from "./feedback-badge";
import { ConfirmButton } from "./confirm-button";

const LINK_LABELS: Record<string, string> = {
  frameReviewLink: "Frame.io review",
  googleDeliverableLink: "Google Drive",
  loomReviewLink: "Loom walkthrough",
  animaticReviewLink: "Animatic",
  flexLink: "Review link",
};

function linkLabel(link: TimelineLink): string {
  return (link.variableName && LINK_LABELS[link.variableName]) || link.label;
}

const TZ = "America/New_York";

function sentDate(d: Date, withYear: boolean): string {
  return d.toLocaleDateString("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

interface Props {
  token: string;
  group: DeliverableGroup;
  status: FeedbackStatus | undefined;
}

export function DeliverableCard({ token, group, status }: Props) {
  const versions = useMemo(() => [group.latest, ...group.history], [group]);
  const [selectedId, setSelectedId] = useState(group.latest.id);
  const [showBody, setShowBody] = useState(false);

  const entry = versions.find((v) => v.id === selectedId) ?? group.latest;
  const isLatest = entry.id === group.latest.id;
  const html = useMemo(() => renderPortalBody(entry.body), [entry.body]);

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{entry.deliverableType}</h3>
          <p className="mt-0.5 text-sm text-neutral-500">Sent {sentDate(entry.sentAt, true)}</p>
        </div>
        {isLatest && <FeedbackBadge status={status} />}
      </div>

      {group.history.length > 0 && (
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <span className="whitespace-nowrap">Version</span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900"
          >
            {versions.map((v, i) => (
              <option key={v.id} value={v.id}>
                {i === 0 ? `Latest: ${v.deliverableType}` : `${v.deliverableType}, sent ${sentDate(v.sentAt, false)}`}
              </option>
            ))}
          </select>
        </label>
      )}

      {entry.links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {entry.links.map((l) => (
            <a
              key={`${l.variableName ?? l.label}:${l.url}`}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="portal-btn portal-btn-secondary"
            >
              {linkLabel(l)}
            </a>
          ))}
        </div>
      )}

      {entry.body && (
        <div>
          <button
            type="button"
            onClick={() => setShowBody((s) => !s)}
            aria-expanded={showBody}
            className="portal-btn portal-btn-secondary"
          >
            {showBody ? "Hide message" : "Show message"}
          </button>
          {showBody && <div className="portal-body mt-3" dangerouslySetInnerHTML={{ __html: html }} />}
        </div>
      )}

      {isLatest && status && status.kind !== "none" && (
        <div className="border-t border-neutral-200 pt-4">
          <ConfirmButton token={token} deliveryId={entry.id} initialConfirmed={status.kind === "confirmed"} />
        </div>
      )}
    </article>
  );
}
