import type { SqlExecutor } from "../lib/sync-database";
import { entityCatalog } from "./ai-store";

/** Current EPL/La Liga leagues, clubs and squad players used for Vietnamese relevance and entity links. */
export async function vietnameseCatalogFrom(database: SqlExecutor) {
  const allowed = await database.query<{ id: string }>(`SELECT id FROM "League" WHERE slug IN ('premier-league','la-liga') UNION SELECT cs."clubId" FROM "ClubSeason" cs JOIN "League" l ON l.id=cs."leagueId" JOIN "Season" s ON s.id=cs."seasonId" WHERE l.slug IN ('premier-league','la-liga') AND now() BETWEEN s."startsAt" AND s."endsAt" UNION SELECT pc."playerId" FROM "PlayerClub" pc JOIN "ClubSeason" cs ON cs."clubId"=pc."clubId" JOIN "League" l ON l.id=cs."leagueId" WHERE l.slug IN ('premier-league','la-liga') AND pc."startsAt"<=now() AND (pc."endsAt" IS NULL OR pc."endsAt">=now())`);
  const ids = new Set(allowed.map((row) => row.id));
  return (await entityCatalog(database)).filter((entity) => ids.has(entity.id));
}
