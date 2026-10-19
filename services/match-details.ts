import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
import { matchSquadPlayer, pairMatches, type SquadPlayer } from "../lib/match-detail-matching";
import { HIGHLIGHTLY, highlightlyLeagues } from "../providers/highlightly/config";
import type { MatchDetailApi } from "../providers/highlightly/provider";
import type { DetailEvent, HighlightlyDetail, HighlightlyLineups, LineupPlayer } from "../providers/highlightly/normalization";
import { ProviderError, safeProviderError } from "../providers/errors";
import { isLeagueSlug } from "./league-hub";

const provider = HIGHLIGHTLY.id;
const minute = 60_000;
/** Lineups are published about an hour before kickoff. */
const lineupLeadMs = 50 * minute;
const lineupRetryMs = 20 * minute;
const detailRetryMs = 60 * minute;
const mapRetryMs = 2 * 3600_000;
const maxAttempts = 4;
const lookbackMs = 3 * 86400_000;

export type DetailSyncResult = { mapped: number; lineups: number; details: number; requests: number; stopped: "DONE" | "QUOTA" | "ERROR"; error?: string };

/** Atomically spends one request of today's (UTC) allowance; false when it is used up. */
export async function reserveQuota(db: SqlExecutor, now: Date, budget: number = HIGHLIGHTLY.dailyBudget) {
  const rows = await db.query<{ used: number }>(`INSERT INTO "ProviderQuota" (provider,day,used,"updatedAt") VALUES ($1,$2::date,1,now())
    ON CONFLICT (provider,day) DO UPDATE SET used="ProviderQuota".used+1,"updatedAt"=now() WHERE "ProviderQuota".used<$3 RETURNING used`, [provider, now.toISOString().slice(0, 10), budget]);
  return rows.length > 0;
}
/** After an HTTP 429 nothing more is sent today. */
export async function exhaustQuota(db: SqlExecutor, now: Date, budget: number = HIGHLIGHTLY.dailyBudget) {
  await db.query(`INSERT INTO "ProviderQuota" (provider,day,used,"updatedAt") VALUES ($1,$2::date,$3,now()) ON CONFLICT (provider,day) DO UPDATE SET used=GREATEST("ProviderQuota".used,$3),"updatedAt"=now()`, [provider, now.toISOString().slice(0, 10), budget]);
}

type Due = {
  matchId: string; leagueId: string; leagueSlug: string; kickoffAt: string; status: string; homeScore: number | null; awayScore: number | null;
  homeClubId: string; awayClubId: string; homeNames: (string | null)[]; awayNames: (string | null)[];
  externalId: string | null; homeTeamExternalId: string | null; awayTeamExternalId: string | null; mapAttemptAt: string | null;
  lineupsFetchedAt: string | null; lineupAttempts: number | null; detailFetchedAt: string | null; detailAttempts: number | null; syncUpdatedAt: string | null;
};
async function dueMatches(db: SqlExecutor, now: Date) {
  return db.query<Due>(`SELECT m.id AS "matchId",m."leagueId",l.slug AS "leagueSlug",m."kickoffAt",m.status,m."homeScore",m."awayScore",m."homeClubId",m."awayClubId",
      ARRAY[hc.name,hc."shortName"]||hc.aliases AS "homeNames",ARRAY[ac.name,ac."shortName"]||ac.aliases AS "awayNames",
      d."externalId",d."homeTeamExternalId",d."awayTeamExternalId",d."mapAttemptAt",d."lineupsFetchedAt",d."lineupAttempts",d."detailFetchedAt",d."detailAttempts",d."updatedAt" AS "syncUpdatedAt"
    FROM "Match" m JOIN "League" l ON l.id=m."leagueId" JOIN "Club" hc ON hc.id=m."homeClubId" JOIN "Club" ac ON ac.id=m."awayClubId"
    LEFT JOIN "MatchDetailSync" d ON d."matchId"=m.id AND d.provider=$1
    WHERE l.slug IN ('premier-league','la-liga','champions-league') AND m.status NOT IN ('CANCELLED','POSTPONED')
      AND m."kickoffAt" BETWEEN $2::timestamptz AND $3::timestamptz
      AND (d."detailFetchedAt" IS NULL OR d."lineupsFetchedAt" IS NULL)
    ORDER BY m."kickoffAt",m.id`, [provider, new Date(now.getTime() - lookbackMs), new Date(now.getTime() + lineupLeadMs)]);
}
const since = (value: string | null, now: Date) => value ? now.getTime() - Date.parse(value) : Infinity;
const wantsDetail = (row: Due, now: Date) => row.status === "FINISHED" && !row.detailFetchedAt && (row.detailAttempts ?? 0) < maxAttempts && ((row.detailAttempts ?? 0) === 0 || since(row.syncUpdatedAt, now) >= detailRetryMs);
const wantsLineups = (row: Due, now: Date) => !row.lineupsFetchedAt && (row.lineupAttempts ?? 0) < maxAttempts && Date.parse(row.kickoffAt) - now.getTime() <= lineupLeadMs
  && ((row.lineupAttempts ?? 0) === 0 || since(row.syncUpdatedAt, now) >= lineupRetryMs);

