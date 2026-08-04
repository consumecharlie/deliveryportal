import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserEmail } from "@/lib/get-session-user";
import type { ClientPreferenceData } from "@/lib/client-preferences";

export async function GET() {
  try {
    const rows = await prisma.clientPreference.findMany({
      orderBy: { clientName: "asc" },
    });
    return NextResponse.json({ preferences: rows });
  } catch (error) {
    console.error("Failed to list client preferences:", error);
    return NextResponse.json({ preferences: [] }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<ClientPreferenceData>;
    const clientFolderId = String(body.clientFolderId ?? "").trim();
    const clientName = String(body.clientName ?? "").trim();
    if (!clientFolderId || !clientName) {
      return NextResponse.json(
        { error: "clientFolderId and clientName are required" },
        { status: 400 }
      );
    }
    const updatedBy = await getSessionUserEmail();
    const data = {
      clientName,
      enabled: body.enabled ?? true,
      warningMessage: String(body.warningMessage ?? "").trim(),
      destinationLink: body.destinationLink?.trim() || null,
      restrictions: Array.isArray(body.restrictions) ? body.restrictions : [],
      customBlockedDomains: Array.isArray(body.customBlockedDomains)
        ? body.customBlockedDomains.map((d) => d.trim()).filter(Boolean)
        : [],
      deliverableLinkLabel: body.deliverableLinkLabel?.trim() || null,
      updatedBy,
    };
    const saved = await prisma.clientPreference.upsert({
      where: { clientFolderId },
      create: { clientFolderId, ...data },
      update: data,
    });
    return NextResponse.json({ preference: saved });
  } catch (error) {
    console.error("Failed to save client preference:", error);
    return NextResponse.json({ error: "Failed to save preference" }, { status: 500 });
  }
}
