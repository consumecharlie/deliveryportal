import { notFound } from "next/navigation";
import { resolveAccess, loadPortal } from "@/lib/portal-data";
import { recordView } from "@/lib/portal-views";
import { PortalHeader } from "@/components/portal/portal-header";
import { ActionItems } from "@/components/portal/action-items";
import { DeliverableCard } from "@/components/portal/deliverable-card";

export const dynamic = "force-dynamic";

export default async function ProjectPortalPage({
  params,
}: {
  params: Promise<{ token: string; listId: string }>;
}) {
  const { token, listId } = await params;
  const access = await resolveAccess(token);
  if (!access) notFound();
  // Scoping guard: deliveries are queried by the token's client folder, so a
  // project outside that folder yields no rows and the page does not exist.
  const data = await loadPortal(access, listId);
  const project = data.timeline.projects.find((p) => p.listId === listId);
  if (!project) notFound();
  await recordView(access.id, null);

  return (
    <>
      <PortalHeader
        clientName={access.clientName}
        title={project.name}
        crumbs={[{ label: access.clientName, href: `/portal/${token}` }]}
      />
      <ActionItems token={token} items={data.actionItems} />
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">Everything we have shared</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {project.deliverables.map((g) => (
            <DeliverableCard key={g.latest.id} token={token} group={g} status={data.status[g.latest.id]} />
          ))}
        </div>
      </section>
    </>
  );
}
