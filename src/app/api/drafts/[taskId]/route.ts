import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/drafts/[taskId]
 *
 * Get a specific draft by task ID.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  try {
    const draft = await prisma.draft.findUnique({
      where: { taskId },
    });

    if (!draft) {
      return NextResponse.json({ draft: null });
    }

    return NextResponse.json({ draft });
  } catch (error) {
    console.error("Failed to fetch draft:", error);
    return NextResponse.json({ draft: null });
  }
}

/**
 * PUT /api/drafts/[taskId]
 *
 * Update a draft's portal-side data (auto-save from the form).
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  try {
    const body = await req.json();

    const draft = await prisma.draft.upsert({
      where: { taskId },
      update: {
        formData: body.formData,
        savedBy: body.savedBy ?? "portal-user",
        savedAt: new Date(),
      },
      create: {
        taskId,
        formData: body.formData,
        savedBy: body.savedBy ?? "portal-user",
      },
    });

    return NextResponse.json({ draft });
  } catch (error) {
    console.error("Failed to save draft:", error);
    return NextResponse.json(
      { error: "Failed to save draft" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/drafts/[taskId]
 *
 * Delete a draft (e.g., after sending).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  try {
    await prisma.draft.deleteMany({ where: { taskId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete draft:", error);
    return NextResponse.json(
      { error: "Failed to delete draft" },
      { status: 500 }
    );
  }
}
