import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { resolveAccess, loadPortalPage } from "@/lib/portal-data";
import type { PortalPageModel } from "@/lib/portal-page-model";
import { recordView } from "@/lib/portal-views";
import { Desktop } from "@/components/portal/desktop";

export const dynamic = "force-dynamic";

async function load(token: string, listId: string): Promise<PortalPageModel> {
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
  return <Desktop token={token} model={{ ...model, focusListId: listId }} />;
}
