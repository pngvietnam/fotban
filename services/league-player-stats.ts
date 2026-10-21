import type { SqlExecutor } from "../lib/sync-database";
import { playerPath } from "../lib/player-presentation";
import type { LeagueSlug } from "../types/league-hub";

/**
 * Player figures computed from the per-player box scores Fotban already stores (Highlightly), for the matches
 * that have one. The page always says how many of the league's finished matches that is.
 */
type Row = { matchId: string; kickoffAt: string; clubId: string; clubName: string; crestUrl: string | null; playerId: string | null; name: string; fullName: string | null; position: string | null; minutes: number | null; rating: number | null; stats: Record<string, number> | null };
export type Coverage = { matches: number; finished: number };
export type StatPlayer = { key: string; name: string; playerPath: string | null; clubName: string; crestUrl: string | null; photoUrl: string | null };
export type Leader = StatPlayer & { value: number; sub: string };
export type TeamOfWeekPlayer = StatPlayer & { position: "GK" | "DF" | "MF" | "FW"; rating: number; goals: number; assists: number; opponent: string | null };
export type PlayerBoards = { coverage: Coverage; boards: { key: string; title: string; unit: string; leaders: Leader[] }[] };

const groupOf = (position: string | null): TeamOfWeekPlayer["position"] | null => /goalkeeper/i.test(position ?? "") ? "GK" : /defen|back/i.test(position ?? "") ? "DF" : /midfield/i.test(position ?? "") ? "MF" : /forward|attack|wing|striker/i.test(position ?? "") ? "FW" : null;
const num = (row: Row, key: string) => Number(row.stats?.[key] ?? 0) || 0;

async function rows(tx: SqlExecutor, slug: LeagueSlug, from: Date | null, to: Date | null): Promise<Row[]> {
  return tx.query<Row>(`SELECT m.id AS "matchId",m."kickoffAt",c.id AS "clubId",c.name AS "clubName",c."externalCrestUrl" AS "crestUrl",NULLIF(p->>'playerId','') AS "playerId",p->>'name' AS name,p->>'fullName' AS "fullName",p->>'position' AS position,
      NULLIF(p->>'minutes','')::int AS minutes,NULLIF(p->>'rating','')::float AS rating,p->'stats' AS stats
    FROM "MatchLineup" ml JOIN "Match" m ON m.id=ml."matchId" JOIN "League" l ON l.id=m."leagueId" JOIN "Club" c ON c.id=ml."clubId", jsonb_array_elements(ml.players) p
    WHERE l.slug=$1 AND m.status='FINISHED' AND p ? 'rating' AND ($2::timestamptz IS NULL OR m."kickoffAt">=$2::timestamptz) AND ($3::timestamptz IS NULL OR m."kickoffAt"<$3::timestamptz)`, [slug, from, to]);
}
async function photos(tx: SqlExecutor, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const found = await tx.query<{ playerId: string; photoUrl: string }>(`SELECT "playerId","thumbUrl" AS "photoUrl" FROM "PlayerImage" WHERE status='FOUND' AND "playerId"=ANY($1::uuid[]) AND "thumbUrl" IS NOT NULL`, [ids]);
  return new Map(found.map((row) => [row.playerId, row.photoUrl]));
}
async function coverage(tx: SqlExecutor, slug: LeagueSlug, from: Date | null, to: Date | null): Promise<Coverage> {
  const [row] = await tx.query<{ finished: number; matches: number }>(`SELECT count(*)::int AS finished,count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "MatchLineup" ml WHERE ml."matchId"=m.id AND ml.players::text LIKE '%"rating"%'))::int AS matches
    FROM "Match" m JOIN "League" l ON l.id=m."leagueId" WHERE l.slug=$1 AND m.status='FINISHED' AND ($2::timestamptz IS NULL OR m."kickoffAt">=$2::timestamptz) AND ($3::timestamptz IS NULL OR m."kickoffAt"<$3::timestamptz)`, [slug, from, to]);
  return row ?? { finished: 0, matches: 0 };
}
const who = (row: Row, photo: Map<string, string>): StatPlayer => ({ key: row.playerId ?? `${row.clubId}:${row.name}`, name: row.name || row.fullName || "", playerPath: row.playerId ? playerPath(row.playerId) : null, clubName: row.clubName, crestUrl: row.crestUrl, photoUrl: row.playerId ? photo.get(row.playerId) ?? null : null });

/**
 * Team of the round: the best 4-3-3 from the finished matches of a window. A player counts with at least 60
 * minutes (a goalkeeper too); the order is the provider rating, then goals + assists, then minutes. No club
 * gives more than three players, so one big win does not fill the side.
 */
