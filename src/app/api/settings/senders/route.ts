import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserEmail } from "@/lib/get-session-user";
import { WORKSPACE_ID } from "@/lib/custom-field-ids";
import { clickupUserToMember, type WorkspaceMember } from "@/lib/allowed-senders";

interface AllowedSenderRow {
  clickupUserId: number;
  addedBy: string;
  addedAt: string;
  member: WorkspaceMember | null;
}

async function fetchWorkspaceMembers(): Promise<WorkspaceMember[]> {
  const res = await fetch("https://api.clickup.com/api/v2/team", {
    headers: {
      Authorization: process.env.CLICKUP_API_TOKEN ?? "",
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) return [];
  const { teams } = await res.json();
  const team =
    (teams ?? []).find((t: { id: string }) => t.id === WORKSPACE_ID) ??
    (teams ?? [])[0];
  if (!team?.members) return [];
  return team.members.map(clickupUserToMember);
}

export async function GET() {
  try {
    const [rows, members] = await Promise.all([
      prisma.allowedSender.findMany({ orderBy: { addedAt: "desc" } }),
      fetchWorkspaceMembers(),
    ]);
    const byId = new Map(members.map((m) => [m.id, m]));
    const data: AllowedSenderRow[] = rows.map((r) => ({
      clickupUserId: r.clickupUserId,
      addedBy: r.addedBy,
      addedAt: r.addedAt.toISOString(),
      member: byId.get(r.clickupUserId) ?? null,
    }));
    return NextResponse.json({ senders: data });
  } catch (error) {
    console.error("Failed to list allowed senders:", error);
    return NextResponse.json({ senders: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const clickupUserId = Number(body?.clickupUserId);
    if (!Number.isInteger(clickupUserId) || clickupUserId <= 0) {
      return NextResponse.json(
        { error: "clickupUserId is required and must be a positive integer" },
        { status: 400 }
      );
    }
    const addedBy = await getSessionUserEmail();
    try {
      await prisma.allowedSender.create({ data: { clickupUserId, addedBy } });
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002") {
        return NextResponse.json({ error: "Already added" }, { status: 409 });
      }
      throw e;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to add allowed sender:", error);
    return NextResponse.json({ error: "Failed to add sender" }, { status: 500 });
  }
}
