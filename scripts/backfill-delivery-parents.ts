/**
 * One-time backfill: fill Delivery.parentTaskId / parentTaskName / shareTaskName
 * from ClickUp for rows that have neither. Idempotent: a row is skipped once
 * either column is set. One getTask per delivery, one per distinct parent
 * (cached). Run:
 *   npx --yes tsx --env-file=.env.local scripts/backfill-delivery-parents.ts
 */
import { prisma } from "../src/lib/db";
import { getTask } from "../src/lib/clickup";
import { resolveParentName, type ParentNameCache } from "../src/lib/delivery-identity";

async function main() {
  const rows = await prisma.delivery.findMany({
    where: { parentTaskId: null, shareTaskName: null },
    select: { id: true, taskId: true, deliverableType: true, projectName: true },
    orderBy: { sentAt: "asc" },
  });
  console.log(`deliveries to backfill: ${rows.length}`);

  const parentNames: ParentNameCache = new Map();
  let updated = 0;
  let withoutParent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const task = await getTask(row.taskId);
      const parentTaskId = task.parent || null;
      const parentTaskName = parentTaskId ? await resolveParentName(parentTaskId, parentNames) : null;
      if (parentTaskId && parentTaskName === null) {
        // Parent lookup failed; leave the row untouched so a rerun retries it.
        throw new Error(`parent ${parentTaskId} could not be fetched`);
      }
      await prisma.delivery.update({
        where: { id: row.id },
        data: { shareTaskName: task.name || null, parentTaskId, parentTaskName },
      });
      updated++;
      if (!parentTaskId) withoutParent++;
      console.log(
        `${row.id} (${row.projectName} / ${row.deliverableType}): "${task.name}" -> parent ${
          parentTaskId ? `${parentTaskId} "${parentTaskName}"` : "none"
        }`
      );
    } catch (err) {
      failed++;
      console.warn(`${row.id} (${row.projectName} / ${row.deliverableType}) task ${row.taskId}: FAILED`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `done: ${updated} updated (${withoutParent} without parent), ${failed} failed, ${parentNames.size} distinct parents`
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
