/**
 * Which ClickUp lists in a client's folder the portal shows as projects.
 *
 * Projects used to be derived from Delivery rows alone, so a project whose
 * ClickUp plan was full of upcoming milestones stayed invisible to the client
 * until the first send. The folder's lists are the real project index: every
 * active project appears from kickoff and its deliverables fill in as we send
 * them. Pure, no I/O: `portal-data.ts` loads the folder listing and the live
 * payloads, this decides.
 */
import type { LivePayload } from "@/lib/portal-live";

/** A project the portal should show, found in the client's ClickUp folder. */
export interface DiscoveredProject {
  listId: string;
  /** The ClickUp list name, which is the source of truth for the project name. */
  name: string;
  archived: boolean;
}

export interface SelectProjectListsInput {
  /** The folder's active lists, from `getClientFolderLists`. */
  folderLists: Array<{ id: string; name: string }>;
  /** listId -> live payload; its milestones say whether a list is a real project. */
  live: Record<string, LivePayload>;
  /** Every list the client already has a delivery on. */
  deliveryListIds: Iterable<string>;
}

/**
 * The folder's lists that count as projects:
 *
 * - Active list: it has at least one Delivery Deadline milestone, or at least
 *   one delivery. That drops empty intake and kickoff lists (no tasks, no
 *   sends) without knowing their names.
 * - Archived list: only when it has deliveries. Archived roadmaps are history
 *   and a client can have a dozen of them, so completed projects stay
 *   delivery-driven. (The folder listing itself excludes archived lists; this
 *   rule only catches a list archived since the listing was cached.)
 *
 * Deliveries pointing at a list that is not in the listing at all still
 * become projects: `buildPortalPage` adds them from the rows, so nothing a
 * client has already received can disappear.
 */
export function selectProjectLists(input: SelectProjectListsInput): DiscoveredProject[] {
  const withDeliveries = new Set(Array.from(input.deliveryListIds).filter(Boolean));
  const seen = new Set<string>();
  const out: DiscoveredProject[] = [];
  for (const list of input.folderLists) {
    if (!list.id || seen.has(list.id)) continue;
    const live = input.live[list.id];
    const archived = Boolean(live?.archived);
    const hasDeliveries = withDeliveries.has(list.id);
    const hasMilestones = (live?.milestones.length ?? 0) > 0;
    if (archived ? !hasDeliveries : !hasMilestones && !hasDeliveries) continue;
    seen.add(list.id);
    out.push({ listId: list.id, name: list.name, archived });
  }
  return out;
}
