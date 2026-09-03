import { notFound } from "next/navigation";
import { resolveAccess, loadPortal } from "@/lib/portal-data";
import { recordView } from "@/lib/portal-views";
import { PortalHeader } from "@/components/portal/portal-header";
import { ActionItems } from "@/components/portal/action-items";
import { DeliverableCard } from "@/components/portal/deliverable-card";
import { toCardGroup, toCardStatus } from "@/lib/portal-view-model";

export const dynamic = "force-dynamic";

export default async function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await resolveAccess(token);
  if (!access) notFound();
  const data = await loadPortal(access);
  await recordView(access.id, null);

  return (
    <>
      <PortalHeader clientName={access.clientName} crumbs={[]} />
      <ActionItems token={token} items={data.actionItems} />
      <section className="mt-10 space-y-10">
        {data.timeline.projects.map((p) => (
          <div key={p.listId || `name:${p.name}`}>
            <h2 className="mb-4 text-lg font-semibold">
              {p.listId ? (
                <a href={`/portal/${token}/${p.listId}`} className="hover:underline">
                  {p.name}
                </a>
              ) : (
                p.name
              )}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {p.deliverables.map((g) => (
                <DeliverableCard
                  key={g.latest.id}
                  token={token}
                  group={toCardGroup(g)}
                  status={toCardStatus(data.status[g.latest.id])}
                />
              ))}
            </div>
          </div>
        ))}
        {data.timeline.projects.length === 0 && (
          <p className="text-neutral-500">
            Nothing has been shared here yet. Deliverables will appear as soon as we send them.
          </p>
        )}
      </section>
    </>
  );
}
