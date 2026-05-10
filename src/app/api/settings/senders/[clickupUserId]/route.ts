import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ clickupUserId: string }> }
) {
  try {
    const { clickupUserId: idStr } = await params;
    const clickupUserId = Number(idStr);
    if (!Number.isInteger(clickupUserId) || clickupUserId <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    try {
      await prisma.allowedSender.delete({ where: { clickupUserId } });
    } catch (e) {
      if ((e as { code?: string })?.code === "P2025") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      throw e;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to remove allowed sender:", error);
    return NextResponse.json({ error: "Failed to remove sender" }, { status: 500 });
  }
}
