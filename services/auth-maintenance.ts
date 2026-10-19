import type { SyncDatabase } from "../lib/sync-database";

// Explicit operator maintenance: never deletes users, follows or content.
export async function cleanExpiredAuthentication(db: SyncDatabase, now = new Date()) {
  return db.transaction(async (tx) => {
    const sessions = await tx.query('DELETE FROM "AuthSession" WHERE "expiresAt"<=$1::timestamptz RETURNING id', [now.toISOString()]);
    const verifications = await tx.query('DELETE FROM "AuthVerification" WHERE "expiresAt"<=$1::timestamptz RETURNING id', [now.toISOString()]);
    const counters = await tx.query('DELETE FROM "AuthRateLimit" WHERE "lastRequest"<$1::bigint RETURNING id', [now.getTime() - 86400000]);
    return { sessions: sessions.length, verifications: verifications.length, counters: counters.length };
  });
}
