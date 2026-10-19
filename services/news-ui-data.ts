import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
import { clusterIdFromSlug, newsSlug, safeNewsUrl } from "../lib/news-presentation";
import type { NewsDetailResult, NewsEntity, NewsFilters, NewsListResult, NewsSourceView, NewsStory } from "../types/news-ui";
import { defaultClusterPolicy } from "../types/story-clustering";
import { canonicalizeStory } from "./story-canonicalization";
import { loadClusterState } from "./story-clustering";

const json = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;
const pageSize = 12;
type SourceRow = { id: string; sourceId: string; sourceUrl: string; titleOriginal: string; language: string; publishedAt: string | null; publishedAtPrecision: string | null; licenseName: string | null; licenseUrl: string | null; attributionText: string | null; sourceRevisionUrl: string | null; provider: string | null };

/** Read-only public boundary. Clustering eligibility never substitutes for editorial publication. */
export async function readPublishedStory(tx: SqlExecutor, id: string, now: Date): Promise<NewsStory | null> {
  const records = await tx.query<{ id: string; hasConflict: boolean }>('SELECT id,"hasConflict" FROM "ArticleCluster" WHERE id=$1::uuid AND NOT "hasConflict" AND NOT "manualDisputed" AND EXISTS(SELECT 1 FROM "ArticleClusterRevision" r WHERE r."clusterId"=$1::uuid)', [id]);
  if (!records.length) return null;
  const ids = await tx.query<{ id: string }>('SELECT id FROM "Article" WHERE "clusterId"=$1::uuid AND "publicationStatus"=\'PUBLISHED\' AND "processingStatus"=\'READY\' ORDER BY id LIMIT $2', [id, defaultClusterPolicy.maxArticles + 1]);
  if (!ids.length || ids.length > defaultClusterPolicy.maxArticles) return null;
  const state = await loadClusterState(tx, ids.map((row) => row.id), [id], now, defaultClusterPolicy, true);
  const cluster = state.clusters[0];
  if (!cluster || !state.members.some((member) => member.input.article.id === cluster.representativeArticleId)) return null;
  // Do not let a private citation become public confirmation or independent corroboration.
  const referenced = [...new Set(state.members.flatMap((member) => [member.input.article.id, ...member.input.evidence.filter((item) => member.reliability.explanation.evidenceIds.includes(item.id)).flatMap((item) => item.sourceArticleId ? [item.sourceArticleId] : [])]))];
  const rows = json<SourceRow[]>(await tx.query(`SELECT a.id,a."sourceId",a."sourceUrl",a."titleOriginal",a.language,a."publishedAt",a."publishedAtPrecision",COALESCE(a."licenseName",CASE WHEN f."articleId" IS NOT NULL THEN 'Điều khoản RSS đã duyệt' END) AS "licenseName",COALESCE(a."licenseUrl",f."termsUrl") AS "licenseUrl",COALESCE(a."attributionText",f."attributionText") AS "attributionText",a."sourceRevisionUrl",r.provider FROM "Article" a LEFT JOIN "ArticleFeedSnapshot" f ON f."articleId"=a.id LEFT JOIN LATERAL(SELECT provider FROM "AIProcessingRun" WHERE "articleId"=a.id ORDER BY "createdAt" DESC,id DESC LIMIT 1) r ON true WHERE a.id=ANY($1::uuid[]) AND a."publicationStatus"='PUBLISHED' AND a."processingStatus"='READY'`, [referenced]));
  const publicIds = new Set(rows.map((row) => row.id));
  if (state.members.some((member) => member.reliability.disputed || member.reliability.explanation.evidenceIds.some((evidenceId) => {
    const item = member.input.evidence.find((evidence) => evidence.id === evidenceId);
    return item?.sourceArticleId && !publicIds.has(item.sourceArticleId);
  }))) return null;
  const members = state.members.filter((member) => member.reliability.publishability.eligible);
  const snapshot = canonicalizeStory(members, cluster);
  if (!snapshot.eligible || snapshot.representativeArticleId !== cluster.representativeArticleId || snapshot.headlineVi !== cluster.headline || snapshot.summaryVi !== cluster.summary) return null;
  const representative = members.find((member) => member.input.article.id === snapshot.representativeArticleId)!;
  const sourceMap = new Map(members.map((member) => [member.input.source.id, member.input.source]));
  for (const member of members) for (const evidence of member.input.evidence) if (evidence.sourceArticle) sourceMap.set(evidence.sourceArticle.source.id, evidence.sourceArticle.source);
  const sources: NewsSourceView[] = snapshot.sources.flatMap((link) => {
    const row = rows.find((item) => item.id === link.articleId); const source = sourceMap.get(link.sourceId);
    if (!row || !source || !row.licenseName || !row.attributionText) return [];
    return [{ key: row.id, sourceId: source.id, name: source.name, originalTitle: row.titleOriginal, url: safeNewsUrl(row.sourceUrl), publishedAt: row.publishedAt, dateOnly: row.publishedAtPrecision === "DAY", language: row.language, tier: source.sourceTier, licenseName: row.licenseName, licenseUrl: safeNewsUrl(row.licenseUrl), attribution: row.attributionText, revisionUrl: safeNewsUrl(row.sourceRevisionUrl) }];
  });
  // Every supporting source in the canonical result must have a permitted public citation.
  if (!sources.length || sources.length !== snapshot.sources.length) return null;
  const memberIds = members.map((member) => member.input.article.id);
  const entities = await tx.query<{ id: string; kind: NewsEntity["kind"]; name: string; tla: string | null }>(`SELECT DISTINCT c.id,'club' AS kind,c.name,c.tla FROM "ArticleEntity" e JOIN "Club" c ON c.id=e."clubId" WHERE e."articleId"=ANY($1::uuid[]) UNION SELECT DISTINCT p.id,'player',p.name,NULL FROM "ArticleEntity" e JOIN "Player" p ON p.id=e."playerId" WHERE e."articleId"=ANY($1::uuid[]) UNION SELECT DISTINCT l.id,'league',l.name,NULL FROM "ArticleEntity" e JOIN "League" l ON l.id=e."leagueId" WHERE e."articleId"=ANY($1::uuid[]) ORDER BY kind,name,id`, [memberIds]);
  const leagues = await tx.query<{ slug: string }>(`SELECT DISTINCT l.slug FROM "ArticleEntity" e JOIN "Article" a ON a.id=e."articleId" JOIN "League" l ON l.id=e."leagueId" OR l.id IN(SELECT m."leagueId" FROM "Match" m WHERE m.id=e."matchId") OR l.id IN(SELECT cs."leagueId" FROM "ClubSeason" cs JOIN "Season" s ON s.id=cs."seasonId" WHERE cs."clubId"=e."clubId" AND a."publishedAt">=s."startsAt" AND a."publishedAt"<=s."endsAt") WHERE e."articleId"=ANY($1::uuid[]) ORDER BY l.slug`, [memberIds]);
  const roleName = (roleId: string | null) => entities.find((entity) => entity.id === roleId)?.name ?? null;
  const ownRow = rows.find((row) => row.id === representative.input.article.id)!;
  const reliability = representative.reliability;
  return {
    slug: newsSlug(id), titleVi: snapshot.headlineVi!, summaryVi: snapshot.summaryVi!, storyType: snapshot.storyType!, featured: snapshot.featured,
    publishedAt: representative.input.article.publishedAt!, updatedAt: snapshot.lastUpdated!, dateOnly: ownRow.publishedAtPrecision === "DAY",
    entities: entities.filter((entity) => entity.name.trim()).map((entity) => ({ id: entity.id, kind: entity.kind, name: entity.name, initials: entity.tla?.trim() || entity.name.split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]).join("").toLocaleUpperCase("vi-VN") })), leagueSlugs: leagues.map((league) => league.slug),
    sources, sourceCount: snapshot.sourceCount, independentSourceCount: snapshot.independentSourceCount,
    reliability: { label: reliability.label, certainty: reliability.certainty, disputed: reliability.disputed, evidenceStrength: snapshot.strongestEvidence!, badge: reliability.badge },
    transfer: reliability.transferStatus ? { status: reliability.transferStatus, player: roleName(representative.transferPair.player), currentClub: roleName(representative.transferPair.currentClub), targetClub: roleName(representative.transferPair.targetClub) } : null,
    summaryMethod: ownRow.provider === "RULE_BASED" ? "EXTRACTIVE" : "AI",
  };
}

