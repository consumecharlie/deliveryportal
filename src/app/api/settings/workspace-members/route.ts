import { NextResponse } from "next/server";
import { WORKSPACE_ID } from "@/lib/custom-field-ids";
import type { WorkspaceMember } from "@/lib/allowed-senders";

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
    const members: WorkspaceMember[] = (team?.members ?? []).map((m: {
      user: { id: number; username: string; email: string; profilePicture?: string };
    }) => {
      const u = m.user;
      const name = (u.username ?? u.email ?? "").trim();
      const initials = name
        .split(/[\s.@]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => (p[0] ?? "").toUpperCase())
        .join("");
      return {
        id: u.id ?? 0,
        username: u.username ?? "",
        email: u.email ?? "",
        profilePicture: u.profilePicture ?? undefined,
        initials,
      };
    });
    members.sort((a, b) => a.username.localeCompare(b.username));
    return NextResponse.json({ members });
  } catch (error) {
    console.error("Failed to fetch workspace members:", error);
    return NextResponse.json({ members: [] }, { status: 500 });
  }
}
