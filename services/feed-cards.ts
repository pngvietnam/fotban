import { randomUUID } from "node:crypto";
import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
import { permittedFeedSnapshot } from "../lib/publisher-feed-permission";
import { feedCardWindowHours, feedCertainty, feedLabel, feedStoryType, feedTransferStage, holdReasons, originHint } from "../lib/feed-card-policy";
import { groupFeedCards, type GroupableCard } from "../lib/feed-card-grouping";
import { resolveEntities } from "../providers/ai/rules";
import { vietnameseSource } from "../providers/news/vietnamese-sources";
import { adminAudit } from "./admin-access";
import { operatorIdentity, validReviewer } from "./operator-identity";
import { vietnameseCatalogFrom } from "./vietnamese-catalog";

type CandidateRow = {
  id: string; sourceId: string; sourceUrl: string; titleOriginal: string; excerptOriginal: string | null; publishedAt: string; contentOriginal: string | null;
  slug: string; sourceTier: string | null; source: unknown; snapshot: unknown; cardStatus: string | null; decidedById: string | null;
};
const column = { club: "clubId", player: "playerId", league: "leagueId" } as const;

/** Nearest match between two linked clubs within two days of publication (report or preview). */
async function linkedMatch(tx: SqlExecutor, clubIds: string[], publishedAt: string) {
  if (clubIds.length < 2) return null;
  const rows = await tx.query<{ id: string }>(`SELECT id FROM "Match" WHERE "homeClubId"=ANY($1::uuid[]) AND "awayClubId"=ANY($1::uuid[]) AND "kickoffAt" BETWEEN $2::timestamptz-interval '48 hours' AND $2::timestamptz+interval '48 hours' ORDER BY abs(extract(epoch FROM ("kickoffAt"-$2::timestamptz))),id LIMIT 1`, [clubIds, publishedAt]);
  return rows[0]?.id ?? null;
}

/** Rows handled per pass, new articles first: the pass runs in one transaction (30s limit), so it must stay small and drain a backlog over several passes. */
const batchLimit = 250;

/**
 * Turns permitted Vietnamese publisher feed articles into attributed cards. New cards publish
 * automatically unless a sensitive term holds them; an operator decision is never overwritten.
 * Cards that lose their grant are not touched here: every public read rechecks the grant.
 */
