import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ folderId: string }> }
) {
  try {
    const { folderId } = await params;
    try {
      await prisma.clientPreference.delete({ where: { clientFolderId: folderId } });
    } catch (e) {
      if ((e as { code?: string })?.code === "P2025") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      throw e;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete client preference:", error);
    return NextResponse.json({ error: "Failed to delete preference" }, { status: 500 });
  }
}
