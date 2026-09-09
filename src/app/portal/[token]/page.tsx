import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { resolveAccess, loadPortalPage } from "@/lib/portal-data";
import type { PortalPageModel } from "@/lib/portal-page-model";
import { recordView } from "@/lib/portal-views";
import { Desktop } from "@/components/portal/desktop";
import { isPortalSandbox } from "@/lib/portal-sandbox";

export const dynamic = "force-dynamic";

async function load(token: string): Promise<PortalPageModel> {
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
  return <Desktop token={token} model={model} sandbox={isPortalSandbox()} />;
}
