import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env.local first, then .env as fallback
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export default defineConfig({
  earlyAccess: true,
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    async url() {
      const url = process.env.POSTGRES_URL;
      if (!url) {
        throw new Error("POSTGRES_URL is not set in .env.local or .env");
      }
      return url;
    },
  },
});