/** Writes use the pass time, not the database clock, so retry spacing is measured on one clock. */
async function upsertSync(db: SqlExecutor, matchId: string, fields: Record<string, unknown>, now: Date) {
  const names = Object.keys(fields);
  const columns = names.map((name) => `"${name}"`).join(",");
  const values = names.map((_, index) => `$${index + 4}`).join(",");
  const updates = names.map((name) => `"${name}"=EXCLUDED."${name}"`).join(",");
  await db.query(`INSERT INTO "MatchDetailSync" ("matchId",provider,${columns},"updatedAt") VALUES ($1::uuid,$2,${values},$3::timestamptz)
    ON CONFLICT ("matchId",provider) DO UPDATE SET ${updates},"updatedAt"=$3::timestamptz`, [matchId, provider, now, ...names.map((name) => fields[name])]);
}
async function bumpAttempt(db: SqlExecutor, matchId: string, column: "lineupAttempts" | "detailAttempts", error: string | null, now: Date) {
  await db.query(`INSERT INTO "MatchDetailSync" ("matchId",provider,"${column}","lastError","updatedAt") VALUES ($1::uuid,$2,1,$3,$4::timestamptz)
    ON CONFLICT ("matchId",provider) DO UPDATE SET "${column}"="MatchDetailSync"."${column}"+1,"lastError"=$3,"updatedAt"=$4::timestamptz`, [matchId, provider, error, now]);
}
async function leagueExternalId(db: SqlExecutor, findLeagues: MatchDetailApi["leagues"], leagueId: string, slug: string) {
  const [known] = await db.query<{ externalId: string }>(`SELECT "externalId" FROM "ExternalIdentity" WHERE provider=$1 AND "entityType"='LEAGUE' AND "leagueId"=$2::uuid`, [provider, leagueId]);
  if (known) return known.externalId;
  if (!isLeagueSlug(slug)) throw new ProviderError("UNSUPPORTED");
  const wanted = highlightlyLeagues[slug];
  const fold = (value: string) => value.trim().toLowerCase();
  const candidates = (await findLeagues(wanted.name)).filter((league) => league.country && wanted.countries.map(fold).includes(fold(league.country)));
  const exact = candidates.filter((league) => fold(league.name) === fold(wanted.name));
  const chosen = exact.length === 1 ? exact[0] : candidates.length === 1 ? candidates[0] : null;
  if (!chosen) throw new ProviderError("UNSUPPORTED");
  await db.query(`INSERT INTO "ExternalIdentity" (id,provider,"entityType","externalId","leagueId","updatedAt") VALUES (gen_random_uuid(),$1,'LEAGUE',$2,$3::uuid,now()) ON CONFLICT DO NOTHING`, [provider, chosen.id, leagueId]);
  return chosen.id;
}
async function squad(db: SqlExecutor, clubId: string, at: Date): Promise<SquadPlayer[]> {
  return db.query<SquadPlayer>(`SELECT p.id,p.name FROM "PlayerClub" pc JOIN "Player" p ON p.id=pc."playerId" WHERE pc."clubId"=$1::uuid AND pc."startsAt"<=$2::timestamptz AND (pc."endsAt" IS NULL OR pc."endsAt">=$2::timestamptz)`, [clubId, at]);
}
/** Starters stored for the match, by provider team ID, used to tell who came on in a substitution. */
async function storedStarters(db: SqlExecutor, matchId: string) {
  const rows = await db.query<{ clubId: string; players: LineupPlayer[] }>(`SELECT "clubId",players FROM "MatchLineup" WHERE "matchId"=$1::uuid AND provider=$2`, [matchId, provider]);
  return new Map(rows.map((row) => [row.clubId, new Set(row.players.filter((player) => player.starter).map((player) => player.name))]));
}
/**
 * The provider names the player and the "substituted" one. When the stored starting eleven shows
 * that the named player started and the other did not, the named player is the one who went off.
 */
