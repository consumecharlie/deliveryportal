import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { resolveAccess, loadPortalPage } from "@/lib/portal-data";
import { fixturePortalPage } from "@/lib/portal-page.fixture";
import type { PortalPageModel } from "@/lib/portal-page-model";
import { recordView } from "@/lib/portal-views";
import { PortalShell } from "@/components/portal/portal-shell";
import { AttentionList } from "@/components/portal/attention-list";
import { ProjectSection } from "@/components/portal/project-section";

export const dynamic = "force-dynamic";

async function load(token: string, listId: string): Promise<PortalPageModel> {
  if (process.env.PORTAL_FIXTURE === "1") return fixturePortalPage(token, listId);
  const access = await resolveAccess(token);
  if (!access) notFound();
  // Scoping guard: deliveries are queried by the token's client folder, so a
  // project outside that folder yields no rows and the page does not exist.
  const model = await loadPortalPage(access, listId);
  const userAgent = (await headers()).get("user-agent");
  after(() => recordView(access.id, null, userAgent));
  return model;
}

export default async function ProjectPortalPage({
  params,
}: {
  params: Promise<{ token: string; listId: string }>;
}) {
  const { token, listId } = await params;
  const model = await load(token, listId);
  const project = model.projects.find((p) => p.listId === listId);
  if (!project) notFound();

  return (
    <PortalShell
      token={token}
      clientName={model.clientName}
      project={{ listId: project.listId, name: project.name, summary: project.summary }}
    >
      <AttentionList token={token} items={model.attention.filter((a) => a.projectListId === listId)} />
      <div className="portal-projects">
        <ProjectSection token={token} project={project} linkName={false} expandRows hideHeading />
      </div>
    </PortalShell>
  );
}
