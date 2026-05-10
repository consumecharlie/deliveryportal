import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const SEED_USERNAMES = [
  "louis galanti",
  "landon schellman",
  "tony saffell",
  "sadjr williams",
  "michael rosenberg",
];

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error("POSTGRES_URL not set");
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) throw new Error("CLICKUP_API_TOKEN not set");

  const teamsRes = await fetch("https://api.clickup.com/api/v2/team", {
    headers: { Authorization: token, "Content-Type": "application/json" },
  });
  if (!teamsRes.ok) throw new Error(`ClickUp /team failed: ${teamsRes.status}`);
  const { teams } = await teamsRes.json();
  const team = teams[0];
  const members: Array<{ user: { id: number; username: string } }> = team.members ?? [];

  const targetSet = new Set(SEED_USERNAMES);
  const matches = members.filter((m) =>
    targetSet.has((m.user.username ?? "").toLowerCase())
  );

  if (matches.length !== SEED_USERNAMES.length) {
    const found = matches.map((m) => m.user.username.toLowerCase());
    const missing = SEED_USERNAMES.filter((u) => !found.includes(u));
    console.warn("Missing usernames in workspace:", missing);
  }

  const pool = new pg.Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  for (const m of matches) {
    await prisma.allowedSender.upsert({
      where: { clickupUserId: m.user.id },
      update: {},
      create: { clickupUserId: m.user.id, addedBy: "seed" },
    });
    console.log(`✓ ${m.user.username} (${m.user.id})`);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
