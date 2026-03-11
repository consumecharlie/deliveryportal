import { NextResponse } from "next/server";
import {
  getSpaceFolders,
  getFolderlessLists,
  getFolderLists,
} from "@/lib/clickup";
import { SPACES } from "@/lib/custom-field-ids";

/**
 * GET /api/projects?archived=false
 *
 * Lists all projects (lists) grouped by client (folder) from the Projects space.
 * Pass ?archived=true to also include archived folders AND archived lists
 * within active folders.
 */

interface ProjectSummary {
  listId: string;
  name: string;
  archived: boolean;
}

interface ClientWithProjects {
  folderId: string;
  name: string;
  archived: boolean;
  projects: ProjectSummary[];
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const includeArchived = url.searchParams.get("archived") === "true";

    // Always fetch active folders + folderless lists
    const [activeFoldersRes, activeFolderlessRes] = await Promise.all([
      getSpaceFolders(SPACES.PROJECTS, false),
      getFolderlessLists(SPACES.PROJECTS, false),
    ]);

    const clients: ClientWithProjects[] = [];

    // Build client list from active folders
    for (const folder of activeFoldersRes.folders) {
      clients.push({
        folderId: folder.id,
        name: folder.name,
        archived: false,
        projects: folder.lists.map((list) => ({
          listId: list.id,
          name: list.name,
          archived: false,
        })),
      });
    }

    if (includeArchived) {
      // Fetch archived lists WITHIN each active folder (in parallel)
      const archivedListFetches = clients.map((client) =>
        getFolderLists(client.folderId, true).catch(() => ({ lists: [] }))
      );

      // Also fetch fully archived folders + archived folderless lists
      const [archivedFoldersRes, archivedFolderlessRes, ...archivedListResults] =
        await Promise.all([
          getSpaceFolders(SPACES.PROJECTS, true),
          getFolderlessLists(SPACES.PROJECTS, true),
          ...archivedListFetches,
        ]);

      // Merge archived lists into their active parent folders
      for (let i = 0; i < clients.length; i++) {
        const archivedLists = archivedListResults[i]?.lists ?? [];
        const existingIds = new Set(clients[i].projects.map((p) => p.listId));
        for (const list of archivedLists) {
          if (!existingIds.has(list.id)) {
            clients[i].projects.push({
              listId: list.id,
              name: list.name,
              archived: true,
            });
          }
        }
      }

      // Add fully archived folders (ones not already in active list)
      const seenFolderIds = new Set(clients.map((c) => c.folderId));
      for (const folder of archivedFoldersRes.folders) {
        if (seenFolderIds.has(folder.id)) continue;
        clients.push({
          folderId: folder.id,
          name: folder.name,
          archived: true,
          projects: folder.lists.map((list) => ({
            listId: list.id,
            name: list.name,
            archived: true,
          })),
        });
      }

      // Add archived folderless lists
      const seenListIds = new Set(
        activeFolderlessRes.lists.map((l: { id: string }) => l.id)
      );
      for (const list of archivedFolderlessRes.lists) {
        if (!seenListIds.has(list.id)) {
          activeFolderlessRes.lists.push(list);
        }
      }
    }

    // Sort: active first, then alphabetical
    clients.sort((a, b) => {
      if (a.archived !== b.archived) return a.archived ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    // Within each client, sort: active first, then alphabetical
    for (const client of clients) {
      client.projects.sort((a, b) => {
        if (a.archived !== b.archived) return a.archived ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
    }

    // Folderless projects
    const folderlessProjects: ProjectSummary[] = activeFolderlessRes.lists.map(
      (list: { id: string; name: string }) => ({
        listId: list.id,
        name: list.name,
        archived: false, // We don't track this granularly for folderless
      })
    );

    return NextResponse.json({
      clients,
      folderlessProjects,
    });
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}
