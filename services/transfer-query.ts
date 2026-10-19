import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
import { statusRank, transferIdFromSlug, transferSlug } from "../lib/transfer-presentation";
import { completedTransfer } from "../lib/transfer-claims";
import { emptyTransferFacts, transferSnapshotSchema, type TransferDetailResult, type TransferFilters, type TransferListResult, type TransferSnapshot, type TransferView } from "../types/transfers";
import type { ClusterArticle } from "../types/story-clustering";
import type { NewsStory } from "../types/news-ui";
import { readPublishedStory } from "./news-ui-data";
import { independentGroups, sourceClassification } from "./reliability-engine";
import { currentTransferSnapshot, transferMember } from "./transfer-service";
import { transferFacts, transferInputHash, transferStatusFor } from "./transfer-evidence";

function publicWording(status: string, headline: string) { return status === "CONFIRMED" || !completedTransfer(headline); }
type Checked = { snapshot: TransferSnapshot; story: NewsStory; member: ClusterArticle };
export async function readTransferEvent(tx: SqlExecutor, id: string, now: Date): Promise<TransferView | null> {
  const relationships = await tx.query<{ playerId: string; currentClubId: string | null; targetClubId: string | null }>('SELECT "playerId","currentClubId","targetClubId" FROM "Transfer" WHERE id=$1::uuid', [id]);
  const relationship = relationships[0]; if (!relationship) return null;
  const rows = await tx.query<{ snapshot: unknown; clusterId: string }>('SELECT snapshot,"clusterId" FROM "TransferUpdate" WHERE "transferId"=$1::uuid AND snapshot IS NOT NULL ORDER BY "publishedAt",id LIMIT 201', [id]);
  if (rows.length > 200) throw new Error("TRANSFER_HISTORY_TOO_LARGE");
  const safe: Checked[] = []; const stories = new Map<string, NewsStory | null>();
  for (const row of rows) {
    const parsed = transferSnapshotSchema.safeParse(row.snapshot); if (!parsed.success) continue;
    const snapshot = parsed.data;
    if (snapshot.clusterId !== row.clusterId || snapshot.playerId !== relationship.playerId || snapshot.currentClubId !== relationship.currentClubId || snapshot.targetClubId !== relationship.targetClubId) continue;
    const conflict = await tx.query('SELECT id FROM "ArticleCluster" WHERE id=$1::uuid AND ("hasConflict" OR "manualDisputed")', [row.clusterId]);
    if (conflict.length) return null;
    const member = await transferMember(tx, snapshot.articleId, now);
    // A fresh reviewed dispute must block stale confirmation even before M8 runs again.
    if (member?.reliability.disputed && member.reliability.permission.usageAllowed) return null;
    if (!stories.has(row.clusterId)) stories.set(row.clusterId, await readPublishedStory(tx, row.clusterId, now));
    const story = stories.get(row.clusterId); if (!story || !story.sources.some((source) => source.key === snapshot.articleId)) continue;
    if (!member?.reliability.publishability.eligible || transferInputHash(member, transferFacts(member, now)) !== snapshot.inputHash || transferStatusFor(member) !== snapshot.status || snapshot.disputed || !publicWording(snapshot.status, story.titleVi)) continue;
    safe.push({ snapshot, story, member });
  }
  const current = currentTransferSnapshot(safe.map((item) => item.snapshot)); if (!current) return null;
  const selected = safe.find((item) => item.snapshot.inputHash === current.inputHash)!;
  const sources = [...new Map(safe.flatMap((item) => item.story.sources).map((source) => [source.key, source])).values()];
  const credible = safe.flatMap(({ member }) => member.input.evidence.filter((item) => member.reliability.explanation.evidenceIds.includes(item.id) && item.stance === "SUPPORTS" && item.lineageKey?.trim() && item.sourceArticle && ["OFFICIAL", "RELIABLE"].includes(sourceClassification(item.sourceArticle.source)) && item.kind !== "SOCIAL_POST"));
  const timeline = safe.filter((item, index, all) => all.findIndex((other) => other.snapshot.clusterId === item.snapshot.clusterId && other.snapshot.status === item.snapshot.status) === index).sort((a, b) => a.snapshot.publishedAt.localeCompare(b.snapshot.publishedAt) || a.snapshot.inputHash.localeCompare(b.snapshot.inputHash));
  const aggregateStory = { ...selected.story, leagueSlugs: [...new Set(safe.flatMap((item) => item.story.leagueSlugs))].sort(), sources, sourceCount: new Set(sources.map((source) => source.sourceId ?? source.name)).size, independentSourceCount: independentGroups(credible) };
  const dateOnly = (entry: Checked) => entry.story.sources.find((source) => source.key === entry.snapshot.articleId)?.dateOnly ?? entry.story.dateOnly;
  return { slug: transferSlug(id), story: aggregateStory, status: current.status, disputed: false, facts: current.facts, firstSeenAt: timeline[0].snapshot.publishedAt, lastUpdatedAt: current.publishedAt, firstSeenDateOnly: dateOnly(timeline[0]), lastUpdatedDateOnly: dateOnly(selected), timeline: timeline.map(({ snapshot, story }) => ({ headlineVi: story.titleVi, summaryVi: story.summaryVi, status: snapshot.status, publishedAt: snapshot.publishedAt, dateOnly: story.sources.find((source) => source.key === snapshot.articleId)?.dateOnly ?? story.dateOnly, newsSlug: story.slug, sources: story.sources })) };
}
async function untracked(tx: SqlExecutor, clusterId: string, now: Date): Promise<TransferView | null> {
  const story = await readPublishedStory(tx, clusterId, now); if (story?.storyType !== "TRANSFER" || !story.transfer) return null;
  const representative = await tx.query<{ representativeArticleId: string }>('SELECT "representativeArticleId" FROM "ArticleCluster" WHERE id=$1::uuid', [clusterId]);
  const member = await transferMember(tx, representative[0].representativeArticleId, now); if (!member) return null;
  const status = transferStatusFor(member); if (!publicWording(status, story.titleVi)) return null;
  return { slug: null, story, status, disputed: false, facts: emptyTransferFacts(), firstSeenAt: story.publishedAt, lastUpdatedAt: story.updatedAt, firstSeenDateOnly: story.dateOnly, timeline: [] };
}
export class TransferQueryService {
  constructor(private db: SyncDatabase) {}
  async list(filters: TransferFilters, now = new Date()) {
    return this.db.transaction(async (tx) => {
      await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const ids = await tx.query<{ id: string }>('SELECT DISTINCT "transferId" AS id FROM "TransferUpdate" WHERE snapshot IS NOT NULL ORDER BY "transferId" LIMIT 101');
      if (ids.length > 100) throw new Error("TRANSFER_FEED_TOO_LARGE");
      const views: TransferView[] = [];
      for (const row of ids) { const view = await readTransferEvent(tx, row.id, now); if (view) views.push(view); }
      const candidates = await tx.query<{ id: string }>(`SELECT c.id FROM "ArticleCluster" c JOIN "Article" a ON a.id=c."representativeArticleId" WHERE a."storyType"='TRANSFER' AND a."publicationStatus"='PUBLISHED' AND a."processingStatus"='READY' AND NOT EXISTS(SELECT 1 FROM "TransferUpdate" u WHERE u."clusterId"=c.id AND u.snapshot IS NOT NULL) ORDER BY c.id LIMIT 101`);
      if (candidates.length > 100) throw new Error("TRANSFER_FEED_TOO_LARGE");
      for (const row of candidates) { const view = await untracked(tx, row.id, now); if (view) views.push(view); }
      const result = views.filter((view) => (filters.league === "all" || view.story.leagueSlugs.includes(filters.league)) && (filters.status === "all" || view.status === filters.status)).sort((a, b) => statusRank[b.status] - statusRank[a.status] || (b.story.reliability.certainty === "HIGH_CONFIDENCE" ? 1 : 0) - (a.story.reliability.certainty === "HIGH_CONFIDENCE" ? 1 : 0) || Date.parse(b.lastUpdatedAt) - Date.parse(a.lastUpdatedAt) || a.story.slug.localeCompare(b.story.slug));
      return { transfers: result.slice((filters.page - 1) * 12, filters.page * 12), nextPage: result.length > filters.page * 12 ? filters.page + 1 : null };
    });
  }
  async detail(slug: string, now = new Date()) {
    const id = transferIdFromSlug(slug); if (!id) return null;
    return this.db.transaction(async (tx) => { await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"); return readTransferEvent(tx, id, now); });
  }
}
export async function loadTransfers(read: () => ReturnType<TransferQueryService["list"]>, onError?: () => void): Promise<TransferListResult> {
  try { return { kind: "ready", ...await read() }; } catch { onError?.(); return { kind: "error" }; }
}
export async function loadTransferDetail(slug: string, read: () => ReturnType<TransferQueryService["detail"]>, onError?: () => void): Promise<TransferDetailResult> {
  if (!transferIdFromSlug(slug)) return { kind: "not-found" };
  try { const transfer = await read(); return transfer ? { kind: "ready", transfer } : { kind: "not-found" }; } catch { onError?.(); return { kind: "error" }; }
}
