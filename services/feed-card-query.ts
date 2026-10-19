import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
import { permittedFeedSnapshot } from "../lib/publisher-feed-permission";
import { headlineClaimsOfficial, type FeedCertainty, type FeedLabel, type FeedTransferStage } from "../lib/feed-card-policy";
import { feedSlug, stripPublisherPrefix } from "../lib/feed-card-presentation";
import { clubContexts } from "./feed-context";
import { rankFeedGroups } from "../lib/feed-card-ranking";
import { safeNewsUrl } from "../lib/news-presentation";
import { vietnameseSource } from "../providers/news/vietnamese-sources";
import { allowedImageUrl } from "../providers/news/vietnamese-provider";
import { cardImageUrl } from "../lib/news-image-size";
import type { FeedCardView, FeedDetailResult, FeedFilters, FeedGroupView, FeedListData, FeedListResult } from "../types/feed-card";
import type { NewsEntity } from "../types/news-ui";

const listWindowDays = 7;
const groupsPerPage = 24;
const maxCards = 400;
type CardRow = {
  articleId: string; sourceId: string; sourceUrl: string; titleOriginal: string; excerptOriginal: string | null; publishedAt: string; contentOriginal: string | null;
  status: string; label: FeedLabel; certainty: FeedCertainty; storyType: string; transferStage: FeedTransferStage | null; originHint: string | null; groupKey: string | null;
  slug: string; name: string; newsPriority: number; attributionText: string; imageUrl: string | null; imagesAllowed: boolean; source: unknown; snapshot: unknown;
  matchSlug: string | null; home: string | null; away: string | null; kickoffAt: string | null;
};

/**
 * Public gate, evaluated on every read: operator/auto status PUBLISHED, article not hidden,
 * published time not in the future, and the publisher grant still matches the frozen feed snapshot.
 */
