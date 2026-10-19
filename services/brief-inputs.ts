import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
import { briefHash, briefLimits, briefTime, prominentBriefClub } from "../lib/brief-policy";
import { dataSources } from "../lib/data-sources";
import { clusterIdFromSlug } from "../lib/news-presentation";
import { readPublishedStory } from "./news-ui-data";
import { readTransferEvent } from "./transfer-query";
import { transferMember } from "./transfer-service";
import { readVerifiedHighlight } from "./video-query";
import { VideoStore } from "./video-store";
import { briefMatchSchema, type BriefCandidate, type BriefCitation, type BriefInputs, type BriefMatch, type BriefRequest, type BriefWindow } from "../types/morning-brief";
import type { NewsStory } from "../types/news-ui";

// IDs name exact immutable match-field snapshots, not provider external identities.
export function matchEvidenceId(match: BriefMatch) { const hash = briefHash(match); return `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`; }
export function executorDatabase(tx: SqlExecutor): SyncDatabase { return { query: (sql, params) => tx.query(sql, params), transaction: (work) => work(tx) }; }
const dateString = (value: unknown) => value ? new Date(String(value)).toISOString() : null;

async function matchCandidates(tx: SqlExecutor, request: BriefRequest, window: BriefWindow, now: Date): Promise<BriefCandidate[]> {
  const rows = await tx.query<{ row: Record<string, unknown>; league: string; leagueName: string; home: string; away: string; homeSlug: string; awaySlug: string }>(`SELECT to_jsonb(m) AS row,l.slug AS league,l.name AS "leagueName",h.name AS home,a.name AS away,h.slug AS "homeSlug",a.slug AS "awaySlug" FROM "Match" m JOIN "League" l ON l.id=m."leagueId" JOIN "Club" h ON h.id=m."homeClubId" JOIN "Club" a ON a.id=m."awayClubId" WHERE l.slug=ANY($1::text[]) AND ((m.status='FINISHED' AND m."kickoffAt">=$2::timestamptz AND m."kickoffAt"<$3::timestamptz) OR (m.status='SCHEDULED' AND m."kickoffAt">$3::timestamptz AND m."kickoffAt"<=$4::timestamptz)) AND EXISTS(SELECT 1 FROM "ExternalIdentity" x WHERE x."matchId"=m.id AND x.provider=m.provider AND x."entityType"='MATCH') ORDER BY m."kickoffAt",m.id LIMIT 121`, [request.competitions, window.windowStart, window.cutoffAt, window.upcomingEnd]);
  if (rows.length > 120) throw new Error("BRIEF_MATCH_BOUND_EXCEEDED");
  const candidates: BriefCandidate[] = [];
  for (const entry of rows) {
    const row = entry.row; const provider = String(row.provider); if (!dataSources[provider]) continue;
    const events = dataSources[provider].capabilities.events ? await tx.query<{ type: string; minute: number | null; player: string | null; club: string | null }>('SELECT e.type,e.minute,p.name AS player,c.name AS club FROM "MatchEvent" e LEFT JOIN "Player" p ON p.id=e."playerId" LEFT JOIN "Club" c ON c.id=e."clubId" WHERE e."matchId"=$1::uuid AND e.provider=$2 ORDER BY e.minute,e.id LIMIT 101', [row.id, provider]) : [];
    if (events.length > 100) throw new Error("BRIEF_EVENT_BOUND_EXCEEDED");
    const parsed = briefMatchSchema.safeParse({ id: row.id, slug: row.slug, league: entry.league, leagueName: entry.leagueName, homeId: row.homeClubId, awayId: row.awayClubId, home: entry.home, away: entry.away, kickoffAt: dateString(row.kickoffAt), status: row.status, homeScore: row.homeScore, awayScore: row.awayScore, homeExtraTimeScore: row.homeExtraTimeScore, awayExtraTimeScore: row.awayExtraTimeScore, homePenaltyScore: row.homePenaltyScore, awayPenaltyScore: row.awayPenaltyScore, scoreDuration: row.scoreDuration, provider, sourceUrl: dataSources[provider].attribution.url, observedAt: dateString(row.providerUpdatedAt ?? row.lastUpdatedAt), events });
    if (!parsed.success || parsed.data.status === "FINISHED" && (parsed.data.homeScore === null || parsed.data.awayScore === null)) continue;
    const match = parsed.data; const result = match.status === "FINISHED";
    let highlightRef: string | null = null;
    if (result) {
      // Store only internal identity. YouTube metadata is resolved afresh on every read.
      const checked = await readVerifiedHighlight(new VideoStore(executorDatabase(tx)), match.id, now);
      const selected = checked && await tx.query<{ id: string }>('SELECT id FROM "Video" WHERE "matchId"=$1::uuid AND url=$2 LIMIT 1', [match.id, checked.url]);
      if (selected && selected.length) highlightRef = selected[0].id;
    }
    const score = `${match.homeScore} – ${match.awayScore}`;
    const titleVi = result ? `${match.home} ${score} ${match.away}: kết quả đã ghi nhận` : `${match.home} gặp ${match.away}`;
    const penalty = result && match.homePenaltyScore !== null && match.awayPenaltyScore !== null ? ` Luân lưu: ${match.homePenaltyScore} – ${match.awayPenaltyScore}.` : "";
    const summaryVi = `${result ? "Trận đấu đã kết thúc" : "Trận đấu dự kiến diễn ra"} lúc ${briefTime(match.kickoffAt, request.timezone)} tại ${match.leagueName}.${penalty}`;
    const citations: BriefCitation[] = [{ evidenceId: matchEvidenceId(match), articleId: null, sourceName: "Football-Data.org", url: match.sourceUrl, publishedAt: null, language: "und", tier: "STRUCTURED_PROVIDER", licenseName: null, licenseUrl: null, attribution: dataSources[provider].attribution.text }];
    candidates.push({ key: `match:${match.id}`, section: result ? "RESULTS" : "UPCOMING", titleVi, summaryVi, leagues: [match.league], entityKeys: [`club:${match.homeId}`, `club:${match.awayId}`], clusterId: null, transferId: null, articleIds: [], match, highlightRef, transferStatus: null, reliability: { label: "OFFICIAL", certainty: "CONFIRMED", evidenceStrength: "DIRECT", independentSourceCount: 1, labelVi: "Dữ liệu trận đấu", certaintyVi: result ? "Kết quả đã ghi nhận" : "Lịch dự kiến" }, citations, sourceFingerprint: briefHash(match), contentUpdatedAt: match.kickoffAt, dateOnly: false, featured: prominentBriefClub(entry.homeSlug, entry.home) || prominentBriefClub(entry.awaySlug, entry.away), seenBefore: false });
  }
  return candidates;
}
async function storyCandidate(tx: SqlExecutor, story: NewsStory, now: Date, transferId: string | null, lastUpdatedAt?: string): Promise<BriefCandidate | null> {
  if (!story.titleVi.trim() || !story.summaryVi.trim() || story.reliability.disputed || ["SOCIAL", "DISPUTED"].includes(story.reliability.label) || !story.sources.every((source) => source.url && source.publishedAt)) return null;
  if (["OFF_FIELD", "INTERVIEW"].includes(story.storyType) && !["OFFICIAL", "RELIABLE"].includes(story.reliability.label)) return null;
  const members = await Promise.all(story.sources.map((source) => transferMember(tx, source.key, now)));
  const citations: BriefCitation[] = story.sources.flatMap((source) => {
    const evidence = members.flatMap((member) => member?.input.evidence.filter((item) => member.reliability.explanation.evidenceIds.includes(item.id) && item.sourceArticleId === source.key && item.stance === "SUPPORTS") ?? [])[0];
    return evidence ? [{ evidenceId: evidence.id, articleId: source.key, sourceName: source.name, url: source.url!, publishedAt: source.publishedAt, language: source.language, tier: source.tier, licenseName: source.licenseName, licenseUrl: source.licenseUrl, attribution: source.attribution }] : [];
  });
  if (!citations.length || citations.length !== story.sources.length) return null;
  const entities = await tx.query<{ kind: string; id: string }>('SELECT DISTINCT \'club\' AS kind,"clubId" AS id FROM "ArticleEntity" WHERE "articleId"=ANY($1::uuid[]) AND "clubId" IS NOT NULL UNION SELECT DISTINCT \'player\',"playerId" FROM "ArticleEntity" WHERE "articleId"=ANY($1::uuid[]) AND "playerId" IS NOT NULL ORDER BY kind,id', [story.sources.map((source) => source.key)]);
  const section = transferId ? "TRANSFERS" : ["OFF_FIELD", "INTERVIEW"].includes(story.storyType) ? "OFF_FIELD" : ["CLUB", "PLAYER", "MANAGER", "INJURY", "CONTRACT", "FINANCIAL"].includes(story.storyType) && !story.featured ? "CLUB_PLAYER" : "TOP_STORIES";
  const clusterId = clusterIdFromSlug(story.slug)!;
  const material = { titleVi: story.titleVi, summaryVi: story.summaryVi, reliability: story.reliability, citations, entityKeys: entities.map((entity) => `${entity.kind}:${entity.id}`), transfer: story.transfer, sources: story.sources, clusterId };
  return { key: transferId ? `transfer:${transferId}` : `story:${clusterId}`, section, titleVi: story.titleVi, summaryVi: story.summaryVi, leagues: story.leagueSlugs, entityKeys: material.entityKeys, clusterId, transferId, articleIds: story.sources.map((source) => source.key), match: null, highlightRef: null, transferStatus: transferId ? story.transfer?.status ?? "RUMOR" : null, reliability: { label: story.reliability.label, certainty: story.reliability.certainty, evidenceStrength: story.reliability.evidenceStrength, independentSourceCount: story.independentSourceCount, labelVi: story.reliability.badge.labelVi, certaintyVi: story.reliability.badge.certaintyVi }, citations, sourceFingerprint: briefHash(material), contentUpdatedAt: lastUpdatedAt ?? story.publishedAt, dateOnly: story.dateOnly, featured: story.featured, seenBefore: false };
}
export async function loadBriefInputs(tx: SqlExecutor, request: BriefRequest, window: BriefWindow, now: Date): Promise<BriefInputs> {
  const candidates = await matchCandidates(tx, request, window, now); let excluded = 0;
  const transferIds = await tx.query<{ id: string }>('SELECT DISTINCT "transferId" AS id FROM "TransferUpdate" WHERE snapshot IS NOT NULL ORDER BY "transferId" LIMIT 101');
  if (transferIds.length > 100) throw new Error("BRIEF_TRANSFER_BOUND_EXCEEDED");
  for (const row of transferIds) {
    const view = await readTransferEvent(tx, row.id, now);
    if (!view || view.lastUpdatedAt < window.windowStart || view.lastUpdatedAt > window.windowEnd || !view.story.leagueSlugs.some((league) => request.competitions.includes(league as BriefRequest["competitions"][number]))) continue;
    if (view.story.sources.some((source) => source.publishedAt && source.publishedAt > window.windowEnd)) { excluded++; continue; }
    const item = await storyCandidate(tx, { ...view.story, transfer: view.story.transfer ? { ...view.story.transfer, status: view.status } : null }, now, row.id, view.lastUpdatedAt);
    if (item) candidates.push(item); else excluded++;
  }
  const clusters = await tx.query<{ id: string }>(`SELECT DISTINCT c.id FROM "ArticleCluster" c JOIN "Article" a ON a."clusterId"=c.id WHERE a."publicationStatus"='PUBLISHED' AND a."processingStatus"='READY' AND a."publishedAt">=$1::timestamptz AND a."publishedAt"<=$2::timestamptz AND a."storyType"<>'TRANSFER' ORDER BY c.id LIMIT $3`, [window.windowStart, window.windowEnd, briefLimits.candidates + 1]);
  if (clusters.length > briefLimits.candidates) throw new Error("BRIEF_NEWS_BOUND_EXCEEDED");
  for (const row of clusters) {
    const story = await readPublishedStory(tx, row.id, now);
    if (!story || story.storyType === "TRANSFER" || !story.leagueSlugs.some((league) => request.competitions.includes(league as BriefRequest["competitions"][number])) || story.sources.some((source) => source.publishedAt && source.publishedAt > window.windowEnd)) { excluded++; continue; }
    const item = await storyCandidate(tx, story, now, null); if (item) candidates.push(item); else excluded++;
  }
  const prior = await tx.query<{ fingerprint: string }>('SELECT DISTINCT i."inputSnapshot"->>\'sourceFingerprint\' AS fingerprint FROM "BriefItem" i JOIN "DailyBrief" b ON b.id=i."briefId" WHERE b.date<$1::date AND b.date>=$1::date-2 AND i."inputSnapshot" ? \'sourceFingerprint\'', [request.date]);
  const seen = new Set(prior.map((row) => row.fingerprint));
  return { candidates: candidates.map((item) => ({ ...item, seenBefore: seen.has(item.sourceFingerprint) })).sort((a,b) => a.key.localeCompare(b.key)), excluded };
}
