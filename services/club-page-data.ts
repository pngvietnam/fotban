import "server-only";
import { getDatabase } from "../lib/db";
import { logger } from "../lib/logger";
import { prismaSyncDatabase } from "../lib/sync-database";
import type { ClubFixtures, ClubProfile, ClubStanding, ClubTab, SquadPlayer } from "../types/club-hub";
import { clubFixtures, clubProfile, clubSquad, clubStanding } from "./club-hub";

export type ClubData = { club: ClubProfile; standing: ClubStanding | null; fixtures: ClubFixtures; squad?: SquadPlayer[] };
export type ClubResult = { kind: "ready"; data: ClubData } | { kind: "not-found" } | { kind: "error" };

/** One read-only snapshot. The header always needs standing and next match; the squad only on its tab. */
export async function readClub(slug: string, tab: ClubTab, now = new Date()): Promise<ClubResult> {
  try {
    const db = getDatabase();
    if (!db) return { kind: "error" };
    return await prismaSyncDatabase(db).transaction(async (tx): Promise<ClubResult> => {
      await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const club = await clubProfile(tx, slug, now);
      if (!club) return { kind: "not-found" };
      return { kind: "ready", data: { club, standing: await clubStanding(tx, club, now), fixtures: await clubFixtures(tx, club.clubId, now), ...(tab === "cau-thu" ? { squad: await clubSquad(tx, club.clubId) } : {}) } };
    });
  } catch { logger.error({ requestId: crypto.randomUUID() }, "club.page_failed"); return { kind: "error" }; }
}