export class NewsQueryService {
  constructor(private db: SyncDatabase) {}
  async detail(slug: string, now = new Date()) {
    const id = clusterIdFromSlug(slug); if (!id) return null;
    return this.db.transaction(async (tx) => {
      await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      return readPublishedStory(tx, id, now);
    });
  }
  async list(filters: NewsFilters, now = new Date()) {
    return this.db.transaction(async (tx) => {
      await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const stories: NewsStory[] = []; let offset = filters.offset;
      // Scan bounded batches to fill holes left by revoked/stale publication gates.
      for (let batch = 0; batch < 10; batch++) {
        const candidates = await tx.query<{ id: string }>(`SELECT c.id FROM "ArticleCluster" c JOIN "Article" a ON a.id=c."representativeArticleId" JOIN "NewsSource" s ON s.id=a."sourceId" WHERE a."clusterId"=c.id AND a."publicationStatus"='PUBLISHED' AND a."processingStatus"='READY' AND NOT c."hasConflict" AND NOT c."manualDisputed" ORDER BY c.featured DESC,CASE a."reliabilityClass" WHEN 'OFFICIAL' THEN 4 WHEN 'RELIABLE' THEN 3 WHEN 'RUMOR' THEN 2 ELSE 1 END DESC,CASE WHEN s.language='vi' AND s.country='VN' THEN 0 ELSE 1 END,s."newsPriority",a."updatedAt" DESC,c.id LIMIT 12 OFFSET $1`, [offset]);
        for (const candidate of candidates) {
          const story = await readPublishedStory(tx, candidate.id, now);
          if (story && (filters.league === "all" || story.leagueSlugs.includes(filters.league))) {
            if (stories.length === pageSize) return { stories, nextOffset: offset };
            stories.push(story);
          }
          offset++;
        }
        if (candidates.length < 12) return { stories, nextOffset: null };
      }
      // Keep navigation across a large filtered/withdrawn span without exposing its content.
      return { stories, nextOffset: offset };
    });
  }
}

export async function loadNewsList(read: () => ReturnType<NewsQueryService["list"]>, onError?: () => void): Promise<NewsListResult> {
  try { return { kind: "ready", data: await read() }; } catch { onError?.(); return { kind: "error" }; }
}
export async function loadNewsDetail(slug: string, read: () => ReturnType<NewsQueryService["detail"]>, onError?: () => void): Promise<NewsDetailResult> {
  if (!clusterIdFromSlug(slug)) return { kind: "not-found" };
  try { const story = await read(); return story ? { kind: "ready", story } : { kind: "not-found" }; } catch { onError?.(); return { kind: "error" }; }
}
