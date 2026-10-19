import { createDatabaseClient } from "../lib/database-client";
import { parseEnvironment } from "../lib/config";
import { prismaSyncDatabase } from "../lib/sync-database";
import { cleanExpiredAuthentication } from "../services/auth-maintenance";

async function main() {
  const env = parseEnvironment(process.env);
  if (!env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  const db = createDatabaseClient(env.DATABASE_URL);
  try { console.log(JSON.stringify({ event: "auth_cleanup", ...await cleanExpiredAuthentication(prismaSyncDatabase(db)) })); }
  finally { await db.$disconnect(); }
}
main().catch(() => { console.error("Authentication cleanup unavailable. Check server-side database configuration."); process.exitCode = 1; });
