import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { resolveAccess, loadPortalPage } from "@/lib/portal-data";
import { fixturePortalPage } from "@/lib/portal-page.fixture";
import type { PortalPageModel } from "@/lib/portal-page-model";
import { recordView } from "@/lib/portal-views";
import { PortalShell } from "@/components/portal/portal-shell";
import { AttentionList } from "@/components/portal/attention-list";
import { ProjectSection, CompletedProjects } from "@/components/portal/project-section";

export const dynamic = "force-dynamic";

async function load(token: string): Promise<PortalPageModel> {
  if (process.env.PORTAL_FIXTURE === "1") return fixturePortalPage(token);
  const access = await resolveAccess(token);
  if (!access) notFound();
  const model = await loadPortalPage(access);
  const userAgent = (await headers()).get("user-agent");
  after(() => recordView(access.id, null, userAgent));
  return model;
}

export default async function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const model = await load(token);
  const active = model.projects.filter((p) => p.phase === "in-progress");
  const completed = model.projects.filter((p) => p.phase === "completed");

  return (
    <PortalShell token={token} clientName={model.clientName} counts={model.counts}>
      <AttentionList token={token} items={model.attention} />

      {active.length > 0 && (
        <div className="portal-projects">
          {active.map((p) => (
            <ProjectSection key={p.listId} token={token} project={p} linkName />
          ))}
        </div>
      )}
      {model.projects.length === 0 && (
        <p className="portal-quiet">
          Nothing has been shared here yet. Deliverables will appear as soon as we send them.
        </p>
      )}

      <CompletedProjects
        token={token}
        projects={completed}
        focusListId={model.focusListId}
        standalone={active.length === 0}
      />
    </PortalShell>
  );
}