export async function teamOfTheWeek(tx: SqlExecutor, slug: LeagueSlug, from: Date, to: Date) {
  const [all, cover] = await Promise.all([rows(tx, slug, from, to), coverage(tx, slug, from, to)]);
  const pool = all.filter((row) => row.rating !== null && (row.minutes ?? 0) >= 60 && groupOf(row.position));
  const score = (row: Row) => [row.rating ?? 0, num(row, "goalsScored") + num(row, "assists"), row.minutes ?? 0];
  const better = (a: Row, b: Row) => { const x = score(a); const y = score(b); return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]; };
  const need = { GK: 1, DF: 4, MF: 3, FW: 3 } as const;
  const perClub = new Map<string, number>(); const chosen: Row[] = [];
  for (const group of ["FW", "MF", "DF", "GK"] as const) {
    for (const row of pool.filter((item) => groupOf(item.position) === group).sort(better)) {
      if (chosen.filter((item) => groupOf(item.position) === group).length >= need[group]) break;
      if ((perClub.get(row.clubId) ?? 0) >= 3) continue;
      perClub.set(row.clubId, (perClub.get(row.clubId) ?? 0) + 1); chosen.push(row);
    }
  }
  const opponents = chosen.length ? await tx.query<{ matchId: string; clubId: string; opponent: string }>(`SELECT m.id AS "matchId",c.id AS "clubId",CASE WHEN m."homeClubId"=c.id THEN COALESCE(ac."shortName",ac.name) ELSE COALESCE(hc."shortName",hc.name) END AS opponent
    FROM "Match" m JOIN "Club" hc ON hc.id=m."homeClubId" JOIN "Club" ac ON ac.id=m."awayClubId" JOIN "Club" c ON c.id IN (m."homeClubId",m."awayClubId") WHERE m.id=ANY($1::uuid[])`, [[...new Set(chosen.map((row) => row.matchId))]]) : [];
  const against = new Map(opponents.map((row) => [`${row.matchId}:${row.clubId}`, row.opponent]));
  const photo = await photos(tx, chosen.flatMap((row) => row.playerId ? [row.playerId] : []));
  const order = { GK: 0, DF: 1, MF: 2, FW: 3 } as const;
  const players: TeamOfWeekPlayer[] = chosen.map((row) => ({ ...who(row, photo), position: groupOf(row.position)!, rating: row.rating ?? 0, goals: num(row, "goalsScored"), assists: num(row, "assists"), opponent: against.get(`${row.matchId}:${row.clubId}`) ?? null }))
    .sort((a, b) => order[a.position] - order[b.position] || b.rating - a.rating);
  return { players, coverage: cover, complete: chosen.length === 11 };
}

/** Leaders from box scores over the whole season stored: average rating, assists, shots on target, key passes, defensive actions. */
export async function playerBoards(tx: SqlExecutor, slug: LeagueSlug): Promise<PlayerBoards> {
  const [all, cover] = await Promise.all([rows(tx, slug, null, null), coverage(tx, slug, null, null)]);
  const byPlayer = new Map<string, { row: Row; games: number; minutes: number; rating: number; assists: number; onTarget: number; keyPasses: number; defence: number; goals: number }>();
  for (const row of all) {
    if (!row.playerId || (row.minutes ?? 0) < 1) continue;
    const entry = byPlayer.get(row.playerId) ?? { row, games: 0, minutes: 0, rating: 0, assists: 0, onTarget: 0, keyPasses: 0, defence: 0, goals: 0 };
    entry.games++; entry.minutes += row.minutes ?? 0; entry.rating += (row.rating ?? 0) * (row.minutes ?? 0); entry.assists += num(row, "assists"); entry.onTarget += num(row, "shotsOnTarget");
    entry.keyPasses += num(row, "passesKey"); entry.defence += num(row, "tacklesTotal") + num(row, "interceptionsTotal"); entry.goals += num(row, "goalsScored");
    byPlayer.set(row.playerId, entry);
  }
  const list = [...byPlayer.values()];
  const photo = await photos(tx, list.map((item) => item.row.playerId!));
  const top = (key: string, title: string, unit: string, pool: typeof list, value: (item: typeof list[number]) => number, format: (v: number) => number, sub: (item: typeof list[number]) => string): PlayerBoards["boards"][number] => ({
    key, title, unit, leaders: pool.map((item) => ({ item, v: value(item) })).filter(({ v }) => v > 0).sort((a, b) => b.v - a.v || b.item.minutes - a.item.minutes).slice(0, 10).map(({ item, v }) => ({ ...who(item.row, photo), value: format(v), sub: sub(item) })),
  });
  const games = (item: typeof list[number]) => `${item.games} trận`;
  const rated = list.filter((item) => item.games >= 2 && item.minutes >= 120);
  return { coverage: cover, boards: [
    top("rating", "Điểm trung bình cao nhất", "điểm", rated, (item) => item.rating / item.minutes, (v) => Math.round(v * 100) / 100, (item) => `${games(item)} · ${item.minutes} phút`),
    top("assists", "Kiến tạo", "kiến tạo", list, (item) => item.assists, (v) => v, games),
    top("shots", "Sút trúng đích", "cú sút", list, (item) => item.onTarget, (v) => v, (item) => `${games(item)}${item.goals ? ` · ${item.goals} bàn` : ""}`),
    top("keypasses", "Đường chuyền quyết định", "đường chuyền", list, (item) => item.keyPasses, (v) => v, games),
    top("defence", "Tắc bóng và cắt bóng", "pha", list, (item) => item.defence, (v) => v, games),
  ].filter((board) => board.leaders.length) };
}
