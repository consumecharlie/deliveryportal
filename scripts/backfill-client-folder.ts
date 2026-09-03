/**
 * One-time backfill: fill Delivery.clientFolderId and DeliveryLink.clientFolderId
 * from ClickUp (list -> folder). Idempotent. Run:
 *   npx tsx --env-file=.env.local scripts/backfill-client-folder.ts
 */
import { prisma } from "../src/lib/db";
import { resolveClientFolderId } from "../src/lib/clickup";

async function main() {
  const rows = await prisma.delivery.findMany({
    where: { OR: [{ clientFolderId: null }, { clientFolderId: "" }], projectListId: { not: null } },
    select: { projectListId: true },
    distinct: ["projectListId"],
  });
  console.log(`lists to resolve: ${rows.length}`);
  let updated = 0;
  let failed = 0;
  for (const { projectListId } of rows) {
    if (!projectListId) continue;
    try {
      const folderId = await resolveClientFolderId(projectListId);
      if (!folderId) {
        console.warn("no folder for list (folderless or lookup failed), skipping", projectListId);
        failed++;
        continue;
      }
      const d = await prisma.delivery.updateMany({
        where: { projectListId, OR: [{ clientFolderId: null }, { clientFolderId: "" }] },
        data: { clientFolderId: folderId },
      });
      const l = await prisma.deliveryLink.updateMany({
        where: { projectListId, clientFolderId: "" },
        data: { clientFolderId: folderId },
      });
      updated += d.count;
      console.log(`${projectListId} -> ${folderId}: ${d.count} deliveries, ${l.count} links`);
    } catch (err) {
      console.warn("failed", projectListId, err);
      failed++;
    }
  }
  console.log(`done, ${updated} deliveries updated, ${failed} lists failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