async function publicCards(tx: SqlExecutor, where: string, params: unknown[], now: Date) {
  const rows = await tx.query<CardRow>(`SELECT c."articleId",a."sourceId",a."sourceUrl",a."titleOriginal",a."excerptOriginal",a."publishedAt",a."contentOriginal",c.status,c.label,c.certainty,c."storyType",c."transferStage",c."originHint",c."groupKey",
    s.slug,s.name,s."newsPriority",f."attributionText",f."imageUrl",s."imagesAllowed",to_jsonb(s) AS source,to_jsonb(f) AS snapshot,m.slug AS "matchSlug",hc.name AS home,ac.name AS away,m."kickoffAt"
    FROM "FeedCard" c JOIN "Article" a ON a.id=c."articleId" JOIN "NewsSource" s ON s.id=a."sourceId" JOIN "ArticleFeedSnapshot" f ON f."articleId"=a.id
    LEFT JOIN "Match" m ON m.id=c."matchId" LEFT JOIN "Club" hc ON hc.id=m."homeClubId" LEFT JOIN "Club" ac ON ac.id=m."awayClubId"
    WHERE c.status='PUBLISHED' AND a."publicationStatus"<>'HIDDEN' AND a."publishedAt"<=$1::timestamptz AND ${where}
    ORDER BY a."publishedAt" DESC,a.id LIMIT ${maxCards}`, [now, ...params]);
  const permitted = rows.filter((row) => vietnameseSource(row.slug) && permittedFeedSnapshot({ ...row, id: row.articleId }, row.source, row.snapshot));
  const ids = permitted.map((row) => row.articleId);
  const entities = ids.length ? await tx.query<{ articleId: string; id: string; kind: NewsEntity["kind"]; name: string; tla: string | null; crest: string | null; photo: string | null }>(`SELECT e."articleId",c.id,'club' AS kind,c.name,c.tla,c."externalCrestUrl" AS crest,NULL AS photo FROM "ArticleEntity" e JOIN "Club" c ON c.id=e."clubId" WHERE e."articleId"=ANY($1::uuid[])
    UNION ALL SELECT e."articleId",p.id,'player',p.name,NULL,NULL,pi."thumbUrl" FROM "ArticleEntity" e JOIN "Player" p ON p.id=e."playerId" LEFT JOIN "PlayerImage" pi ON pi."playerId"=p.id AND pi.status='FOUND' WHERE e."articleId"=ANY($1::uuid[])
    UNION ALL SELECT e."articleId",l.id,'league',l.name,NULL,NULL,NULL FROM "ArticleEntity" e JOIN "League" l ON l.id=e."leagueId" WHERE e."articleId"=ANY($1::uuid[]) ORDER BY kind,name`, [ids]) : [];
  // Competition context: a direct league link, a linked club's season membership, or a linked player's club then.
  const leagues = ids.length ? await tx.query<{ articleId: string; slug: string }>(`SELECT DISTINCT e."articleId",l.slug FROM "ArticleEntity" e JOIN "Article" a ON a.id=e."articleId" JOIN "League" l ON l.id=e."leagueId"
      OR l.id IN (SELECT cs."leagueId" FROM "ClubSeason" cs JOIN "Season" s ON s.id=cs."seasonId" JOIN "League" cl ON cl.id=cs."leagueId" WHERE a."publishedAt" BETWEEN s."startsAt" AND s."endsAt"
        -- A domestic club's story belongs to its domestic league; the Champions League counts only for clubs with no domestic league here.
        AND (cl.slug<>'champions-league' OR NOT EXISTS (SELECT 1 FROM "ClubSeason" d JOIN "League" dl ON dl.id=d."leagueId" JOIN "Season" ds ON ds.id=d."seasonId" WHERE d."clubId"=cs."clubId" AND dl.slug<>'champions-league' AND a."publishedAt" BETWEEN ds."startsAt" AND ds."endsAt"))
        AND (cs."clubId"=e."clubId" OR cs."clubId" IN (SELECT pc."clubId" FROM "PlayerClub" pc WHERE pc."playerId"=e."playerId" AND (pc."endsAt" IS NULL OR pc."endsAt">=a."publishedAt"))))
    WHERE e."articleId"=ANY($1::uuid[])`, [ids]) : [];
  return permitted.map((row): FeedCardView & { groupKey: string; priority: number } => ({
    slug: feedSlug(row.articleId), articleId: row.articleId, title: row.titleOriginal, description: stripPublisherPrefix(row.excerptOriginal),
    publisher: row.name, publisherSlug: row.slug, attribution: row.attributionText, url: safeNewsUrl(row.sourceUrl), publishedAt: new Date(row.publishedAt).toISOString(),
    label: row.label, certainty: row.certainty, storyType: row.storyType, transferStage: row.transferStage, originHint: row.originHint, officialWording: headlineClaimsOfficial(row.titleOriginal),
    image: row.imagesAllowed ? cardImageUrl(allowedImageUrl(row.imageUrl, vietnameseSource(row.slug)?.imageHosts)) : null,
    entities: entities.filter((entity) => entity.articleId === row.articleId && entity.name.trim()).map((entity) => ({ id: entity.id, kind: entity.kind, name: entity.name, crestUrl: entity.crest, photoUrl: entity.photo, tla: entity.tla, initials: entity.tla?.trim() || entity.name.split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]).join("").toLocaleUpperCase("vi-VN") })),
    leagueSlugs: leagues.filter((league) => league.articleId === row.articleId).map((league) => league.slug).sort(),
    match: row.matchSlug && row.home && row.away && row.kickoffAt ? { slug: row.matchSlug, home: row.home, away: row.away, kickoffAt: new Date(row.kickoffAt).toISOString() } : null,
    groupKey: row.groupKey ?? row.articleId, priority: row.newsPriority,
  }));
}
// Lead card: highest-priority publisher, media before community, then the earliest report.
const leadOrder = (a: { priority: number; label: string; publishedAt: string; articleId: string }, b: typeof a) =>
  a.priority - b.priority || (a.label === b.label ? 0 : a.label === "MEDIA" ? -1 : 1) || a.publishedAt.localeCompare(b.publishedAt) || a.articleId.localeCompare(b.articleId);
const publicView = (card: FeedCardView & { groupKey: string; priority: number }): FeedCardView => {
  const view: Partial<typeof card> = { ...card }; delete view.groupKey; delete view.priority;
  return view as FeedCardView;
};

