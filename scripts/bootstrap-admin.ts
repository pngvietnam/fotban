import { createDatabaseClient } from "../lib/database-client";
import { prismaSyncDatabase } from "../lib/sync-database";
import { bootstrapAdmin } from "../services/admin-bootstrap";
async function main(){
  const [id,reason,confirm,...extra]=process.argv.slice(2);
  if(!process.env.DATABASE_URL||!id||!reason||confirm!=="--confirm"||extra.length) throw new Error("Usage: npm.cmd run admin:bootstrap -- <existing-user-uuid> \"operator reason\" --confirm");
  const db=createDatabaseClient(process.env.DATABASE_URL);
  try {await bootstrapAdmin(prismaSyncDatabase(db),id,reason,true);process.stdout.write("Initial administrator assigned; audit recorded.\n");} finally {await db.$disconnect();}
}
main().catch(()=>{process.stderr.write("Admin bootstrap refused. Check UUID, confirmation and reason; bootstrap is allowed only while no administrator exists.\n");process.exitCode=1;});
