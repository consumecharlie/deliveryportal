import type { PortalAttentionItem } from "@/lib/portal-page-model";
import { ConfirmButton } from "./confirm-button";
import { StatusPill } from "./status-pill";
import { ViewLink } from "./view-link";

/**
 * "Needs your review": the one tinted surface on the page. Hidden entirely
 * when there is nothing to do; a single quiet line takes its place.
 */
export function AttentionList({ token, items }: { token: string; items: PortalAttentionItem[] }) {
  if (items.length === 0) {
    return <p className="portal-quiet">Nothing needs your review right now.</p>;
  }
  return (
    <section className="portal-attention" aria-labelledby="portal-attention-caption">
      <h2 id="portal-attention-caption" className="portal-caption">
        Needs your review
      </h2>
      <ul className="portal-attention-panel">
        {items.map((item) => {
          const dueText = item.review.state === "overdue" || item.review.state === "due-today" ? null : item.review.label;
          return (
            <li key={item.deliveryId} className="portal-attention-row">
              <div className="portal-attention-what">
                <span className="portal-row-title">
                  {item.deliverableTitle}
                  {item.variant && <span className="portal-row-variant">{item.variant}</span>}
                </span>
                <span className="portal-attention-project">{item.projectName}</span>
              </div>
              <div className="portal-attention-due">
                {dueText ? (
                  <span>{dueText}</span>
                ) : (
                  <StatusPill state={item.review.state} label={item.review.label} />
                )}
              </div>
              <div className="portal-attention-actions">
                {item.primaryLink && (
                  <ViewLink
                    token={token}
                    deliveryId={item.deliveryId}
                    href={item.primaryLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="portal-btn portal-btn-secondary"
                  >
                    Open review
                  </ViewLink>
                )}
                <ConfirmButton
                  key={`${item.deliveryId}:${item.review.state}:${item.review.confirmedAtMs ?? ""}`}
                  token={token}
                  deliveryId={item.deliveryId}
                  initialConfirmed={false}
                  canUndo={item.review.canUndo}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
