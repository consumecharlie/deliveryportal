import Link from "next/link";
import { PacMark } from "./pac-mark";
import { ReachOutPanel } from "./reach-out-panel";

interface Props {
  token: string;
  clientName: string;
  /** Project page: the project shown, with a breadcrumb back to the client. */
  project?: { listId: string; name: string; summary: string };
  /** Client page: the counts line under the name, built by the data layer; "" or undefined hides it. */
  countsLabel?: string;
  children: React.ReactNode;
}

export function PortalShell({ token, clientName, project, countsLabel, children }: Props) {
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
            {countsLabel && <p className="portal-lede">{countsLabel}</p>}
          </>
        )}
      </div>

      {children}
    </div>
  );
}
