import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
import { matchSquadPlayer, pairMatches, sameName, type SquadPlayer } from "../lib/match-detail-matching";
import { HIGHLIGHTLY, highlightlyLeagues } from "../providers/highlightly/config";
import type { MatchDetailApi } from "../providers/highlightly/provider";
import { cleanName, type HighlightlyBoxScore, type HighlightlyDetail, type HighlightlyLineups, type LineupPlayer } from "../providers/highlightly/normalization";
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

export type DetailSyncResult = { mapped: number; lineups: number; details: number; boxScores: number; requests: number; stopped: "DONE" | "QUOTA" | "ERROR"; error?: string };

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
  lineupsFetchedAt: string | null; lineupAttempts: number | null; detailFetchedAt: string | null; detailAttempts: number | null; boxScoreFetchedAt: string | null; boxScoreAttempts: number | null; syncUpdatedAt: string | null;
};
async function dueMatches(db: SqlExecutor, now: Date) {
  return db.query<Due>(`SELECT m.id AS "matchId",m."leagueId",l.slug AS "leagueSlug",m."kickoffAt",m.status,m."homeScore",m."awayScore",m."homeClubId",m."awayClubId",
      ARRAY[hc.name,hc."shortName"]||hc.aliases AS "homeNames",ARRAY[ac.name,ac."shortName"]||ac.aliases AS "awayNames",
      d."externalId",d."homeTeamExternalId",d."awayTeamExternalId",d."mapAttemptAt",d."lineupsFetchedAt",d."lineupAttempts",d."detailFetchedAt",d."detailAttempts",d."boxScoreFetchedAt",d."boxScoreAttempts",d."updatedAt" AS "syncUpdatedAt"
    FROM "Match" m JOIN "League" l ON l.id=m."leagueId" JOIN "Club" hc ON hc.id=m."homeClubId" JOIN "Club" ac ON ac.id=m."awayClubId"
    LEFT JOIN "MatchDetailSync" d ON d."matchId"=m.id AND d.provider=$1
    WHERE l.slug IN ('premier-league','la-liga','ligue-1','champions-league') AND m.status NOT IN ('CANCELLED','POSTPONED')
      AND m."kickoffAt"<=$3::timestamptz AND (m."kickoffAt">=$2::timestamptz OR (d."externalId" IS NOT NULL AND m."kickoffAt">=$2::timestamptz-interval '30 days'))
      AND (d."detailFetchedAt" IS NULL OR d."lineupsFetchedAt" IS NULL OR d."boxScoreFetchedAt" IS NULL)
    ORDER BY m."kickoffAt",m.id`, [provider, new Date(now.getTime() - lookbackMs), new Date(now.getTime() + lineupLeadMs)]);
}
const since = (value: string | null, now: Date) => value ? now.getTime() - Date.parse(value) : Infinity;
const wantsDetail = (row: Due, now: Date) => row.status === "FINISHED" && !row.detailFetchedAt && (row.detailAttempts ?? 0) < maxAttempts && ((row.detailAttempts ?? 0) === 0 || since(row.syncUpdatedAt, now) >= detailRetryMs);
/** Ratings and per-player figures, once events are in (so the match is complete upstream). */
const wantsBoxScore = (row: Due, now: Date) => row.status === "FINISHED" && Boolean(row.detailFetchedAt) && !row.boxScoreFetchedAt && (row.boxScoreAttempts ?? 0) < maxAttempts
  && ((row.boxScoreAttempts ?? 0) === 0 || since(row.syncUpdatedAt, now) >= detailRetryMs);
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
async function bumpAttempt(db: SqlExecutor, matchId: string, column: "lineupAttempts" | "detailAttempts" | "boxScoreAttempts", error: string | null, now: Date) {
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
/**
 * The club's players around a match. PlayerClub.startsAt is when a squad sync first saw the player,
 * not the contract date, so a squad first synced just after the match must still count: players
 * seen up to 30 days later are included, and players who had left before kickoff are not.
 */
async function squad(db: SqlExecutor, clubId: string, at: Date): Promise<SquadPlayer[]> {
  return db.query<SquadPlayer>(`SELECT DISTINCT p.id,p.name FROM "PlayerClub" pc JOIN "Player" p ON p.id=pc."playerId" WHERE pc."clubId"=$1::uuid AND pc."startsAt"<=$2::timestamptz+interval '30 days' AND (pc."endsAt" IS NULL OR pc."endsAt">=$2::timestamptz)`, [clubId, at]);
}
/** The provider lists an own goal under the team that benefited, so its scorer belongs to the other squad. */
const scorerClub = (type: string, clubId: string | null, homeClubId: string, awayClubId: string) => type === "OWN_GOAL" && clubId ? (clubId === homeClubId ? awayClubId : homeClubId) : clubId;
/** Stored lineups of the match by club. */
async function storedLineups(db: SqlExecutor, matchId: string) {
  const rows = await db.query<{ clubId: string; players: LineupPlayer[] }>(`SELECT "clubId",players FROM "MatchLineup" WHERE "matchId"=$1::uuid AND provider=$2`, [matchId, provider]);
  return new Map(rows.map((row) => [row.clubId, row.players]));
}
type Orientable = { type: string; player: string | null; related: string | null };
/**
 * The provider is not consistent about which name in a substitution came on: sometimes `player`
 * is the incoming player, sometimes the outgoing one. Events are replayed in time order against
 * who is on the pitch (the starting eleven, updated by each substitution), and stored as
 * player = came on, related = went off. Unknown names leave the event as sent.
 */
export function orientSubstitutions<T extends Orientable>(events: T[], clubOf: (event: T) => string | null, lineups: Map<string, Pick<LineupPlayer, "name" | "fullName" | "starter">[]>): T[] {
  const onPitch = new Map([...lineups].map(([clubId, players]) => [clubId, new Set(players.flatMap((player, index) => player.starter ? [index] : []))]));
  const indexOf = (players: Pick<LineupPlayer, "name" | "fullName">[], name: string | null) => {
    if (!name) return -1;
    const hits = players.flatMap((player, index) => sameName(player.name, name) || (player.fullName && sameName(player.fullName, name)) ? [index] : []);
    return hits.length === 1 ? hits[0] : -1;
  };
  return events.map((event) => {
    const clubId = clubOf(event); const players = clubId ? lineups.get(clubId) : undefined; const pitch = clubId ? onPitch.get(clubId) : undefined;
    if (event.type !== "SUBSTITUTION" || !players || !pitch) return event;
    const named = indexOf(players, event.player); const other = indexOf(players, event.related);
    const swap = (named >= 0 && pitch.has(named) && !(other >= 0 && pitch.has(other))) || (named < 0 && other >= 0 && !pitch.has(other));
    const oriented = swap ? { ...event, player: event.related, related: event.player } : event;
    const cameOn = swap ? other : named; const wentOff = swap ? named : other;
    if (wentOff >= 0) pitch.delete(wentOff);
    if (cameOn >= 0) pitch.add(cameOn);
    return oriented;
  });
}

async function storeDetail(db: SyncDatabase, row: Due, detail: HighlightlyDetail, now: Date): Promise<boolean> {
  const clubFor = (teamId: string | null) => teamId === detail.homeTeamId ? row.homeClubId : teamId === detail.awayTeamId ? row.awayClubId : null;
  const kickoff = new Date(row.kickoffAt);
  const goals = detail.events.filter((event) => ["GOAL", "PENALTY", "OWN_GOAL"].includes(event.type)).length;
  // A finished match with goals but no goal events is probably not complete upstream yet: keep it due.
  const complete = goals > 0 || !((row.homeScore ?? 0) + (row.awayScore ?? 0) > 0);
  await db.transaction(async (tx) => {
    const squads = new Map([[row.homeClubId, await squad(tx, row.homeClubId, kickoff)], [row.awayClubId, await squad(tx, row.awayClubId, kickoff)]]);
    const oriented = orientSubstitutions(detail.events, (event) => clubFor(event.teamId), await storedLineups(tx, row.matchId));
    await tx.query(`DELETE FROM "MatchEvent" WHERE "matchId"=$1::uuid AND provider=$2`, [row.matchId, provider]);
    for (const [index, event] of oriented.entries()) {
      const clubId = clubFor(event.teamId);
      const owner = scorerClub(event.type, clubId, row.homeClubId, row.awayClubId);
      const players = owner ? squads.get(owner) ?? [] : [];
      await tx.query(`INSERT INTO "MatchEvent" (id,"matchId",provider,"externalId","clubId","playerId","relatedPlayerId",type,minute,"addedMinute",detail,"playerName","relatedPlayerName","updatedAt")
        VALUES (gen_random_uuid(),$1::uuid,$2,$3,$4::uuid,$5::uuid,$6::uuid,$7::"MatchEventType",$8,$9,$10,$11,$12,now())`,
        [row.matchId, provider, String(index + 1), clubId, matchSquadPlayer(players, event.player), matchSquadPlayer(players, event.related), event.type, event.minute, event.addedMinute, event.detail, event.player, event.related]);
    }
    await tx.query(`DELETE FROM "MatchStat" WHERE "matchId"=$1::uuid AND provider=$2`, [row.matchId, provider]);
    for (const stat of detail.stats) {
      const clubId = clubFor(stat.teamId);
      if (clubId) await tx.query(`INSERT INTO "MatchStat" (id,"matchId","clubId",provider,metric,value,"updatedAt") VALUES (gen_random_uuid(),$1::uuid,$2::uuid,$3,$4,$5,now()) ON CONFLICT DO NOTHING`, [row.matchId, clubId, provider, stat.metric, stat.value]);
    }
    await tx.query(`DELETE FROM "MatchShot" WHERE "matchId"=$1::uuid AND provider=$2`, [row.matchId, provider]);
    for (const [index, shot] of detail.shots.entries()) {
      const clubId = clubFor(shot.teamId);
      if (!clubId) continue;
      await tx.query(`INSERT INTO "MatchShot" (id,"matchId","clubId",provider,sequence,"playerName","playerId",minute,"addedMinute",outcome,"goalTarget","updatedAt") VALUES (gen_random_uuid(),$1::uuid,$2::uuid,$3,$4,$5,$6::uuid,$7,$8,$9,$10,now())`,
        [row.matchId, clubId, provider, index + 1, shot.player, matchSquadPlayer(squads.get(clubId) ?? [], shot.player), shot.minute, shot.addedMinute, shot.outcome, shot.goalTarget]);
    }
    const { venue } = detail;
    await upsertSync(tx, row.matchId, { referee: detail.referee, venueName: venue.name, venueCity: venue.city, venueCapacity: venue.capacity, weather: venue.weather, temperatureC: venue.temperatureC, ...(complete ? { detailFetchedAt: now, lastError: null } : {}) }, now);
    if (!complete) await bumpAttempt(tx, row.matchId, "detailAttempts", "INCOMPLETE", now);
    else await tx.query(`UPDATE "MatchDetailSync" SET "detailAttempts"="detailAttempts"+1 WHERE "matchId"=$1::uuid AND provider=$2`, [row.matchId, provider]);
  });
  return complete;
}
/** Links a lineup entry to the squad, preferring the provider's full name ("Pedro Lomba Neto") over the short one ("Pedro Neto"). */
const linkPlayer = (players: SquadPlayer[], player: { name: string; fullName?: string | null }) => (player.fullName ? matchSquadPlayer(players, player.fullName) : null) ?? matchSquadPlayer(players, player.name);
/**
 * Merges ratings, minutes and per-player figures into the stored lineups (by provider player ID,
 * then name, then full name). A club without a stored lineup is left as it is.
 */
async function storeBoxScore(db: SyncDatabase, row: Due, box: HighlightlyBoxScore, now: Date) {
  const kickoff = new Date(row.kickoffAt);
  await db.transaction(async (tx) => {
    for (const [teamId, clubId] of [[row.homeTeamExternalId, row.homeClubId], [row.awayTeamExternalId, row.awayClubId]] as const) {
      const team = box.find((entry) => entry.teamId === teamId);
      const [lineup] = await tx.query<{ id: string; players: LineupPlayer[] }>(`SELECT id,players FROM "MatchLineup" WHERE "matchId"=$1::uuid AND "clubId"=$2::uuid AND provider=$3`, [row.matchId, clubId, provider]);
      if (!team || !lineup) continue;
      const squadPlayers = await squad(tx, clubId, kickoff);
      const merged = lineup.players.map((player) => {
        const found = team.players.find((entry) => (player.externalId && entry.externalId === player.externalId) || entry.name === player.name || (entry.fullName && entry.fullName === player.name));
        if (!found) return player;
        const next = { ...player, fullName: found.fullName, rating: found.rating, minutes: found.minutes, stats: found.stats, externalId: player.externalId ?? found.externalId };
        return { ...next, playerId: linkPlayer(squadPlayers, next) };
      });
      await tx.query(`UPDATE "MatchLineup" SET players=$2::jsonb,"updatedAt"=now() WHERE id=$1::uuid`, [lineup.id, JSON.stringify(merged)]);
    }
    await upsertSync(tx, row.matchId, { boxScoreFetchedAt: now, lastError: null }, now);
    await tx.query(`UPDATE "MatchDetailSync" SET "boxScoreAttempts"="boxScoreAttempts"+1 WHERE "matchId"=$1::uuid AND provider=$2`, [row.matchId, provider]);
  });
}
async function storeLineups(db: SyncDatabase, row: Due, lineups: HighlightlyLineups, now: Date) {
  const kickoff = new Date(row.kickoffAt);
  await db.transaction(async (tx) => {
    for (const [side, clubId] of [["home", row.homeClubId], ["away", row.awayClubId]] as const) {
      const team = lineups[side];
      const players = await squad(tx, clubId, kickoff);
      const withIds = team.players.map((player) => ({ ...player, playerId: linkPlayer(players, player) }));
      await tx.query(`INSERT INTO "MatchLineup" (id,"matchId","clubId",provider,formation,players,"fetchedAt","updatedAt") VALUES (gen_random_uuid(),$1::uuid,$2::uuid,$3,$4,$5::jsonb,$6::timestamptz,now())
        ON CONFLICT ("matchId","clubId",provider) DO UPDATE SET formation=EXCLUDED.formation,players=EXCLUDED.players,"fetchedAt"=EXCLUDED."fetchedAt","updatedAt"=now()`,
        [row.matchId, clubId, provider, team.formation, JSON.stringify(withIds), now]);
    }
    await upsertSync(tx, row.matchId, { lineupsFetchedAt: now, lastError: null }, now);
  });
}

/**
 * Marks finished matches' events/statistics/shots and box scores to be read again (e.g. after the
 * adapter learned new fields). Nothing is deleted: the worker replaces them as the daily allowance permits.
 */
export async function scheduleDetailRefetch(db: SqlExecutor) {
  const rows = await db.query(`UPDATE "MatchDetailSync" SET "detailFetchedAt"=NULL,"detailAttempts"=0,"boxScoreFetchedAt"=NULL,"boxScoreAttempts"=0,"updatedAt"=now() WHERE provider=$1 AND "detailFetchedAt" IS NOT NULL RETURNING "matchId"`, [provider]);
  return { scheduled: rows.length };
}
/**
 * Re-links stored event and lineup names to canonical squad players without any provider request,
 * e.g. after squads were synced or the name matching improved. Returns how many links changed.
 */
export async function relinkMatchDetails(db: SyncDatabase) {
  let changed = 0;
  const matches = await db.query<{ id: string; kickoffAt: string; homeClubId: string; awayClubId: string }>(`SELECT DISTINCT m.id,m."kickoffAt",m."homeClubId",m."awayClubId" FROM "Match" m JOIN "MatchDetailSync" d ON d."matchId"=m.id AND d.provider=$1`, [provider]);
  for (const match of matches) {
    await db.transaction(async (tx) => {
      const kickoff = new Date(match.kickoffAt);
      const squads = new Map([[match.homeClubId, await squad(tx, match.homeClubId, kickoff)], [match.awayClubId, await squad(tx, match.awayClubId, kickoff)]]);
      const stored = await tx.query<{ id: string; type: string; clubId: string | null; playerId: string | null; relatedPlayerId: string | null; playerName: string | null; relatedPlayerName: string | null }>(`SELECT id,type::text,"clubId","playerId","relatedPlayerId","playerName","relatedPlayerName" FROM "MatchEvent" WHERE "matchId"=$1::uuid AND provider=$2 ORDER BY minute NULLS LAST,"addedMinute" NULLS FIRST,("externalId")::int`, [match.id, provider]);
      const cleaned = stored.map((event) => ({ ...event, player: event.playerName && cleanName(event.playerName), related: event.relatedPlayerName && cleanName(event.relatedPlayerName) }));
      const oriented = orientSubstitutions(cleaned, (event) => event.clubId, await storedLineups(tx, match.id));
      for (const event of oriented) {
        const owner = scorerClub(event.type, event.clubId, match.homeClubId, match.awayClubId);
        const players = owner ? squads.get(owner) ?? [] : [];
        const playerName = event.player; const relatedPlayerName = event.related;
        const playerId = matchSquadPlayer(players, playerName); const relatedPlayerId = matchSquadPlayer(players, relatedPlayerName);
        if (playerId === event.playerId && relatedPlayerId === event.relatedPlayerId && playerName === event.playerName && relatedPlayerName === event.relatedPlayerName) continue;
        await tx.query(`UPDATE "MatchEvent" SET "playerId"=$2::uuid,"relatedPlayerId"=$3::uuid,"playerName"=$4,"relatedPlayerName"=$5,"updatedAt"=now() WHERE id=$1::uuid`, [event.id, playerId, relatedPlayerId, playerName, relatedPlayerName]); changed++;
      }
      const shots = await tx.query<{ id: string; clubId: string; playerName: string | null; playerId: string | null }>(`SELECT id,"clubId","playerName","playerId" FROM "MatchShot" WHERE "matchId"=$1::uuid AND provider=$2`, [match.id, provider]);
      for (const shot of shots) {
        const playerId = matchSquadPlayer(squads.get(shot.clubId) ?? [], shot.playerName);
        if (playerId !== shot.playerId) { await tx.query(`UPDATE "MatchShot" SET "playerId"=$2::uuid,"updatedAt"=now() WHERE id=$1::uuid`, [shot.id, playerId]); changed++; }
      }
      const lineups = await tx.query<{ id: string; clubId: string; players: LineupPlayer[] }>(`SELECT id,"clubId",players FROM "MatchLineup" WHERE "matchId"=$1::uuid AND provider=$2`, [match.id, provider]);
      for (const lineup of lineups) {
        const players = squads.get(lineup.clubId) ?? [];
        const relinked = lineup.players.map((player) => { const name = cleanName(player.name); return { ...player, name, playerId: linkPlayer(players, { name, fullName: player.fullName }) }; });
        const delta = relinked.filter((player, index) => player.playerId !== (lineup.players[index].playerId ?? null) || player.name !== lineup.players[index].name).length;
        if (!delta) continue;
        await tx.query(`UPDATE "MatchLineup" SET players=$2::jsonb,"updatedAt"=now() WHERE id=$1::uuid`, [lineup.id, JSON.stringify(relinked)]); changed += delta;
      }
    });
  }
  return { matches: matches.length, changed };
}

/**
 * One pass: map due matches to provider IDs (one list request per competition and day), then read
 * events/statistics of finished matches and lineups of matches starting within the hour. Stops
 * as soon as today's allowance is spent. Cheap when nothing is due (database reads only).
 */
export async function syncMatchDetails(db: SyncDatabase, api: MatchDetailApi, now = new Date()): Promise<DetailSyncResult> {
  const result: DetailSyncResult = { mapped: 0, lineups: 0, details: 0, boxScores: 0, requests: 0, stopped: "DONE" };
  const spend = async () => { if (!(await reserveQuota(db, now))) throw new ProviderError("RATE_LIMITED"); result.requests++; };
  try {
    let due = (await dueMatches(db, now)).filter((row) => wantsDetail(row, now) || wantsLineups(row, now) || wantsBoxScore(row, now));
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
    const finished = due.filter((item) => wantsDetail(item, now) || wantsBoxScore(item, now)).sort((a, b) => Date.parse(b.kickoffAt) - Date.parse(a.kickoffAt));
    const upcoming = due.filter((item) => !finished.includes(item) && wantsLineups(item, now)).sort((a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt));
    for (const row of [...finished, ...upcoming]) {
      if (wantsLineups(row, now)) {
        await spend();
        try {
          const lineups = await api.lineups(row.externalId!);
          if (lineups) { await storeLineups(db, row, lineups, now); result.lineups++; } else await bumpAttempt(db, row.matchId, "lineupAttempts", "NOT_PUBLISHED", now);
        } catch (error) { const safe = safeProviderError(error); if (safe.code === "RATE_LIMITED") throw safe; await bumpAttempt(db, row.matchId, "lineupAttempts", safe.code, now); }
      }
      let current = row;
      if (wantsDetail(row, now)) {
        await spend();
        try { if (await storeDetail(db, row, await api.match(row.externalId!), now)) current = { ...row, detailFetchedAt: now.toISOString() }; result.details++; }
        catch (error) { const safe = safeProviderError(error); if (safe.code === "RATE_LIMITED") throw safe; await bumpAttempt(db, row.matchId, "detailAttempts", safe.code, now); }
      }
      if (wantsBoxScore(current, now)) {
        await spend();
        try { await storeBoxScore(db, current, await api.boxScore(row.externalId!), now); result.boxScores++; }
        catch (error) { const safe = safeProviderError(error); if (safe.code === "RATE_LIMITED") throw safe; await bumpAttempt(db, row.matchId, "boxScoreAttempts", safe.code, now); }
      }
    }
  } catch (error) {
    const safe = safeProviderError(error);
    if (safe.code === "RATE_LIMITED") { result.stopped = "QUOTA"; return result; }
    result.stopped = "ERROR"; result.error = safe.code;
  }
  return result;
}
