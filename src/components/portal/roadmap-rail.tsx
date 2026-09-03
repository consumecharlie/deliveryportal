import type { PortalMilestone } from "@/lib/portal-page-model";
import { PacMark } from "./pac-mark";
import { shortDate } from "./format";

const MAX_MILESTONES = 10;
const KEEP_DELIVERED = 2;

interface Props {
  milestones: PortalMilestone[];
}

/**
 * When a project has more milestones than fit, keep the last two delivered
 * ones plus everything from the first undelivered milestone onward, and say
 * how many earlier ones were folded away.
 */
export function trimMilestones(milestones: PortalMilestone[]): { shown: PortalMilestone[]; earlier: number } {
  if (milestones.length <= MAX_MILESTONES) return { shown: milestones, earlier: 0 };
  let firstOpen = milestones.findIndex((m) => m.state !== "delivered");
  if (firstOpen === -1) firstOpen = milestones.length;
  const start = Math.max(0, firstOpen - KEEP_DELIVERED);
  return { shown: milestones.slice(start), earlier: start };
}

function Marker({ state }: { state: PortalMilestone["state"] }) {
  if (state === "up-next") {
    return <PacMark size={16} color="#DBEF00" className="portal-rail-pac" />;
  }
  return <span className={`portal-rail-dot portal-rail-dot-${state}`} />;
}

const STATE_TEXT: Record<PortalMilestone["state"], string> = {
  delivered: "Delivered",
  "in-review": "In review",
  "up-next": "Up next",
  planned: "Planned",
};

/** The one bold element on the page: the project's roadmap as a pellet rail. */
export function RoadmapRail({ milestones }: Props) {
  if (milestones.length === 0) return null;
  const { shown, earlier } = trimMilestones(milestones);
  const hasUpNext = shown.some((m) => m.state === "up-next");

  return (
    <div className="portal-rail-wrap">
      <ol className={`portal-rail${hasUpNext ? " portal-rail-has-next" : ""}`} aria-label="Project roadmap">
        {earlier > 0 && (
          <li className="portal-rail-item portal-rail-earlier">
            <span className="portal-rail-marker" aria-hidden="true">
              <span className="portal-rail-ellipsis" />
            </span>
            <span className="portal-rail-label">+{earlier} earlier</span>
          </li>
        )}
        {shown.map((m) => {
          const body = (
            <>
              {hasUpNext && (
                <span className="portal-rail-caption" aria-hidden={m.state !== "up-next"}>
                  {m.state === "up-next" ? "Up next" : ""}
                </span>
              )}
              <span className="portal-rail-marker" aria-hidden="true">
                <Marker state={m.state} />
              </span>
              <span className="portal-rail-label">{m.label}</span>
              {m.sublabel && <span className="portal-rail-sub">{m.sublabel}</span>}
              {m.dateMs !== null && <span className="portal-rail-date">{shortDate(m.dateMs)}</span>}
              <span className="portal-visually-hidden">, {STATE_TEXT[m.state]}</span>
            </>
          );
          const cls = `portal-rail-item portal-rail-item-${m.state}`;
          return (
            <li key={m.id} className={cls}>
              {m.state === "delivered" && m.deliveryId ? (
                <a href={`#d-${m.deliveryId}`} className="portal-rail-link">
                  {body}
                </a>
              ) : (
                <div className="portal-rail-link">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
