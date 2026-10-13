import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection. Hosted providers such as
    // Neon expose one alongside the pooled URL the app uses at runtime; on a
    // plain local Postgres both are the same, so DIRECT_URL can be left unset.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
