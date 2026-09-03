import Link from "next/link";
import type { PortalProject } from "@/lib/portal-page-model";
import { RoadmapRail } from "./roadmap-rail";
import { DeliverablesTable } from "./deliverables-table";
import { Disclosure } from "./disclosure";

interface SectionProps {
  token: string;
  project: PortalProject;
  /** Client page links the name to the project page; the project page does not. */
  linkName: boolean;
  /** Project page: rows start expanded so every version is listed. */
  expandRows?: boolean;
  /** Project page: the name and summary already sit in the page title, so the section has no heading. */
  hideHeading?: boolean;
}

export function ProjectSection({ token, project, linkName, expandRows = false, hideHeading = false }: SectionProps) {
  return (
    <section className="portal-project" aria-label={hideHeading ? project.name : undefined} aria-labelledby={hideHeading ? undefined : `p-${project.listId}`}>
      {!hideHeading && (
        <div className="portal-project-head">
          <h2 id={`p-${project.listId}`} className="portal-h2">
            {linkName ? (
              <Link href={`/portal/${token}/${project.listId}`} className="portal-project-link">
                {project.name}
              </Link>
            ) : (
              project.name
            )}
          </h2>
          {project.summary && <p className="portal-project-summary">{project.summary}</p>}
        </div>
      )}
      <RoadmapRail milestones={project.milestones} />
      <DeliverablesTable token={token} deliverables={project.deliverables} defaultOpen={expandRows} />
    </section>
  );
}

interface CompletedProps {
  token: string;
  projects: PortalProject[];
  /** Open the group when the focused project is inside it. */
  focusListId: string | null;
}

/** Completed projects sit under one disclosure at the bottom, collapsed by default. */
export function CompletedProjects({ token, projects, focusListId }: CompletedProps) {
  if (projects.length === 0) return null;
  const open = focusListId !== null && projects.some((p) => p.listId === focusListId);
  return (
    <Disclosure
      className="portal-completed"
      defaultOpen={open}
      label={<span className="portal-h3">Completed projects ({projects.length})</span>}
    >
      <div className="portal-completed-list">
        {projects.map((p) => (
          <ProjectSection key={p.listId} token={token} project={p} linkName />
        ))}
      </div>
    </Disclosure>
  );
}