export async function publishFeedCards(db: SyncDatabase, now = new Date(), windowHours = feedCardWindowHours) {
  return db.transaction(async (tx) => {
    await tx.query("SELECT 1 AS locked FROM pg_advisory_xact_lock(91531120)");
    const since = new Date(now.getTime() - windowHours * 3600000);
    const rows = await tx.query<CandidateRow>(`SELECT a.id,a."sourceId",a."sourceUrl",a."titleOriginal",a."excerptOriginal",a."publishedAt",a."contentOriginal",s.slug,s."sourceTier",to_jsonb(s) AS source,to_jsonb(f) AS snapshot,c.status AS "cardStatus",c."decidedById"
      FROM "Article" a JOIN "NewsSource" s ON s.id=a."sourceId" JOIN "ArticleFeedSnapshot" f ON f."articleId"=a.id LEFT JOIN "FeedCard" c ON c."articleId"=a.id
      WHERE a."publishedAt" BETWEEN $1::timestamptz AND $2::timestamptz ORDER BY (c."articleId" IS NOT NULL),a."publishedAt",a.id LIMIT ${batchLimit}`, [since, now]);
    const catalog = await vietnameseCatalogFrom(tx);
    const counts = { examined: rows.length, published: 0, held: 0, kept: 0, notPermitted: 0, groups: 0 };
    for (const row of rows) {
      if (!vietnameseSource(row.slug) || !permittedFeedSnapshot(row, row.source, row.snapshot)) { counts.notPermitted++; continue; }
      const title = row.titleOriginal; const description = row.excerptOriginal;
      const entities = resolveEntities(`${title}\n${description ?? ""}`, catalog).filter((entity) => entity.kind !== "match");
      for (const entity of entities) await tx.query(`INSERT INTO "ArticleEntity" (id,"articleId","${column[entity.kind as keyof typeof column]}","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,now()) ON CONFLICT ("articleId","${column[entity.kind as keyof typeof column]}") DO NOTHING`, [randomUUID(), row.id, entity.id]);
      const storyType = feedStoryType(title, description);
      const holds = holdReasons(`${title}\n${description ?? ""}`);
      const derived = [storyType, feedLabel(row.sourceTier), feedCertainty(title, description), feedTransferStage(storyType, title, description), originHint(title, description), holds, await linkedMatch(tx, entities.filter((entity) => entity.kind === "club").map((entity) => entity.id), row.publishedAt)];
      // Status is set only for a new or still-automatic card; manual decisions stay as decided.
      const status = row.decidedById ? row.cardStatus! : holds.length ? "HELD" : "PUBLISHED";
      await tx.query(`INSERT INTO "FeedCard" ("articleId",status,"storyType",label,certainty,"transferStage","originHint","holdReasons","matchId","updatedAt") VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8::text[],$9::uuid,now())
        ON CONFLICT ("articleId") DO UPDATE SET status=CASE WHEN "FeedCard"."decidedById" IS NULL THEN EXCLUDED.status ELSE "FeedCard".status END,"storyType"=EXCLUDED."storyType",label=EXCLUDED.label,certainty=EXCLUDED.certainty,"transferStage"=EXCLUDED."transferStage","originHint"=EXCLUDED."originHint","holdReasons"=EXCLUDED."holdReasons","matchId"=EXCLUDED."matchId","updatedAt"=now()`,
        [row.id, status, ...derived]);
      if (row.decidedById) counts.kept++; else if (status === "HELD") counts.held++; else counts.published++;
    }
    // Regroup every card in the window so late arrivals join earlier coverage deterministically.
    const cards = await tx.query<{ articleId: string; sourceId: string; publishedAt: string; title: string; matchId: string | null; transferStage: string | null; groupKey: string | null; entityIds: string[] }>(`SELECT c."articleId",a."sourceId",a."publishedAt",a."titleOriginal" AS title,c."matchId",c."transferStage",c."groupKey",
      COALESCE(ARRAY(SELECT COALESCE(e."clubId",e."playerId")::text FROM "ArticleEntity" e WHERE e."articleId"=a.id AND (e."clubId" IS NOT NULL OR e."playerId" IS NOT NULL)),'{}') AS "entityIds"
      FROM "FeedCard" c JOIN "Article" a ON a.id=c."articleId" WHERE c.status<>'HIDDEN' AND a."publishedAt" BETWEEN $1::timestamptz AND $2::timestamptz`, [since, now]);
    const keys = groupFeedCards(cards.map((card): GroupableCard => ({ ...card, publishedAt: new Date(card.publishedAt) })));
    for (const card of cards) {
      const key = keys.get(card.articleId) ?? card.articleId;
      if (card.groupKey !== key) await tx.query('UPDATE "FeedCard" SET "groupKey"=$2::uuid,"updatedAt"=now() WHERE "articleId"=$1::uuid', [card.articleId, key]);
    }
    counts.groups = new Set(keys.values()).size;
    return counts;
  });
}

export class FeedCardDecisionError extends Error { constructor(readonly code: "INVALID_INPUT" | "NOT_FOUND") { super(code); } }
/** Operator approve/hide. Audited; the publisher job will not change the decided status afterwards. */
export async function decideFeedCard(db: SyncDatabase, input: { articleId: string; decision: "PUBLISHED" | "HIDDEN"; reviewer: string; reason: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(input.articleId) || !validReviewer(input.reviewer) || input.reason.trim().length < 10 || input.reason.length > 1000) throw new FeedCardDecisionError("INVALID_INPUT");
  return db.transaction(async (tx) => {
    await tx.query("SELECT 1 AS locked FROM pg_advisory_xact_lock(91531120)");
    const [before] = await tx.query<Record<string, unknown>>('SELECT * FROM "FeedCard" WHERE "articleId"=$1::uuid FOR UPDATE', [input.articleId]);
    if (!before) throw new FeedCardDecisionError("NOT_FOUND");
    const actorId = await operatorIdentity(tx, input.reviewer);
    await tx.query('UPDATE "FeedCard" SET status=$2,"decidedById"=$3::uuid,"decidedAt"=now(),"updatedAt"=now() WHERE "articleId"=$1::uuid', [input.articleId, input.decision, actorId]);
    const auditId = await adminAudit(tx, actorId, input.decision === "HIDDEN" ? "FEED_CARD_HIDE" : "FEED_CARD_APPROVE", "FeedCard", input.articleId, input.reason.trim(), { status: before.status, holdReasons: before.holdReasons }, { status: input.decision });
    return { articleId: input.articleId, status: input.decision, auditId };
  });
}
export async function heldFeedCards(db: SyncDatabase) {
  return db.query<{ articleId: string; title: string; source: string; holdReasons: string[]; publishedAt: string }>('SELECT c."articleId",a."titleOriginal" AS title,s.name AS source,c."holdReasons",a."publishedAt" FROM "FeedCard" c JOIN "Article" a ON a.id=c."articleId" JOIN "NewsSource" s ON s.id=a."sourceId" WHERE c.status=\'HELD\' ORDER BY a."publishedAt" DESC LIMIT 100');
}
