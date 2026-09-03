import type { PortalActionItem } from "@/lib/portal-data";
import { FeedbackBadge } from "./feedback-badge";
import { ConfirmButton } from "./confirm-button";

export function ActionItems({ token, items }: { token: string; items: PortalActionItem[] }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Needs your feedback</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-neutral-500">You&apos;re all caught up.</p>
      ) : (
        <ul className="mt-2 divide-y divide-neutral-200">
          {items.map(({ entry, projectName, status }) => {
            const first = entry.links[0];
            return (
              <li
                key={entry.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{entry.deliverableType}</span>
                    <FeedbackBadge status={status} />
                  </div>
                  <p className="mt-0.5 text-sm text-neutral-500">{projectName}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {first && (
                    <a
                      href={first.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="portal-btn portal-btn-secondary"
                    >
                      Open review
                    </a>
                  )}
                  <ConfirmButton token={token} deliveryId={entry.id} initialConfirmed={false} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
