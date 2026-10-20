import type { SqlExecutor } from "../lib/sync-database";
import type { FeedGroupView } from "../types/feed-card";
import { timelineLeagues } from "../lib/match-timeline";

export type RibbonMatch = {
  slug: string; kickoffAt: string; status: string; leagueSlug: string;
  home: { name: string; crestUrl: string | null }; away: { name: string; crestUrl: string | null };
  homeScore: number | null; awayScore: number | null;
};
type RibbonRow = { slug: string; kickoffAt: string; status: string; leagueSlug: string; homeName: string; homeCrest: string | null; awayName: string; awayCrest: string | null; homeScore: number | null; awayScore: number | null };
const ribbonSelect = `SELECT m.slug,m."kickoffAt"::text AS "kickoffAt",m.status::text AS status,l.slug AS "leagueSlug",COALESCE(h."shortName",h.name) AS "homeName",h."externalCrestUrl" AS "homeCrest",COALESCE(a."shortName",a.name) AS "awayName",a."externalCrestUrl" AS "awayCrest",m."homeScore",m."awayScore"
  FROM "Match" m JOIN "League" l ON l.id=m."leagueId" JOIN "Club" h ON h.id=m."homeClubId" JOIN "Club" a ON a.id=m."awayClubId" WHERE l.slug=ANY($1::text[])`;

/**
 * "Trên sân cỏ": the latest results (last three days, newest first) and then the next fixtures
 * (live ones included) of every supported competition.
 */
export async function readRibbon(tx: SqlExecutor, now: Date, finishedLimit = 6, upcomingLimit = 8): Promise<RibbonMatch[]> {
  const leagues = timelineLeagues.map((league) => league.slug);
  const [finished, upcoming] = await Promise.all([
    tx.query<RibbonRow>(`${ribbonSelect} AND m.status='FINISHED' AND m."homeScore" IS NOT NULL AND m."awayScore" IS NOT NULL AND m."kickoffAt"<=$2::timestamptz AND m."kickoffAt">$2::timestamptz-interval '3 days' ORDER BY m."kickoffAt" DESC,m.id LIMIT $3`, [leagues, now, finishedLimit]),
    tx.query<RibbonRow>(`${ribbonSelect} AND m.status IN ('SCHEDULED','LIVE','HALFTIME') AND m."kickoffAt">$2::timestamptz-interval '3 hours' AND m."kickoffAt"<$2::timestamptz+interval '5 days' ORDER BY m."kickoffAt",m.id LIMIT $3`, [leagues, now, upcomingLimit]),
  ]);
  return [...finished, ...upcoming].map((row) => ({ slug: row.slug, kickoffAt: new Date(row.kickoffAt).toISOString(), status: row.status, leagueSlug: row.leagueSlug, home: { name: row.homeName, crestUrl: row.homeCrest }, away: { name: row.awayName, crestUrl: row.awayCrest }, homeScore: row.homeScore, awayScore: row.awayScore }));
}

/** "Vừa cập nhật" filters: the story types the feed actually carries, in Vietnamese. */
export const updateTabs = [
  { key: "tat-ca", label: "Tất cả", types: null },
  { key: "tran-dau", label: "Trận đấu", types: ["MATCH"] },
  { key: "chuyen-nhuong", label: "Chuyển nhượng", types: ["TRANSFER", "CONTRACT"] },
  { key: "hlv", label: "Huấn luyện viên", types: ["MANAGER"] },
  { key: "phan-tich", label: "Phân tích", types: ["TACTICAL", "INTERVIEW"] },
] as const;
export type UpdateTab = typeof updateTabs[number]["key"];
export const parseUpdateTab = (value: string | string[] | undefined): UpdateTab => updateTabs.find((tab) => tab.key === value)?.key ?? "tat-ca";
/** Story types behind the explore blocks: longer reads, and short off-the-pitch cards. */
export const deepReadTypes = ["TACTICAL", "INTERVIEW"];
export const biteTypes = ["OFF_FIELD", "DISCIPLINE", "INJURY"];

/**
 * Splits the ranked feed into the homepage blocks without repeating a story: three quick points,
 * then a cover (the first remaining story with a picture) and two follow-ups.
 */
export function splitFront(ranked: FeedGroupView[]) {
  const hasImage = (group: FeedGroupView) => [group.lead, ...group.others].some((card) => card.image);
  const quick = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const cover = rest.find(hasImage) ?? rest[0] ?? null;
  const followups = rest.filter((group) => group !== cover).sort((a, b) => Number(hasImage(b)) - Number(hasImage(a))).slice(0, 2);
  return { quick, cover, followups, used: new Set([...quick, ...(cover ? [cover] : []), ...followups].map((group) => group.key)) };
}
