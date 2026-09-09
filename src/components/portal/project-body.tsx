"use client";

import type { PortalProject } from "@/lib/portal-page-model";
import { RoadmapRail } from "./roadmap-rail";
import { DeliverablesTable } from "./deliverables-table";

/**
 * One project as the viewer shows it: the name and summary heading, the
 * roadmap rail while anything is ahead (archived projects have none), and
 * the deliverables table.
 */
export function ProjectBody({
  token,
  project,
  defaultOpenRows = false,
}: {
  token: string;
  project: PortalProject;
  defaultOpenRows?: boolean;
}) {
  return (
    <div className="portal-project">
      <div className="portal-project-head">
        <h3 className="portal-project-name">{project.name}</h3>
        {project.summary && <p className="portal-project-summary">{project.summary}</p>}
      </div>
      <RoadmapRail milestones={project.milestones} />
      <DeliverablesTable token={token} deliverables={project.deliverables} defaultOpen={defaultOpenRows} />
    </div>
  );
}
