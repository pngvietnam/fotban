import "server-only";
import { getDatabase } from "../lib/db";
import { logger } from "../lib/logger";
import { prismaSyncDatabase } from "../lib/sync-database";
import type { ClubFixtures, ClubProfile, ClubScorer, ClubStanding, ClubTab, ClubTable, SquadPlayer } from "../types/club-hub";
import { fanThreadsForClub } from "./fan-threads";
import { clubFixtures, clubProfile, clubScorers, clubSquad, clubStanding, clubTables } from "./club-hub";

export type ClubData = { club: ClubProfile; standing: ClubStanding | null; fixtures: ClubFixtures; tables: ClubTable[]; scorers: ClubScorer[]; squad?: SquadPlayer[] };
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
      const tables = await clubTables(tx, club.clubId, now);
      return { kind: "ready", data: { club, standing: await clubStanding(tx, club, now), fixtures: await clubFixtures(tx, club.clubId, now, tab === "lich-thi-dau" ? 15 : 5), tables, scorers: tab === "tong-quan" ? await clubScorers(tx, club.clubId, tables) : [], ...(tab === "cau-thu" || tab === "tong-quan" ? { squad: await clubSquad(tx, club.clubId) } : {}) } };
    });
  } catch { logger.error({ requestId: crypto.randomUUID() }, "club.page_failed"); return { kind: "error" }; }
}

/** Every stored upcoming match of a club, for the calendar file; null when the club has no page. */
export async function readClubCalendar(slug: string, now = new Date()): Promise<{ club: ClubProfile; upcoming: ClubFixtures["upcoming"] } | null> {
  try {
    const db = getDatabase();
    if (!db) return null;
    return await prismaSyncDatabase(db).transaction(async (tx) => {
      await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const club = await clubProfile(tx, slug, now);
      return club ? { club, upcoming: (await clubFixtures(tx, club.clubId, now, 60)).upcoming } : null;
    });
  } catch { logger.error({ requestId: crypto.randomUUID() }, "club.calendar_failed"); return null; }
}

/** Fan threads that name the club (its Voz room first); empty when they cannot be read. */
export async function readClubFans(clubId: string, now = new Date()) {
  try {
    const db = getDatabase();
    return db ? await fanThreadsForClub(prismaSyncDatabase(db), clubId, now) : [];
  } catch { logger.warn({ requestId: crypto.randomUUID() }, "club.fans_unavailable"); return []; }
}
