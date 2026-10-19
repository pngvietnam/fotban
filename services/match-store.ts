import { randomUUID } from "node:crypto";
import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
export { prismaSyncDatabase, type SqlExecutor, type SyncDatabase } from "../lib/sync-database";
import type { CompetitionData, CompetitionRef, NormalizedMatch, PlayerRef, SeasonRef, StandingRow, TeamRef } from "../types/match-provider";
import { ProviderError } from "../providers/errors";

type Target = "leagueId" | "seasonId" | "clubId" | "matchId";
async function mapping(db: SqlExecutor, provider: string, type: string, externalId?: string) {
  if (!externalId) return undefined;
  const rows = await db.query<{ leagueId: string | null; seasonId: string | null; clubId: string | null; matchId: string | null }>('SELECT "leagueId", "seasonId", "clubId", "matchId" FROM "ExternalIdentity" WHERE provider=$1 AND "entityType"=$2 AND "externalId"=$3', [provider, type, externalId]);
  return rows[0];
}
async function putMapping(db: SqlExecutor, provider: string, type: string, externalId: string | undefined, target: Target, internalId: string) {
  if (!externalId) return;
  // target is a private static identifier union; all upstream values are bound parameters.
  await db.query(`INSERT INTO "ExternalIdentity" (id,provider,"entityType","externalId","${target}","updatedAt") VALUES ($1::uuid,$2,$3,$4,$5::uuid,now()) ON CONFLICT (provider,"entityType","externalId") DO NOTHING`, [randomUUID(), provider, type, externalId, internalId]);
  const persisted = await mapping(db, provider, type, externalId);
  if (persisted?.[target] !== internalId) throw new ProviderError("MALFORMED_RESPONSE");
}

async function upsertCompetition(db: SqlExecutor, provider: string, competition: CompetitionRef) {
  const mapped = await mapping(db, provider, "LEAGUE", competition.externalId);
  const rows = mapped?.leagueId
    ? await db.query<{ id: string }>('UPDATE "League" SET name=$2,country=$3,"updatedAt"=now() WHERE id=$1::uuid RETURNING id', [mapped.leagueId, competition.name, competition.country])
    : await db.query<{ id: string }>('INSERT INTO "League" (id,slug,name,country,"updatedAt") VALUES ($1::uuid,$2,$3,$4,now()) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name,country=EXCLUDED.country,"updatedAt"=now() RETURNING id', [randomUUID(), competition.key, competition.name, competition.country]);
  const id = rows[0].id;
  await putMapping(db, provider, "LEAGUE", competition.externalId, "leagueId", id);
  return id;
}
async function upsertSeason(db: SqlExecutor, provider: string, leagueId: string, season: SeasonRef) {
  const mapped = await mapping(db, provider, "SEASON", season.externalId);
  const rows = mapped?.seasonId
    ? await db.query<{ id: string }>('UPDATE "Season" SET "startsAt"=COALESCE($3::timestamptz,"startsAt"),"endsAt"=COALESCE($4::timestamptz,"endsAt"),"updatedAt"=now() WHERE id=$1::uuid AND "leagueId"=$2::uuid RETURNING id', [mapped.seasonId, leagueId, season.startsAt ?? null, season.endsAt ?? null])
    : await db.query<{ id: string }>('INSERT INTO "Season" (id,"leagueId",name,"startsAt","endsAt","updatedAt") VALUES ($1::uuid,$2::uuid,$3,$4::timestamptz,$5::timestamptz,now()) ON CONFLICT ("leagueId",name) DO UPDATE SET "startsAt"=COALESCE(EXCLUDED."startsAt","Season"."startsAt"),"endsAt"=COALESCE(EXCLUDED."endsAt","Season"."endsAt"),"updatedAt"=now() RETURNING id', [randomUUID(), leagueId, season.name, season.startsAt ?? null, season.endsAt ?? null]);
  if (!rows[0]) throw new ProviderError("MALFORMED_RESPONSE");
  await putMapping(db, provider, "SEASON", season.externalId, "seasonId", rows[0].id);
  return rows[0].id;
}
async function upsertTeam(db: SqlExecutor, provider: string, team: TeamRef, leagueId: string, seasonId: string) {
  const mapped = await mapping(db, provider, "CLUB", team.externalId);
  const id = mapped?.clubId ?? randomUUID();
  await db.query('INSERT INTO "Club" (id,slug,name,"shortName",tla,country,venue,"externalCrestUrl","updatedAt") VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,"shortName"=COALESCE(EXCLUDED."shortName","Club"."shortName"),tla=COALESCE(EXCLUDED.tla,"Club".tla),country=COALESCE(EXCLUDED.country,"Club".country),venue=COALESCE(EXCLUDED.venue,"Club".venue),"externalCrestUrl"=COALESCE(EXCLUDED."externalCrestUrl","Club"."externalCrestUrl"),"updatedAt"=now()', [id, `club-${id}`, team.name, team.shortName ?? null, team.tla ?? null, team.country ?? null, team.venue ?? null, team.externalCrestUrl ?? null]);
  await putMapping(db, provider, "CLUB", team.externalId, "clubId", id);
  await db.query('INSERT INTO "ClubSeason" (id,"clubId","seasonId","leagueId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,now()) ON CONFLICT ("clubId","seasonId") DO NOTHING', [randomUUID(), id, seasonId, leagueId]);
  return id;
}

