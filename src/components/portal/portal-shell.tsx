import Link from "next/link";
import { PacMark } from "./pac-mark";
import { ReachOutPanel } from "./reach-out-panel";

interface Props {
  token: string;
  clientName: string;
  /** Project page: the project shown, with a breadcrumb back to the client. */
  project?: { listId: string; name: string; summary: string };
  /** Client page: the counts line under the name. */
  counts?: { inProgress: number; completed: number };
  children: React.ReactNode;
}

function countsLine({ inProgress, completed }: { inProgress: number; completed: number }): string {
  const parts: string[] = [];
  if (inProgress > 0) parts.push(`${inProgress} ${inProgress === 1 ? "project" : "projects"} in progress`);
  if (completed > 0) parts.push(`${completed} completed`);
  if (parts.length === 0) return "Nothing has been shared here yet";
  return parts.join(", ");
}

export function PortalShell({ token, clientName, project, counts, children }: Props) {
  return (
    <div className="portal">
      <header className="portal-top">
        <div className="portal-brand">
          <PacMark size={28} title="Consume Media" />
          <span className="portal-brand-name">Consume Media</span>
        </div>
        <ReachOutPanel token={token} listId={project?.listId} />
      </header>

      <div className="portal-head">
        {project ? (
          <>
            <nav aria-label="Breadcrumb" className="portal-crumb">
              <Link href={`/portal/${token}`}>{clientName}</Link>
            </nav>
            <h1 className="portal-h1 portal-h1-project">{project.name}</h1>
            <p className="portal-lede">{project.summary}</p>
          </>
        ) : (
          <>
            <h1 className="portal-h1">{clientName}</h1>
            {counts && <p className="portal-lede">{countsLine(counts)}</p>}
          </>
        )}
      </div>

      {children}
    </div>
  );
}
