import { createDatabaseClient } from "../lib/database-client";
import { parseEnvironment } from "../lib/config";

async function main() {
  const env = parseEnvironment(process.env);
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const db = createDatabaseClient(env.DATABASE_URL);
  try {
    await db.$queryRaw`SELECT 1`;
    console.log("PostgreSQL connection verified through Prisma.");
  } finally {
    await db.$disconnect();
  }
}

main().catch(() => {
  console.error("Database check failed. Configure DATABASE_URL and verify PostgreSQL availability.");
  process.exitCode = 1;
});
