import { NextResponse } from "next/server";
import { WORKSPACE_ID } from "@/lib/custom-field-ids";
import { clickupUserToMember, type WorkspaceMember } from "@/lib/allowed-senders";

export async function GET() {
  try {
    const res = await fetch("https://api.clickup.com/api/v2/team", {
      headers: {
        Authorization: process.env.CLICKUP_API_TOKEN ?? "",
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      return NextResponse.json({ members: [] }, { status: 502 });
    }
    const { teams } = await res.json();
    const team =
      (teams ?? []).find((t: { id: string }) => t.id === WORKSPACE_ID) ??
      (teams ?? [])[0];
    const members: WorkspaceMember[] = (team?.members ?? []).map(clickupUserToMember);
    members.sort((a, b) => a.username.localeCompare(b.username));
    return NextResponse.json({ members });
  } catch (error) {
    console.error("Failed to fetch workspace members:", error);
    return NextResponse.json({ members: [] }, { status: 500 });
  }
}
