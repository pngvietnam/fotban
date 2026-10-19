import { buildMorningBrief } from "../../services/brief-builder";
import type { BriefView } from "../../services/brief-query";
import { briefWindow, resolveBriefRequest } from "../../lib/brief-policy";
import { composeHomepage, type HomeEnrichment } from "../../services/morning-homepage";
import type { BriefCandidate, BriefMatch } from "../../types/morning-brief";
import { emptyTransferFacts } from "../../types/transfers";
import { briefNow, briefStory } from "./briefs";
import { vidId } from "./videos";
import type { SyncDatabase } from "../../lib/sync-database";
import { transferIds } from "./transfer-store";

export function homeMatch(n = 1, upcoming = false): BriefCandidate {
  const match: BriefMatch = { id: vidId(60000 + n), slug: `test-match-${n}`, league: "premier-league", leagueName: "Premier League", homeId: vidId(60010), awayId: vidId(60011), home: "Arsenal", away: "Chelsea", kickoffAt: upcoming ? "2026-10-18T18:00:00Z" : "2026-10-17T18:00:00Z", status: upcoming ? "SCHEDULED" : "FINISHED", homeScore: upcoming ? null : 2, awayScore: upcoming ? null : 1, homeExtraTimeScore: null, awayExtraTimeScore: null, homePenaltyScore: null, awayPenaltyScore: null, scoreDuration: null, provider: "FOOTBALL_DATA", sourceUrl: "https://www.football-data.org/", observedAt: "2026-10-17T22:00:00Z", events: [] };
  return briefStory(n, { key: `match:${match.id}`, section: upcoming ? "UPCOMING" : "RESULTS", titleVi: upcoming ? "Arsenal gặp Chelsea" : "Arsenal thắng Chelsea 2 – 1", summaryVi: upcoming ? "Lịch đấu đã ghi nhận." : "Kết quả đã ghi nhận từ dữ liệu trận đấu.", match, clusterId: null, articleIds: [], reliability: { ...briefStory().reliability, label: "OFFICIAL" } });
}
export function homeBrief(candidates: BriefCandidate[] = [briefStory()]): BriefView {
  const request = resolveBriefRequest({ date: "2026-10-18" }); const window = briefWindow(request, briefNow);
  return { id: vidId(61000), briefId: vidId(61001), revision: 1, status: "PUBLISHED", generatedAt: "2026-10-18T01:03:00Z", publishedAt: "2026-10-18T01:04:00Z", document: buildMorningBrief(request, window, { candidates, excluded: 0 }), highlights: {}, highlightFallbackVi: "Chưa tìm thấy highlight từ nguồn được xác minh." };
}
export function homeEnrichment(candidates: BriefCandidate[]) {
  return new Map<string, HomeEnrichment>(candidates.filter((item) => !item.match).map((item) => [item.key, { storyType: item.transferId ? "TRANSFER" : item.section === "OFF_FIELD" ? "OFF_FIELD" : "CLUB", entities: [{ kind: "club", name: "Arsenal", initials: "ARS" }], transfer: item.transferId ? { player: "Player X", currentClub: "Origin", targetClub: "Arsenal", facts: emptyTransferFacts() } : null }]));
}
export function homepageFixture(candidates: BriefCandidate[] = [briefStory()]) { return composeHomepage(homeBrief(candidates), homeEnrichment(candidates), { partial: false, staleInputs: false }, briefNow); }
export async function seedHomepageMatch(database: SyncDatabase, kickoff = "2026-10-17T18:00:00Z") {
  const id = vidId(62000); const season = vidId(62001);
  await database.query('INSERT INTO "Season" (id,"leagueId",name,"updatedAt") VALUES ($1::uuid,$2::uuid,\'2026/2027\',now())', [season, transferIds.league]);
  await database.query('INSERT INTO "Match" (id,slug,provider,"externalId","leagueId","seasonId","homeClubId","awayClubId","kickoffAt",status,"homeScore","awayScore","lastUpdatedAt","updatedAt") VALUES ($1::uuid,\'home-fixture\',\'FOOTBALL_DATA\',\'home-fixture\',$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::timestamptz,\'FINISHED\',2,1,\'2026-10-17T21:00:00Z\',now())', [id, transferIds.league, season, transferIds.arsenal, transferIds.chelsea, kickoff]);
  await database.query('INSERT INTO "ExternalIdentity" (id,provider,"entityType","externalId","matchId","updatedAt") VALUES ($1::uuid,\'FOOTBALL_DATA\',\'MATCH\',\'home-fixture\',$2::uuid,now())', [vidId(62002), id]);
  return id;
}
