"use client";

import type { PortalMilestone, PortalProject } from "@/lib/portal-page-model";
import { MacWindow, type WindowFrameProps } from "./mac-window";
import { UPNEXT_ID } from "./desktop-state";
import { easternDayKey, pixelDate } from "./format";

const MAX_ITEMS = 8;

interface Props extends WindowFrameProps {
  projects: PortalProject[];
}

interface Item {
  milestone: PortalMilestone;
  dateMs: number;
  projectName: string;
}

/** Upcoming milestones across in-progress projects, dated, soonest first, capped. */
export function upcomingMilestones(projects: PortalProject[], max: number = MAX_ITEMS): Item[] {
  const items: Item[] = [];
  for (const p of projects) {
    if (p.phase !== "in-progress") continue;
    for (const m of p.milestones) {
      if (m.state === "delivered" || m.dateMs === null) continue;
      items.push({ milestone: m, dateMs: m.dateMs, projectName: p.name });
    }
  }
  items.sort((a, b) => a.dateMs - b.dateMs);
  return items.slice(0, max);
}

export function UpNextWindow({ projects, ...frame }: Props) {
  const items = upcomingMilestones(projects);
  const groups: { key: string; dateMs: number; items: Item[] }[] = [];
  for (const it of items) {
    const key = easternDayKey(it.dateMs);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(it);
    else groups.push({ key, dateMs: it.dateMs, items: [it] });
  }

  return (
    <MacWindow {...frame} id={UPNEXT_ID} title="Up next" canClose className="portal-window-upnext">
      {groups.length === 0 ? (
        <p className="portal-quiet">Nothing scheduled yet. We&apos;ll add dates as the project plans firm up.</p>
      ) : (
        <ol className="portal-upnext">
          {groups.map((g) => (
            <li key={g.key} className="portal-upnext-day">
              <span className="portal-upnext-date">{pixelDate(g.dateMs)}</span>
              <ul className="portal-upnext-items">
                {g.items.map(({ milestone: m, projectName }) => (
                  <li key={m.id} className="portal-upnext-item">
                    <span className="portal-upnext-label">
                      {m.label}
                      {m.sublabel && <span className="portal-upnext-sub"> {m.sublabel}</span>}
                    </span>
                    <span className="portal-upnext-project">{projectName}</span>
                    {m.state === "in-review" && <span className="portal-upnext-waiting">waiting on your feedback</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </MacWindow>
  );
}
