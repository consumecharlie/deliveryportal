// The signed-in user's own connection statuses (never returns tokens).
import { NextResponse } from "next/server";
import { getSessionUserEmail } from "@/lib/get-session-user";
import { describeConnection, listConnections } from "@/lib/connections";
import { isConfigured } from "@/lib/oauth-providers";

export async function GET() {
  const userEmail = await getSessionUserEmail();
  if (!userEmail) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const rows = await listConnections(userEmail);
  const providers = (["google", "slack"] as const).map((provider) => {
    const record = rows.find((r) => r.provider === provider) ?? null;
    return {
      provider,
      configured: isConfigured(provider),
      ...describeConnection(record),
      lastError: record?.lastError ?? null,
      externalLabel: record?.externalLabel ?? null,
    };
  });

  return NextResponse.json({ userEmail, providers });
}
