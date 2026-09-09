"use client";

import type { PortalProject } from "@/lib/portal-page-model";
import { MacWindow, type WindowFrameProps } from "./mac-window";
import { RoadmapRail } from "./roadmap-rail";
import { DeliverablesTable } from "./deliverables-table";
import { projectWindowId } from "./desktop-state";
import { truncate } from "./format";

const TITLE_MAX = 48;

interface Props extends WindowFrameProps {
  token: string;
  project: PortalProject;
  /** Project page: every row starts expanded so all versions are listed. */
  defaultOpenRows?: boolean;
}

/** One project: the summary heading, the roadmap rail, the deliverables table. */
export function ProjectWindow({ token, project, defaultOpenRows = false, ...frame }: Props) {
  return (
    <MacWindow
      {...frame}
      id={projectWindowId(project.listId)}
      title={truncate(project.name, TITLE_MAX)}
      ariaLabel={project.name}
      canClose
      className="portal-window-project"
    >
      <ProjectBody token={token} project={project} defaultOpenRows={defaultOpenRows} />
    </MacWindow>
  );
}

export function ProjectBody({
  token,
  project,
  defaultOpenRows = false,
  heading = true,
}: {
  token: string;
  project: PortalProject;
  defaultOpenRows?: boolean;
  heading?: boolean;
}) {
  return (
    <div className="portal-project">
      {heading && (
        <div className="portal-project-head">
          <h3 className="portal-project-name">{project.name}</h3>
          {project.summary && <p className="portal-project-summary">{project.summary}</p>}
        </div>
      )}
      <RoadmapRail milestones={project.milestones} />
      <DeliverablesTable token={token} deliverables={project.deliverables} defaultOpen={defaultOpenRows} />
    </div>
  );
}
