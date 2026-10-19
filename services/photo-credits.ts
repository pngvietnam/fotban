import "server-only";
import { getDatabase } from "../lib/db";
import { logger } from "../lib/logger";
import { safePhotoUrl } from "../lib/player-photo";
import { prismaSyncDatabase } from "../lib/sync-database";

export type PhotoCredit = { playerId: string; name: string; author: string; licenseName: string; licenseUrl: string | null; descriptionUrl: string };
/** Credits for every photo currently shown, so the attribution that CC BY/BY-SA require is always reachable. */
export async function readPhotoCredits(): Promise<PhotoCredit[] | null> {
  const db = getDatabase();
  if (!db) return null;
  try {
    const rows = await prismaSyncDatabase(db).query<PhotoCredit & { thumbUrl: string }>('SELECT p.id AS "playerId",p.name,i.author,i."licenseName",i."licenseUrl",i."descriptionUrl",i."thumbUrl" FROM "PlayerImage" i JOIN "Player" p ON p.id=i."playerId" WHERE i.status=\'FOUND\' ORDER BY p.name,p.id LIMIT 3000');
    return rows.filter((row) => safePhotoUrl(row.thumbUrl)).map((row) => ({ playerId: row.playerId, name: row.name, author: row.author, licenseName: row.licenseName, licenseUrl: row.licenseUrl, descriptionUrl: row.descriptionUrl }));
  } catch { logger.warn({ event: "photo_credits_unavailable" }); return null; }
}