// Plain-ASCII Vietnamese words that would otherwise collide with a surname alias in Vietnamese text.
const vietnameseWords = new Set(["anh", "banh", "binh", "bong", "canh", "chanh", "chung", "cong", "danh", "dong", "dung", "hanh", "hoang", "hong", "hung", "kinh", "linh", "long", "manh", "minh", "nguyen", "nhanh", "phong", "quang", "sang", "sinh", "song", "thang", "thanh", "tinh", "trang", "tranh", "trong", "tung", "vinh", "xanh"]);
/** Vietnamese press usually names foreign players by surname ("Haaland"); mononyms stay as the name. */
export function playerAliases(name: string) {
  const parts = name.trim().split(/\s+/);
  const surname = parts.at(-1) ?? "";
  if (parts.length < 2 || surname.length < 4 || /[^\p{L}'-]/u.test(surname) || vietnameseWords.has(surname.toLowerCase())) return [];
  return [surname];
}
async function upsertSquad(db: SqlExecutor, provider: string, clubId: string, squad: PlayerRef[], observedAt: Date, sourceUrl: string) {
  const seen: string[] = [];
  for (const player of squad) {
    const mapped = await db.query<{ playerId: string | null }>('SELECT "playerId" FROM "ExternalIdentity" WHERE provider=$1 AND "entityType"=\'PLAYER\' AND "externalId"=$2', [provider, player.externalId]);
    const id = mapped[0]?.playerId ?? randomUUID();
    // Missing optional values never erase known ones; aliases are only appended.
    await db.query(`INSERT INTO "Player" (id,slug,name,aliases,position,nationality,"birthDate","updatedAt") VALUES ($1::uuid,$2,$3,$4::text[],$5,$6,$7::date,now())
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,aliases=ARRAY(SELECT DISTINCT unnest("Player".aliases || EXCLUDED.aliases) ORDER BY 1),position=COALESCE(EXCLUDED.position,"Player".position),nationality=COALESCE(EXCLUDED.nationality,"Player".nationality),"birthDate"=COALESCE(EXCLUDED."birthDate","Player"."birthDate"),"updatedAt"=now()`,
      [id, `player-${id}`, player.name, playerAliases(player.name), player.position ?? null, player.nationality ?? null, player.birthDate ?? null]);
    if (!mapped[0]) await db.query('INSERT INTO "ExternalIdentity" (id,provider,"entityType","externalId","playerId","updatedAt") VALUES ($1::uuid,$2,\'PLAYER\',$3,$4::uuid,now()) ON CONFLICT (provider,"entityType","externalId") DO NOTHING', [randomUUID(), provider, player.externalId, id]);
    // Membership starts when it is first observed; an earlier joining date is not invented.
    // A player listed by a different club is closed at the old club (transfer/loan observed).
    await db.query('UPDATE "PlayerClub" SET "endsAt"=GREATEST($3::timestamptz,"startsAt"),"updatedAt"=now() WHERE "playerId"=$1::uuid AND "clubId"<>$2::uuid AND "endsAt" IS NULL', [id, clubId, observedAt]);
    await db.query('INSERT INTO "PlayerClub" (id,"playerId","clubId","startsAt","sourceUrl","updatedAt") SELECT $1::uuid,$2::uuid,$3::uuid,$4::timestamptz,$5,now() WHERE NOT EXISTS (SELECT 1 FROM "PlayerClub" WHERE "playerId"=$2::uuid AND "clubId"=$3::uuid AND "endsAt" IS NULL)', [randomUUID(), id, clubId, observedAt, sourceUrl]);
    seen.push(id);
  }
  // Only a non-empty squad can end memberships; a missing/partial squad never removes players.
  if (seen.length) await db.query('UPDATE "PlayerClub" SET "endsAt"=GREATEST($3::timestamptz,"startsAt"),"updatedAt"=now() WHERE "clubId"=$1::uuid AND "endsAt" IS NULL AND NOT ("playerId"=ANY($2::uuid[]))', [clubId, seen, observedAt]);
  return seen.length;
}

export type SyncPayload =
  | { mode: "competitions"; items: CompetitionData[] }
  | { mode: "teams"; competition: CompetitionRef; season: SeasonRef; teams: TeamRef[] }
  | { mode: "matches"; items: NormalizedMatch[] }
  | { mode: "standings"; items: StandingRow[] };

export async function persistMatchPayload(db: SqlExecutor, provider: string, payload: SyncPayload, fetchedAt: Date) {
  // Serializes identity creation across all sync modes/processes, only while writing.
  // No network request or throttle wait occurs inside this transaction/lock.
  await db.query("SELECT pg_advisory_xact_lock(hashtext($1))::text AS lock", [`match-persistence:${provider}`]);
  let records = 0;
  if (payload.mode === "competitions") {
    for (const item of payload.items) {
      const leagueId = await upsertCompetition(db, provider, item.competition);
      if (item.season) await upsertSeason(db, provider, leagueId, item.season);
      records++;
    }
  } else if (payload.mode === "teams") {
    const leagueId = await upsertCompetition(db, provider, payload.competition);
    const seasonId = await upsertSeason(db, provider, leagueId, payload.season);
    for (const team of payload.teams) {
      const clubId = await upsertTeam(db, provider, team, leagueId, seasonId); records++;
      if (team.squad?.length) records += await upsertSquad(db, provider, clubId, team.squad, fetchedAt, `https://api.football-data.org/v4/teams/${team.externalId}`);
    }
  } else if (payload.mode === "matches") {
    for (const m of payload.items) {
      const leagueId = await upsertCompetition(db, provider, m.competition);
      const seasonId = await upsertSeason(db, provider, leagueId, m.season);
      const home = await upsertTeam(db, provider, m.home, leagueId, seasonId);
      const away = await upsertTeam(db, provider, m.away, leagueId, seasonId);
      const mapped = await mapping(db, provider, "MATCH", m.externalId);
      const existing = await db.query<{ id: string }>('SELECT id FROM "Match" WHERE provider=$1 AND "externalId"=$2', [provider, m.externalId]);
      const id = mapped?.matchId ?? existing[0]?.id ?? randomUUID();
      await db.query(`INSERT INTO "Match" (id,slug,provider,"externalId","leagueId","seasonId","homeClubId","awayClubId","kickoffAt",status,"providerStatus",round,venue,"homeScore","awayScore","homeExtraTimeScore","awayExtraTimeScore","homePenaltyScore","awayPenaltyScore","scoreDuration","providerUpdatedAt","lastUpdatedAt","sourceUrl","updatedAt")
        VALUES ($1::uuid,$2,$3,$4,$5::uuid,$6::uuid,$7::uuid,$8::uuid,$9::timestamptz,$10::"MatchStatus",$11,$12,$13,$14::int,$15::int,$16::int,$17::int,$18::int,$19::int,$20,$21::timestamptz,$22::timestamptz,$23,now())
        ON CONFLICT (id) DO UPDATE SET "leagueId"=EXCLUDED."leagueId","seasonId"=EXCLUDED."seasonId","homeClubId"=EXCLUDED."homeClubId","awayClubId"=EXCLUDED."awayClubId","kickoffAt"=EXCLUDED."kickoffAt",status=EXCLUDED.status,"providerStatus"=EXCLUDED."providerStatus",round=COALESCE(EXCLUDED.round,"Match".round),venue=COALESCE(EXCLUDED.venue,"Match".venue),
        "homeScore"=COALESCE(EXCLUDED."homeScore","Match"."homeScore"),"awayScore"=COALESCE(EXCLUDED."awayScore","Match"."awayScore"),"homeExtraTimeScore"=COALESCE(EXCLUDED."homeExtraTimeScore","Match"."homeExtraTimeScore"),"awayExtraTimeScore"=COALESCE(EXCLUDED."awayExtraTimeScore","Match"."awayExtraTimeScore"),"homePenaltyScore"=COALESCE(EXCLUDED."homePenaltyScore","Match"."homePenaltyScore"),"awayPenaltyScore"=COALESCE(EXCLUDED."awayPenaltyScore","Match"."awayPenaltyScore"),"scoreDuration"=COALESCE(EXCLUDED."scoreDuration","Match"."scoreDuration"),"providerUpdatedAt"=COALESCE(EXCLUDED."providerUpdatedAt","Match"."providerUpdatedAt"),"lastUpdatedAt"=EXCLUDED."lastUpdatedAt","sourceUrl"=EXCLUDED."sourceUrl","updatedAt"=now()
        WHERE ("Match"."providerUpdatedAt" IS NULL OR EXCLUDED."providerUpdatedAt" >= "Match"."providerUpdatedAt")
        AND NOT ("Match".status='FINISHED' AND EXCLUDED.status <> 'FINISHED' AND (EXCLUDED."providerUpdatedAt" IS NULL OR EXCLUDED."providerUpdatedAt" <= "Match"."providerUpdatedAt"))`,
      [id, `match-${id}`, provider, m.externalId, leagueId, seasonId, home, away, m.kickoffAt, m.status, m.providerStatus, m.round ?? null, m.venue ?? null, m.homeScore ?? null, m.awayScore ?? null, m.homeExtraTimeScore ?? null, m.awayExtraTimeScore ?? null, m.homePenaltyScore ?? null, m.awayPenaltyScore ?? null, m.scoreDuration ?? null, m.providerUpdatedAt ?? null, fetchedAt, m.sourceUrl]);
      await putMapping(db, provider, "MATCH", m.externalId, "matchId", id);
      records++;
    }
  } else {
    for (const row of payload.items) {
      const leagueId = await upsertCompetition(db, provider, row.competition);
      const seasonId = await upsertSeason(db, provider, leagueId, row.season);
      const clubId = await upsertTeam(db, provider, row.team, leagueId, seasonId);
      await db.query(`INSERT INTO "Standing" (id,provider,"leagueId","seasonId","clubId",stage,"group","tableType",position,"playedGames",won,drawn,lost,points,"goalsFor","goalsAgainst","goalDifference","fetchedAt","updatedAt")
        VALUES ($1::uuid,$2,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8,$9::int,$10::int,$11::int,$12::int,$13::int,$14::int,$15::int,$16::int,$17::int,$18::timestamptz,now())
        ON CONFLICT (provider,"seasonId",stage,"group","tableType","clubId") DO UPDATE SET position=EXCLUDED.position,"playedGames"=COALESCE(EXCLUDED."playedGames","Standing"."playedGames"),won=COALESCE(EXCLUDED.won,"Standing".won),drawn=COALESCE(EXCLUDED.drawn,"Standing".drawn),lost=COALESCE(EXCLUDED.lost,"Standing".lost),points=COALESCE(EXCLUDED.points,"Standing".points),"goalsFor"=COALESCE(EXCLUDED."goalsFor","Standing"."goalsFor"),"goalsAgainst"=COALESCE(EXCLUDED."goalsAgainst","Standing"."goalsAgainst"),"goalDifference"=COALESCE(EXCLUDED."goalDifference","Standing"."goalDifference"),"fetchedAt"=EXCLUDED."fetchedAt","updatedAt"=now() WHERE EXCLUDED."fetchedAt" >= "Standing"."fetchedAt"`,
      [randomUUID(), provider, leagueId, seasonId, clubId, row.stage, row.group, row.tableType, row.position, row.playedGames ?? null, row.won ?? null, row.drawn ?? null, row.lost ?? null, row.points ?? null, row.goalsFor ?? null, row.goalsAgainst ?? null, row.goalDifference ?? null, fetchedAt]);
      records++;
    }
  }
  return records;
}

export class MatchSyncStore {
  constructor(readonly db: SyncDatabase) {}
  async ensureProvider(provider: string, capability: string) {
    await this.db.query('INSERT INTO "ProviderStatus" (id,provider,capability,"updatedAt") VALUES ($1::uuid,$2,$3,now()) ON CONFLICT (provider) DO UPDATE SET capability=EXCLUDED.capability,"updatedAt"=now()', [randomUUID(), provider, capability]);
  }
  async reserveRequest(provider: string, intervalMs: number) {
    const rows = await this.db.query<{ waitMs: number; cooldown: boolean }>(`UPDATE "ProviderStatus" SET "nextRequestAt"=GREATEST(COALESCE("nextRequestAt",clock_timestamp()),clock_timestamp()) + $2::int * interval '1 millisecond'
      WHERE provider=$1 AND ("cooldownUntil" IS NULL OR "cooldownUntil" <= clock_timestamp())
      RETURNING GREATEST(0,EXTRACT(EPOCH FROM ("nextRequestAt" - $2::int * interval '1 millisecond' - clock_timestamp()))*1000)::int AS "waitMs",false AS cooldown`, [provider, intervalMs]);
    if (!rows[0]) throw new ProviderError("RATE_LIMITED", 60000);
    return rows[0].waitMs;
  }
  async cooldown(provider: string, ms: number) {
    await this.db.query('UPDATE "ProviderStatus" SET "cooldownUntil"=GREATEST(COALESCE("cooldownUntil",now()),now()+$2::double precision * interval \'1 millisecond\') WHERE provider=$1', [provider, ms]);
  }
  async claim(key: string, ttlMs: number, force: boolean) {
    const owner = randomUUID();
    const rows = await this.db.query<{ id: string }>(`INSERT INTO "JobRun" (id,"jobName","logicalKey",status,"startedAt",attempts,"correlationId","leaseOwner","leaseExpiresAt","updatedAt") VALUES ($1::uuid,'match-sync',$2,'RUNNING',now(),1,$3::uuid,$4,now()+interval '10 minutes',now())
      ON CONFLICT ("jobName","logicalKey") DO UPDATE SET status='RUNNING',"startedAt"=now(),"finishedAt"=NULL,attempts="JobRun".attempts+1,"correlationId"=EXCLUDED."correlationId","leaseOwner"=EXCLUDED."leaseOwner","leaseExpiresAt"=EXCLUDED."leaseExpiresAt","errorCode"=NULL,"errorSafe"=NULL,"updatedAt"=now()
      WHERE ("JobRun"."leaseExpiresAt" IS NULL OR "JobRun"."leaseExpiresAt" <= now()) AND ($5::boolean OR "JobRun".status <> 'SUCCEEDED' OR "JobRun"."errorCode" IS NOT NULL OR "JobRun"."finishedAt" <= now()-$6::int * interval '1 millisecond') RETURNING id`, [randomUUID(), key, randomUUID(), owner, force, ttlMs]);
    if (rows[0]) return { id: rows[0].id, owner, cached: false };
    const existing = await this.db.query<{ id: string; status: string }>('SELECT id,status FROM "JobRun" WHERE "jobName"=\'match-sync\' AND "logicalKey"=$1', [key]);
    if (existing[0]?.status === "SUCCEEDED") return { id: existing[0].id, owner, cached: true };
    throw new ProviderError("BUSY");
  }
  async complete(job: { id: string; owner: string }, provider: string, payload: SyncPayload, skipped: number, fetchedAt: Date) {
    return this.db.transaction(async (tx) => {
      const owned = await tx.query('SELECT id FROM "JobRun" WHERE id=$1::uuid AND "leaseOwner"=$2 AND status=\'RUNNING\' AND "leaseExpiresAt">now() FOR UPDATE', [job.id, job.owner]);
      if (!owned[0]) throw new ProviderError("BUSY");
      const records = await persistMatchPayload(tx, provider, payload, fetchedAt);
      await tx.query('UPDATE "JobRun" SET status=\'SUCCEEDED\',"finishedAt"=now(),"recordsProcessed"=$3::int,"checkpoint"=$4::jsonb,"errorCode"=$5,"leaseOwner"=NULL,"leaseExpiresAt"=NULL,"updatedAt"=now() WHERE id=$1::uuid AND "leaseOwner"=$2', [job.id, job.owner, records, JSON.stringify({ skipped, fetchedAt: fetchedAt.toISOString() }), skipped ? "PARTIAL" : null]);
      await tx.query('UPDATE "ProviderStatus" SET health=$2::"ProviderHealth",enabled=true,"lastCheckedAt"=now(),"lastSuccessAt"=now(),"dataUpdatedAt"=$3::timestamptz,"recordsProcessed"=$4::int,"errorCode"=$5,"errorSafe"=NULL,"updatedAt"=now() WHERE provider=$1', [provider, skipped ? "WARNING" : "HEALTHY", fetchedAt, records, skipped ? "PARTIAL" : null]);
      return records;
    });
  }
  async fail(job: { id: string; owner: string }, provider: string, code: string, message: string) {
    await this.db.transaction(async (tx) => {
      await tx.query('UPDATE "JobRun" SET status=\'FAILED\',"finishedAt"=now(),"recordsProcessed"=0,"errorCode"=$3,"errorSafe"=$4,"leaseOwner"=NULL,"leaseExpiresAt"=NULL,"updatedAt"=now() WHERE id=$1::uuid AND "leaseOwner"=$2', [job.id, job.owner, code, message]);
      await tx.query('UPDATE "ProviderStatus" SET health=$2::"ProviderHealth",enabled=$3,"lastCheckedAt"=now(),"lastFailureAt"=now(),"errorCode"=$4,"errorSafe"=$5,"updatedAt"=now() WHERE provider=$1', [provider, code === "NOT_CONFIGURED" ? "UNCONFIGURED" : "ERROR", code !== "NOT_CONFIGURED", code, message]);
    });
  }
}
