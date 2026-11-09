import type { SqlExecutor } from "../lib/sync-database";
import type { FeedGroupView } from "../types/feed-card";
import type { HotTopic } from "./hot-now";
import { timelineLeagues } from "../lib/match-timeline";
import { playedToday, vnShortDate } from "../lib/home-dates";

import { dramaLabels, parseUpdateTab, updateTabs, type DramaTag, type UpdateTab } from "../lib/home-labels";

export { dramaLabels, parseUpdateTab, updateTabs, type DramaTag, type UpdateTab };
const dramaOrder: DramaTag[] = ["comeback", "late", "hattrick", "red", "goalfest"];
export type DramaEvent = { type: string; clubId: string | null; playerId: string | null; playerName: string | null; minute: number | null; addedMinute: number | null };
type DramaMatch = { status: string; homeClubId: string; awayClubId: string; homeScore: number | null; awayScore: number | null };

const goalTypes = ["GOAL", "PENALTY", "OWN_GOAL"];
/**
 * "Bàn phút 90+" (a goal from the 90th minute on), "Lội ngược dòng" (the winner was behind at some point), "Thẻ đỏ",
 * "Hat-trick" (one player, three goals that are not own goals) and "Mưa bàn thắng" (six goals or more). The comeback is
 * only derived when every goal has a minute and the goal events add up to the final score; otherwise the order is unknown.
 * The provider files an own goal under the club that benefited, so a goal event's club is always the scoring side.
 */
export function dramaTags(match: DramaMatch, events: DramaEvent[]): DramaTag[] {
  const played = ["FINISHED", "LIVE", "HALFTIME"].includes(match.status);
  if (!played) return [];
  const finished = match.status === "FINISHED" && match.homeScore !== null && match.awayScore !== null;
  const goals = events.filter((event) => goalTypes.includes(event.type));
  const tags = new Set<DramaTag>();
  if (goals.some((event) => event.minute !== null && event.minute >= 90)) tags.add("late");
  if (events.some((event) => event.type === "RED_CARD")) tags.add("red");
  const byPlayer = new Map<string, number>();
  for (const event of goals) {
    const key = event.type === "OWN_GOAL" ? null : event.playerId ?? event.playerName?.trim().toLocaleLowerCase("vi-VN") ?? null;
    if (key) byPlayer.set(key, (byPlayer.get(key) ?? 0) + 1);
  }
  if ([...byPlayer.values()].some((count) => count >= 3)) tags.add("hattrick");
  if (finished && match.homeScore! + match.awayScore! >= 6) tags.add("goalfest");
  if (finished && match.homeScore !== match.awayScore) {
    const side = (event: DramaEvent) => event.clubId === match.homeClubId ? 1 : event.clubId === match.awayClubId ? -1 : 0;
    const complete = goals.every((event) => event.minute !== null && side(event) !== 0)
      && goals.filter((event) => side(event) === 1).length === match.homeScore && goals.filter((event) => side(event) === -1).length === match.awayScore;
    if (complete) {
      const winner = match.homeScore! > match.awayScore! ? 1 : -1; let lead = 0;
      const ordered = [...goals].sort((a, b) => a.minute! - b.minute! || (a.addedMinute ?? 0) - (b.addedMinute ?? 0));
      if (ordered.some((event) => { lead += side(event); return lead * winner < 0; })) tags.add("comeback");
    }
  }
  return dramaOrder.filter((tag) => tags.has(tag));
}

export type RibbonMatch = {
  slug: string; kickoffAt: string; status: string; leagueSlug: string;
  home: { id: string; name: string; crestUrl: string | null }; away: { id: string; name: string; crestUrl: string | null };
  homeScore: number | null; awayScore: number | null; tags: DramaTag[];
};
type RibbonRow = { id: string; slug: string; kickoffAt: string; status: string; leagueSlug: string; homeId: string; homeName: string; homeCrest: string | null; awayId: string; awayName: string; awayCrest: string | null; homeScore: number | null; awayScore: number | null };
const ribbonSelect = `SELECT m.id,m.slug,m."kickoffAt"::text AS "kickoffAt",m.status::text AS status,l.slug AS "leagueSlug",h.id AS "homeId",COALESCE(h."shortName",h.name) AS "homeName",h."externalCrestUrl" AS "homeCrest",a.id AS "awayId",COALESCE(a."shortName",a.name) AS "awayName",a."externalCrestUrl" AS "awayCrest",m."homeScore",m."awayScore"
  FROM "Match" m JOIN "League" l ON l.id=m."leagueId" JOIN "Club" h ON h.id=m."homeClubId" JOIN "Club" a ON a.id=m."awayClubId" WHERE l.slug=ANY($1::text[])`;

