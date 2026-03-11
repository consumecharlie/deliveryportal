import { NextResponse } from "next/server";
import {
  getSpaceFolders,
  getFolderlessLists,
  getListTasks,
  extractCustomFieldValue,
} from "@/lib/clickup";
import {
  CUSTOM_FIELDS,
  PROJECT_TASK_TYPES,
  SPACES,
} from "@/lib/custom-field-ids";

interface ContactRecord {
  taskId: string;
  name: string;
  email: string;
  role: string;
  slackHandle?: string;
  slackUserId?: string;
  projectName: string;
  clientName: string;
  listId: string;
}

/**
 * In-memory server-side cache for contacts.
 * Contacts change infrequently, so we cache for 10 minutes.
 */
let contactsCache: { data: ContactRecord[]; timestamp: number } | null = null;
const CACHE_TTL = 10 * 60_000; // 10 minutes

/**
 * GET /api/contacts/all
 *
 * Returns all project contacts across the entire Projects space.
 * Includes Slack User ID and handle for @mention autocomplete.
 *
 * Optionally filter by ?listId= to only get contacts for a specific project.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filterListId = searchParams.get("listId");

    // Return from cache if still fresh
    if (contactsCache && Date.now() - contactsCache.timestamp < CACHE_TTL) {
      const contacts = filterListId
        ? contactsCache.data.filter((c) => c.listId === filterListId)
        : contactsCache.data;
      return NextResponse.json({ contacts });
    }

    // Fetch full workspace hierarchy to get all project lists
    const [foldersRes, folderlessRes] = await Promise.all([
      getSpaceFolders(SPACES.PROJECTS),
      getFolderlessLists(SPACES.PROJECTS),
    ]);

    const allLists: Array<{
      id: string;
      name: string;
      clientName: string;
    }> = [];

    for (const folder of foldersRes.folders) {
      for (const list of folder.lists) {
        allLists.push({
          id: list.id,
          name: list.name,
          clientName: folder.name,
        });
      }
    }

    for (const list of folderlessRes.lists) {
      allLists.push({
        id: list.id,
        name: list.name,
        clientName: "Ungrouped",
      });
    }

    // Fetch contacts from all lists in parallel (batched to avoid rate limits)
    const BATCH_SIZE = 5;
    const allContacts: ContactRecord[] = [];

    for (let i = 0; i < allLists.length; i += BATCH_SIZE) {
      const batch = allLists.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (list) => {
          const tasksRes = await getListTasks(list.id, true);
          const contacts: ContactRecord[] = [];

          for (const task of tasksRes.tasks) {
            const taskType = extractCustomFieldValue(
              task.custom_fields,
              CUSTOM_FIELDS.PROJECT_TASK_TYPE
            );
            const rawType = task.custom_fields.find(
              (f) => f.id === CUSTOM_FIELDS.PROJECT_TASK_TYPE
            )?.value;

            const isContact =
              taskType === "Project Contact" ||
              String(rawType) === PROJECT_TASK_TYPES.PROJECT_CONTACT;

            if (!isContact) continue;

            const email =
              extractCustomFieldValue(
                task.custom_fields,
                CUSTOM_FIELDS.CONTACT_EMAIL
              ) ?? "";
            if (!email) continue; // Skip contacts without email

            contacts.push({
              taskId: task.id,
              name:
                extractCustomFieldValue(
                  task.custom_fields,
                  CUSTOM_FIELDS.CONTACT_FIRST_NAME
                ) ?? task.name,
              email,
              role:
                extractCustomFieldValue(
                  task.custom_fields,
                  CUSTOM_FIELDS.CONTACT_ROLE
                ) ?? "Standard",
              slackHandle:
                extractCustomFieldValue(
                  task.custom_fields,
                  CUSTOM_FIELDS.SLACK_HANDLE
                ) ?? undefined,
              slackUserId:
                extractCustomFieldValue(
                  task.custom_fields,
                  CUSTOM_FIELDS.SLACK_USER_ID
                ) ?? undefined,
              projectName: list.name,
              clientName: list.clientName,
              listId: list.id,
            });
          }

          return contacts;
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          allContacts.push(...result.value);
        }
      }
    }

    // De-duplicate contacts by email (keep the one with the most Slack data)
    const contactsByEmail = new Map<string, ContactRecord>();
    for (const contact of allContacts) {
      const existing = contactsByEmail.get(contact.email);
      if (
        !existing ||
        (contact.slackUserId && !existing.slackUserId) ||
        (contact.slackHandle && !existing.slackHandle)
      ) {
        contactsByEmail.set(contact.email, contact);
      }
    }

    const dedupedContacts = Array.from(contactsByEmail.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    // Update cache
    contactsCache = { data: allContacts, timestamp: Date.now() };

    const contacts = filterListId
      ? allContacts.filter((c) => c.listId === filterListId)
      : dedupedContacts;

    return NextResponse.json({ contacts });
  } catch (error) {
    console.error("Failed to fetch contacts:", error);
    return NextResponse.json(
      { error: "Failed to fetch contacts" },
      { status: 500 }
    );
  }
}