export function orientSubstitution(event: DetailEvent, starters: Set<string> | undefined): DetailEvent {
  if (event.type !== "SUBSTITUTION" || !starters || !event.player || !event.related) return event;
  // Provider names may be shortened ("C. Palmer") while lineups carry full names.
  const list = [...starters].map((name) => ({ id: name, name }));
  const started = (name: string) => starters.has(name) || matchSquadPlayer(list, name) !== null;
  return started(event.player) && !started(event.related) ? { ...event, player: event.related, related: event.player } : event;
}

async function storeDetail(db: SyncDatabase, row: Due, detail: HighlightlyDetail, now: Date) {
  const clubFor = (teamId: string | null) => teamId === detail.homeTeamId ? row.homeClubId : teamId === detail.awayTeamId ? row.awayClubId : null;
  const kickoff = new Date(row.kickoffAt);
  const goals = detail.events.filter((event) => ["GOAL", "PENALTY", "OWN_GOAL"].includes(event.type)).length;
  // A finished match with goals but no goal events is probably not complete upstream yet: keep it due.
  const complete = goals > 0 || !((row.homeScore ?? 0) + (row.awayScore ?? 0) > 0);
  await db.transaction(async (tx) => {
    const squads = new Map([[row.homeClubId, await squad(tx, row.homeClubId, kickoff)], [row.awayClubId, await squad(tx, row.awayClubId, kickoff)]]);
    const starters = await storedStarters(tx, row.matchId);
    await tx.query(`DELETE FROM "MatchEvent" WHERE "matchId"=$1::uuid AND provider=$2`, [row.matchId, provider]);
    for (const [index, raw] of detail.events.entries()) {
      const clubId = clubFor(raw.teamId);
      const event = orientSubstitution(raw, clubId ? starters.get(clubId) : undefined);
      const players = clubId ? squads.get(clubId) ?? [] : [];
      await tx.query(`INSERT INTO "MatchEvent" (id,"matchId",provider,"externalId","clubId","playerId","relatedPlayerId",type,minute,"addedMinute",detail,"playerName","relatedPlayerName","updatedAt")
        VALUES (gen_random_uuid(),$1::uuid,$2,$3,$4::uuid,$5::uuid,$6::uuid,$7::"MatchEventType",$8,$9,$10,$11,$12,now())`,
        [row.matchId, provider, String(index + 1), clubId, matchSquadPlayer(players, event.player), matchSquadPlayer(players, event.related), event.type, event.minute, event.addedMinute, event.detail, event.player, event.related]);
    }
    await tx.query(`DELETE FROM "MatchStat" WHERE "matchId"=$1::uuid AND provider=$2`, [row.matchId, provider]);
    for (const stat of detail.stats) {
      const clubId = clubFor(stat.teamId);
      if (clubId) await tx.query(`INSERT INTO "MatchStat" (id,"matchId","clubId",provider,metric,value,"updatedAt") VALUES (gen_random_uuid(),$1::uuid,$2::uuid,$3,$4,$5,now()) ON CONFLICT DO NOTHING`, [row.matchId, clubId, provider, stat.metric, stat.value]);
    }
    await upsertSync(tx, row.matchId, { referee: detail.referee, ...(complete ? { detailFetchedAt: now, lastError: null } : {}) }, now);
    if (!complete) await bumpAttempt(tx, row.matchId, "detailAttempts", "INCOMPLETE", now);
    else await tx.query(`UPDATE "MatchDetailSync" SET "detailAttempts"="detailAttempts"+1 WHERE "matchId"=$1::uuid AND provider=$2`, [row.matchId, provider]);
  });
}
async function storeLineups(db: SyncDatabase, row: Due, lineups: HighlightlyLineups, now: Date) {
  const kickoff = new Date(row.kickoffAt);
  await db.transaction(async (tx) => {
    for (const [side, clubId] of [["home", row.homeClubId], ["away", row.awayClubId]] as const) {
      const team = lineups[side];
      const players = await squad(tx, clubId, kickoff);
      const withIds = team.players.map((player) => ({ ...player, playerId: matchSquadPlayer(players, player.name) }));
      await tx.query(`INSERT INTO "MatchLineup" (id,"matchId","clubId",provider,formation,players,"fetchedAt","updatedAt") VALUES (gen_random_uuid(),$1::uuid,$2::uuid,$3,$4,$5::jsonb,$6::timestamptz,now())
        ON CONFLICT ("matchId","clubId",provider) DO UPDATE SET formation=EXCLUDED.formation,players=EXCLUDED.players,"fetchedAt"=EXCLUDED."fetchedAt","updatedAt"=now()`,
        [row.matchId, clubId, provider, team.formation, JSON.stringify(withIds), now]);
    }
    await upsertSync(tx, row.matchId, { lineupsFetchedAt: now, lastError: null }, now);
  });
}

