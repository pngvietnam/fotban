import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig } from "prisma/config";
import { parseEnvironment } from "./lib/config";

if (existsSync(".env")) loadEnvFile(".env");
const env = parseEnvironment(process.env);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --env-file-if-exists=.env prisma/seed.ts",
  },
  datasource: { url: env.DATABASE_URL ?? "" },
});
