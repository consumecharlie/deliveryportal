import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env.local first, then .env as fallback
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

if (!process.env.POSTGRES_URL) {
  throw new Error("POSTGRES_URL is not set in .env.local or .env");
}

export default defineConfig({
  earlyAccess: true,
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.POSTGRES_URL,
  },
});