/**
 * One pass: map due matches to provider IDs (one list request per competition and day), then read
 * events/statistics of finished matches and lineups of matches starting within the hour. Stops
 * as soon as today's allowance is spent. Cheap when nothing is due (database reads only).
 */
export async function syncMatchDetails(db: SyncDatabase, api: MatchDetailApi, now = new Date()): Promise<DetailSyncResult> {
  const result: DetailSyncResult = { mapped: 0, lineups: 0, details: 0, requests: 0, stopped: "DONE" };
  const spend = async () => { if (!(await reserveQuota(db, now))) throw new ProviderError("RATE_LIMITED"); result.requests++; };
  try {
    let due = (await dueMatches(db, now)).filter((row) => wantsDetail(row, now) || wantsLineups(row, now));
    // 1. Map unmapped due matches, one list request per competition and UTC day.
    const groups = new Map<string, Due[]>();
    for (const row of due.filter((item) => !item.externalId && since(item.mapAttemptAt, now) >= mapRetryMs)) {
      const key = `${row.leagueId}|${new Date(row.kickoffAt).toISOString().slice(0, 10)}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    for (const [key, rows] of groups) {
      const [leagueId, date] = key.split("|");
      const externalLeague = await leagueExternalId(db, async (name) => { await spend(); return api.leagues(name); }, leagueId, rows[0].leagueSlug);
      await spend();
      const remote = await api.matches({ leagueId: externalLeague, date });
      const pairs = pairMatches(rows.map((row) => ({ id: row.matchId, kickoffAt: new Date(row.kickoffAt), home: row.homeNames, away: row.awayNames })), remote);
      for (const row of rows) {
        const externalId = pairs.get(row.matchId);
        const match = remote.find((item) => item.id === externalId);
        await upsertSync(db, row.matchId, match ? { externalId: match.id, homeTeamExternalId: match.home.id, awayTeamExternalId: match.away.id, mapAttemptAt: now } : { mapAttemptAt: now }, now);
        if (match) result.mapped++;
      }
    }
    due = (await dueMatches(db, now)).filter((row) => row.externalId);
    // 2. Finished matches first (newest first), lineups before events so substitutions can be oriented;
    //    then lineups of the soonest kickoffs.
    const finished = due.filter((item) => wantsDetail(item, now)).sort((a, b) => Date.parse(b.kickoffAt) - Date.parse(a.kickoffAt));
    const upcoming = due.filter((item) => !wantsDetail(item, now) && wantsLineups(item, now)).sort((a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt));
    for (const row of [...finished, ...upcoming]) {
      if (wantsLineups(row, now)) {
        await spend();
        try {
          const lineups = await api.lineups(row.externalId!);
          if (lineups) { await storeLineups(db, row, lineups, now); result.lineups++; } else await bumpAttempt(db, row.matchId, "lineupAttempts", "NOT_PUBLISHED", now);
        } catch (error) { const safe = safeProviderError(error); if (safe.code === "RATE_LIMITED") throw safe; await bumpAttempt(db, row.matchId, "lineupAttempts", safe.code, now); }
      }
      if (wantsDetail(row, now)) {
        await spend();
        try { await storeDetail(db, row, await api.match(row.externalId!), now); result.details++; }
        catch (error) { const safe = safeProviderError(error); if (safe.code === "RATE_LIMITED") throw safe; await bumpAttempt(db, row.matchId, "detailAttempts", safe.code, now); }
      }
    }
  } catch (error) {
    const safe = safeProviderError(error);
    if (safe.code === "RATE_LIMITED") { result.stopped = "QUOTA"; return result; }
    result.stopped = "ERROR"; result.error = safe.code;
  }
  return result;
}