/** Goal and red-card events of the given matches, one provider per match (the one that stored the most). */
async function dramaEvents(tx: SqlExecutor, ids: string[]) {
  if (!ids.length) return new Map<string, DramaEvent[]>();
  const rows = await tx.query<DramaEvent & { matchId: string; provider: string }>(`SELECT "matchId",provider,type::text AS type,"clubId","playerId","playerName",minute,"addedMinute" FROM "MatchEvent" WHERE "matchId"=ANY($1::uuid[]) AND type IN ('GOAL','OWN_GOAL','PENALTY','RED_CARD')`, [ids]);
  const byMatch = new Map<string, Map<string, DramaEvent[]>>();
  for (const row of rows) {
    const providers = byMatch.get(row.matchId) ?? new Map<string, DramaEvent[]>(); byMatch.set(row.matchId, providers);
    providers.set(row.provider, [...(providers.get(row.provider) ?? []), { type: row.type, clubId: row.clubId, playerId: row.playerId, playerName: row.playerName, minute: row.minute, addedMinute: row.addedMinute }]);
  }
  return new Map([...byMatch].map(([id, providers]) => [id, [...providers.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0][1]]));
}

/**
 * "Trên sân cỏ": the latest results (last three days, newest first) and then the next fixtures (live ones included) of every
 * supported competition, each with its drama tags. On a quiet stretch (an international break) with neither, it falls back to
 * the next fixtures: the seven days that start with the next scheduled kick-off.
 */
export async function readRibbon(tx: SqlExecutor, now: Date, finishedLimit = 14, upcomingLimit = 8): Promise<RibbonMatch[]> {
  const leagues = timelineLeagues.map((league) => league.slug);
  const [finished, upcoming] = await Promise.all([
    tx.query<RibbonRow>(`${ribbonSelect} AND m.status='FINISHED' AND m."homeScore" IS NOT NULL AND m."awayScore" IS NOT NULL AND m."kickoffAt"<=$2::timestamptz AND m."kickoffAt">$2::timestamptz-interval '3 days' ORDER BY m."kickoffAt" DESC,m.id LIMIT $3`, [leagues, now, finishedLimit]),
    tx.query<RibbonRow>(`${ribbonSelect} AND m.status IN ('SCHEDULED','LIVE','HALFTIME') AND m."kickoffAt">$2::timestamptz-interval '3 hours' AND m."kickoffAt"<$2::timestamptz+interval '5 days' ORDER BY m."kickoffAt",m.id LIMIT $3`, [leagues, now, upcomingLimit]),
  ]);
  let rows = [...finished, ...upcoming];
  if (!rows.length) {
    const next = await tx.query<RibbonRow>(`${ribbonSelect} AND m.status='SCHEDULED' AND m."kickoffAt">$2::timestamptz ORDER BY m."kickoffAt",m.id LIMIT $3`, [leagues, now, upcomingLimit]);
    rows = next.filter((row) => Date.parse(row.kickoffAt) < Date.parse(next[0].kickoffAt) + 7 * 86_400_000);
  }
  const events = await dramaEvents(tx, rows.filter((row) => row.status !== "SCHEDULED").map((row) => row.id));
  return rows.map((row) => {
    const match = { status: row.status, homeClubId: row.homeId, awayClubId: row.awayId, homeScore: row.homeScore, awayScore: row.awayScore };
    return { slug: row.slug, kickoffAt: new Date(row.kickoffAt).toISOString(), status: row.status, leagueSlug: row.leagueSlug, home: { id: row.homeId, name: row.homeName, crestUrl: row.homeCrest }, away: { id: row.awayId, name: row.awayName, crestUrl: row.awayCrest }, homeScore: row.homeScore, awayScore: row.awayScore, tags: dramaTags(match, events.get(row.id) ?? []) };
  });
}

/** The strip's order: matches of the reader's clubs first, then matches with a drama tag, then the rest, each group in its stored order. */
export function orderRibbon(matches: RibbonMatch[], followedClubIds: string[]) {
  const followed = new Set(followedClubIds);
  const rank = (match: RibbonMatch) => followed.has(match.home.id) || followed.has(match.away.id) ? 0 : match.tags.length ? 1 : 2;
  return matches.map((match, index) => ({ match, index })).sort((a, b) => rank(a.match) - rank(b.match) || a.index - b.index).map((item) => item.match);
}

export type WatchMatch = { slug: string; kickoffAt: string; leagueSlug: string; home: { name: string; crestUrl: string | null; position: number }; away: { name: string; crestUrl: string | null; position: number } };
/**
 * "Trận đáng xem tiếp theo": of the scheduled matches in the next seven days, the one between the highest-placed clubs
 * (smallest sum of their stored table positions in that competition's season); the earlier kick-off wins a tie.
 */
