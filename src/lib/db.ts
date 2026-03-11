import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | null | undefined;
};

function createPrismaClient(): PrismaClient | null {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    return null;
  }
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const _prisma = globalForPrisma.prisma !== undefined
  ? globalForPrisma.prisma
  : createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = _prisma;

/**
 * Proxy that throws a clear error if the database isn't configured.
 * All DB operations in API routes should be wrapped in try/catch.
 */
export const prisma: PrismaClient = _prisma ?? new Proxy({} as PrismaClient, {
  get(_target, prop) {
    // Allow property checks without throwing
    if (prop === "then" || prop === Symbol.toPrimitive) return undefined;
    return new Proxy(() => {}, {
      get() {
        throw new Error("Database not configured: set POSTGRES_URL in .env.local");
      },
      apply() {
        throw new Error("Database not configured: set POSTGRES_URL in .env.local");
      },
    });
  },
});
