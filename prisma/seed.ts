import { createDatabaseClient } from "../lib/database-client";
import { parseEnvironment } from "../lib/config";
import { assertDevelopmentSeed, developmentLeagues } from "./seed-data";

async function main() {
  assertDevelopmentSeed({
    nodeEnv: process.env.NODE_ENV,
    allow: process.env.ALLOW_DEV_SEED,
    databaseUrl: process.env.DATABASE_URL,
  });
  const env = parseEnvironment(process.env);
  const db = createDatabaseClient(env.DATABASE_URL!);
  try {
    await db.$transaction(async (tx) => {
      for (const league of developmentLeagues) {
        // Existing editorial changes are deliberately preserved on rerun.
        await tx.league.upsert({ where: { slug: league.slug }, create: league, update: {} });
      }
    });
    console.log("Development reference leagues prepared. No match/news content seeded.");
  } finally {
    await db.$disconnect();
  }
}

main().catch(() => {
  console.error("Development seed failed. Check the opt-in, local database and applied migrations. Credentials are omitted.");
  process.exitCode = 1;
});