export async function readWatchMatch(tx: SqlExecutor, now: Date): Promise<WatchMatch | null> {
  const position = (side: "homeClubId" | "awayClubId") => `(SELECT st.position FROM "Standing" st WHERE st."clubId"=m."${side}" AND st."seasonId"=m."seasonId" AND st."tableType"='TOTAL' ORDER BY st."fetchedAt" DESC,st.id LIMIT 1)`;
  const rows = await tx.query<{ slug: string; kickoffAt: string; leagueSlug: string; homeName: string; homeCrest: string | null; homePosition: number; awayName: string; awayCrest: string | null; awayPosition: number }>(
    `SELECT * FROM (SELECT m.slug,m."kickoffAt"::text AS "kickoffAt",m.id,l.slug AS "leagueSlug",COALESCE(h."shortName",h.name) AS "homeName",h."externalCrestUrl" AS "homeCrest",${position("homeClubId")} AS "homePosition",
       COALESCE(a."shortName",a.name) AS "awayName",a."externalCrestUrl" AS "awayCrest",${position("awayClubId")} AS "awayPosition"
     FROM "Match" m JOIN "League" l ON l.id=m."leagueId" JOIN "Club" h ON h.id=m."homeClubId" JOIN "Club" a ON a.id=m."awayClubId"
     WHERE l.slug=ANY($1::text[]) AND m.status='SCHEDULED' AND m."kickoffAt">$2::timestamptz AND m."kickoffAt"<$2::timestamptz+interval '7 days') x
     WHERE "homePosition" IS NOT NULL AND "awayPosition" IS NOT NULL ORDER BY "homePosition"+"awayPosition","kickoffAt",id LIMIT 1`, [timelineLeagues.map((league) => league.slug), now]);
  const row = rows[0];
  return row ? { slug: row.slug, kickoffAt: new Date(row.kickoffAt).toISOString(), leagueSlug: row.leagueSlug, home: { name: row.homeName, crestUrl: row.homeCrest, position: row.homePosition }, away: { name: row.awayName, crestUrl: row.awayCrest, position: row.awayPosition } } : null;
}

/** The newest time a news story was collected, or null when none is stored. */
export async function readNewsCollectedAt(tx: SqlExecutor): Promise<string | null> {
  const rows = await tx.query<{ at: string | null }>(`SELECT max("collectedAt")::text AS at FROM "Article"`);
  return rows[0]?.at ? new Date(rows[0].at).toISOString() : null;
}

export type DayMode = { kind: "live" | "matchday" | "between"; text: string };
/** What kind of day it is, from the stored fixtures: matches being played, a match day, or the days between two rounds. */
export function dayMode(matches: RibbonMatch[], now: Date): DayMode {
  const live = matches.filter((match) => match.status === "LIVE" || match.status === "HALFTIME").length;
  if (live) return { kind: "live", text: `${live} trận đang diễn ra` };
  const today = matches.filter((match) => playedToday(match.kickoffAt, now)).length;
  if (today) return { kind: "matchday", text: `Ngày thi đấu · ${today} trận hôm nay` };
  const next = matches.filter((match) => match.status === "SCHEDULED" && Date.parse(match.kickoffAt) > now.getTime()).sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt))[0];
  return { kind: "between", text: next ? `Giữa hai vòng đấu · Trận tới ${vnShortDate(next.kickoffAt)}` : "Giữa hai vòng đấu" };
}

/** Story types behind the short off-the-pitch cards of "Khám phá". */
export const biteTypes = ["OFF_FIELD", "DISCIPLINE", "INJURY"];

const cardsOf = (group: FeedGroupView) => [group.lead, ...group.others];
/** Stories of the last 72 hours; when fewer than five, the whole stored week (the list window) so the page never runs dry. */
export function storyWindow(groups: FeedGroupView[], now: Date, hours = 72, minimum = 5) {
  const recent = groups.filter((group) => now.getTime() - Date.parse(group.latestAt) <= hours * 3_600_000);
  return recent.length >= minimum ? recent : groups;
}

/**
 * "Hôm nay": a cover (the best-ranked story with a picture among the first five, else the first) and the next four stories,
 * never repeating one. `used` lets the blocks below skip them.
 */
export function splitToday(ranked: FeedGroupView[]) {
  const hasImage = (group: FeedGroupView) => cardsOf(group).some((card) => card.image);
  const cover = ranked.slice(0, 5).find(hasImage) ?? ranked[0] ?? null;
  const stories = ranked.filter((group) => group !== cover).slice(0, 4);
  return { cover, stories, used: new Set([...(cover ? [cover] : []), ...stories].map((group) => group.key)) };
}

export type HotReason = { title: string; href: string };
/** Why a club or player is hot: the headline of the most-covered story naming it (most papers, then the newest). */
export function hotReasons(topics: HotTopic[], groups: FeedGroupView[]): Record<string, HotReason> {
  const reasons: Record<string, HotReason> = {};
  for (const topic of topics) {
    const best = groups.filter((group) => cardsOf(group).some((card) => card.entities.some((entity) => entity.kind === topic.kind && entity.id === topic.id)))
      .sort((a, b) => b.others.length - a.others.length || b.latestAt.localeCompare(a.latestAt))[0];
    if (best) reasons[`${topic.kind}-${topic.id}`] = { title: best.lead.title, href: `/news/${best.lead.slug}` };
  }
  return reasons;
}
