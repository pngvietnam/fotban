import { parseEnvironment } from "../lib/config";
import { createDatabaseClient } from "../lib/database-client";
import { prismaSyncDatabase } from "../lib/sync-database";
import { TransferTrackingService } from "../services/transfer-service";
async function main() {
  if (process.argv.length > 2) throw new Error("INVALID_ARGUMENTS");
  const env = parseEnvironment(process.env); if (!env.DATABASE_URL) { console.error("DATABASE_URL is required."); process.exitCode = 1; return; }
  const db = createDatabaseClient(env.DATABASE_URL);
  try { console.log(JSON.stringify(await new TransferTrackingService(prismaSyncDatabase(db)).sync())); } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("Transfer sync failed. Check database, migrations, evidence and batch size; raw errors withheld."); process.exitCode = 1; });
