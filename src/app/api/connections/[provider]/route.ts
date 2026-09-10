// Disconnect: removes the stored tokens for the signed-in user.
import { NextResponse } from "next/server";
import { getSessionUserEmail } from "@/lib/get-session-user";
import { deleteConnection, type Provider } from "@/lib/connections";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  if (provider !== "google" && provider !== "slack") {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }
  const userEmail = await getSessionUserEmail();
  if (!userEmail) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  await deleteConnection(userEmail, provider as Provider);
  return NextResponse.json({ ok: true });
}