export class FeedCardQueryService {
  constructor(private db: SyncDatabase) {}
  private read<T>(work: (tx: SqlExecutor) => Promise<T>) {
    return this.db.transaction(async (tx) => { await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"); return work(tx); });
  }
  async list(filters: FeedFilters, now = new Date()): Promise<FeedListData> {
    return this.read(async (tx) => {
      const cards = await publicCards(tx, 'a."publishedAt">=$2::timestamptz', [new Date(now.getTime() - listWindowDays * 86400000)], now);
      const byGroup = new Map<string, typeof cards>();
      for (const card of cards) byGroup.set(card.groupKey, [...(byGroup.get(card.groupKey) ?? []), card]);
      const built: FeedGroupView[] = [...byGroup.entries()].map(([key, members]) => {
        const [lead, ...others] = [...members].sort(leadOrder);
        return { key, lead: publicView(lead), others: others.map(publicView), latestAt: members.map((member) => member.publishedAt).sort().at(-1)! };
      }).filter((group) => filters.league === "all" || [group.lead, ...group.others].some((card) => card.leagueSlugs.includes(filters.league)))
        .filter((group) => !filters.clubId || [group.lead, ...group.others].some((card) => card.entities.some((entity) => entity.kind === "club" && entity.id === filters.clubId)))
        .filter((group) => !filters.follow || [group.lead, ...group.others].some((card) => card.entities.some((entity) => entity.id && filters.follow!.entityIds.includes(entity.id) && entity.kind !== "league") || card.leagueSlugs.some((slug) => filters.follow!.leagueSlugs.includes(slug))))
        .filter((group) => !filters.storyType || [group.lead, ...group.others].some((card) => card.storyType === filters.storyType));
      const ranked = filters.sort === "latest" ? [...built].sort((a, b) => b.latestAt.localeCompare(a.latestAt) || a.key.localeCompare(b.key)) : null;
      const groups = ranked ?? rankFeedGroups(built.map((group) => ({ ...group, leadTitle: group.lead.title, leadPublisher: group.lead.publisher, publishers: [group.lead, ...group.others].map((card) => card.publisher), hasMedia: [group.lead, ...group.others].some((card) => card.label === "MEDIA") })), now)
        .map(({ key, lead, others, latestAt }): FeedGroupView => ({ key, lead, others, latestAt }));
      const page = groups.slice(filters.offset, filters.offset + groupsPerPage);
      return { groups: page, nextOffset: filters.offset + groupsPerPage < groups.length ? filters.offset + groupsPerPage : null };
    });
  }
  async detail(articleId: string, now = new Date()) {
    return this.read(async (tx) => {
      const [card] = await publicCards(tx, 'c."articleId"=$2::uuid', [articleId], now);
      if (!card) return null;
      const others = (await publicCards(tx, 'c."groupKey"=$2::uuid AND c."articleId"<>$3::uuid', [card.groupKey, articleId], now)).sort(leadOrder);
      // Related: other stories (one card per group) about the same clubs/players in the last 72 hours.
      const entityIds = card.entities.filter((entity) => entity.kind !== "league" && entity.id).map((entity) => entity.id!);
      const related = entityIds.length ? await publicCards(tx, 'a."publishedAt">=$2::timestamptz AND c."groupKey"<>$3::uuid AND EXISTS (SELECT 1 FROM "ArticleEntity" e WHERE e."articleId"=a.id AND (e."clubId"=ANY($4::uuid[]) OR e."playerId"=ANY($4::uuid[])))', [new Date(now.getTime() - 72 * 3600000), card.groupKey, entityIds], now) : [];
      const seen = new Set<string>();
      const relatedViews = related.sort(leadOrder).filter((item) => !seen.has(item.groupKey) && seen.add(item.groupKey)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 6).map(publicView);
      return { card: publicView(card), others: others.map(publicView), related: relatedViews, context: await clubContexts(tx, publicView(card), now) };
    });
  }
}

export async function loadFeedList(read: () => Promise<FeedListData>, onError?: () => void): Promise<FeedListResult> {
  try { return { kind: "ready", data: await read() }; } catch { onError?.(); return { kind: "error" }; }
}
export async function loadFeedDetail(read: () => ReturnType<FeedCardQueryService["detail"]>, onError?: () => void): Promise<FeedDetailResult> {
  try { const result = await read(); return result ? { kind: "ready", ...result } : { kind: "not-found" }; } catch { onError?.(); return { kind: "error" }; }
}
