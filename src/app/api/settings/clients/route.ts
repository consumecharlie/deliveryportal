import { NextResponse } from "next/server";
import { getSpaceFolders } from "@/lib/clickup";
import { SPACES } from "@/lib/custom-field-ids";

export async function GET() {
  try {
    const { folders } = await getSpaceFolders(SPACES.PROJECTS);
    const clients = folders
      .map((f) => ({ folderId: f.id, name: f.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ clients });
  } catch (error) {
    console.error("Failed to list clients:", error);
    return NextResponse.json({ clients: [] }, { status: 500 });
  }
}
