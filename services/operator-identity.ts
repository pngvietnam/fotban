import { randomUUID } from "node:crypto";
import type { SqlExecutor } from "../lib/sync-database";

export const validReviewer = (reviewer: string) => /^[\p{L}\p{N} ._@-]{2,80}$/u.test(reviewer.trim());
/** The CLI operator is an audit identity only: no AuthAccount, so it can never sign in, and role USER. */
export async function operatorIdentity(tx: SqlExecutor, reviewer: string) {
  const subject = `operator:${reviewer.trim()}`;
  const existing = await tx.query<{ id: string }>('SELECT id FROM "User" WHERE "authProvider"=\'operator\' AND "authSubject"=$1', [subject]);
  if (existing[0]) return existing[0].id;
  const id = randomUUID();
  await tx.query('INSERT INTO "User" (id,"authProvider","authSubject","displayName","updatedAt") VALUES ($1::uuid,\'operator\',$2,$3,now())', [id, subject, reviewer.trim()]);
  return id;
}
