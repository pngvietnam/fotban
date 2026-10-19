import "server-only";
import { getDatabase } from "../lib/db";
import { logger } from "../lib/logger";
import { prismaSyncDatabase } from "../lib/sync-database";
import type { ClubFixtures } from "../types/club-hub";
import { clubFixtures } from "./club-hub";
import { playerProfile, type PlayerProfile } from "./player-hub";

export type PlayerResult = { kind: "ready"; data: { player: PlayerProfile; fixtures: ClubFixtures } } | { kind: "not-found" } | { kind: "error" };
export async function readPlayer(slug: string, now = new Date()): Promise<PlayerResult> {
  try {
    const db = getDatabase();
    if (!db) return { kind: "error" };
    return await prismaSyncDatabase(db).transaction(async (tx): Promise<PlayerResult> => {
      await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const player = await playerProfile(tx, slug, now);
      return player ? { kind: "ready", data: { player, fixtures: await clubFixtures(tx, player.club.clubId, now) } } : { kind: "not-found" };
    });
  } catch { logger.error({ requestId: crypto.randomUUID() }, "player.page_failed"); return { kind: "error" }; }
}
