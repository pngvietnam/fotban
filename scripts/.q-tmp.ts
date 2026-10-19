import { createDatabaseClient } from "../lib/database-client";
const db = createDatabaseClient(process.env.DATABASE_URL!);
db.$queryRawUnsafe(process.argv[2]).then((r) => console.log(JSON.stringify(r, (_k, v) => typeof v === "bigint" ? Number(v) : v))).finally(() => db.$disconnect());
