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

type MatchRow = { id: string; homeClubId: string; awayClubId: string; kickoffAt: string };

function findLinkedMatch(matches: MatchRow[], clubIds: string[], publishedAt: string): string | null {
  if (clubIds.length < 2) return null;
  const pubTime = new Date(publishedAt).getTime();
  const eligible = matches.filter((m) => {
    const isHome = clubIds.includes(m.homeClubId);
    const isAway = clubIds.includes(m.awayClubId);
    if (!isHome || !isAway) return false;
    const diff = Math.abs(new Date(m.kickoffAt).getTime() - pubTime);
    return diff <= 48 * 3600000;
  });
  if (!eligible.length) return null;
  eligible.sort((a, b) => {
    const diffA = Math.abs(new Date(a.kickoffAt).getTime() - pubTime);
    const diffB = Math.abs(new Date(b.kickoffAt).getTime() - pubTime);
    return diffA - diffB || a.id.localeCompare(b.id);
  });
  return eligible[0].id;
}

/** Rows handled per pass, new articles first. Batched queries process up to 1,000 articles in ~1-2 seconds with only ~10 SQL statements. */
const batchLimit = 1000;

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

    // Pre-fetch matches in the window to resolve linked matches in-memory with zero network roundtrips
    const matches = await tx.query<MatchRow>(
      `SELECT id, "homeClubId", "awayClubId", "kickoffAt" FROM "Match"
       WHERE "kickoffAt" BETWEEN $1::timestamptz - interval '48 hours' AND $2::timestamptz + interval '48 hours'`,
      [since, now]
    );

    const counts = { examined: rows.length, published: 0, held: 0, kept: 0, notPermitted: 0, groups: 0 };
    const clubEntities: Array<{ id: string; articleId: string; clubId: string }> = [];
    const playerEntities: Array<{ id: string; articleId: string; playerId: string }> = [];
    const leagueEntities: Array<{ id: string; articleId: string; leagueId: string }> = [];
    const feedCardsToUpsert: Array<{
      articleId: string; status: string; storyType: string; label: string; certainty: string;
      transferStage: string | null; originHint: string | null; holdReasons: string[]; matchId: string | null;
    }> = [];

    const seenClub = new Set<string>();
    const seenPlayer = new Set<string>();
    const seenLeague = new Set<string>();

    for (const row of rows) {
      if (!vietnameseSource(row.slug) || !permittedFeedSnapshot(row, row.source, row.snapshot)) { counts.notPermitted++; continue; }
      if (row.cardStatus !== null) {
        if (row.decidedById) counts.kept++; else if (row.cardStatus === "HELD") counts.held++; else counts.published++;
        continue;
      }
      const title = row.titleOriginal;
      const description = row.excerptOriginal;
      const entities = resolveEntities(`${title}\n${description ?? ""}`, catalog).filter((entity) => entity.kind !== "match");
      for (const entity of entities) {
        const key = `${row.id}:${entity.id}`;
        if (entity.kind === "club" && !seenClub.has(key)) {
          seenClub.add(key);
          clubEntities.push({ id: randomUUID(), articleId: row.id, clubId: entity.id });
        } else if (entity.kind === "player" && !seenPlayer.has(key)) {
          seenPlayer.add(key);
          playerEntities.push({ id: randomUUID(), articleId: row.id, playerId: entity.id });
        } else if (entity.kind === "league" && !seenLeague.has(key)) {
          seenLeague.add(key);
          leagueEntities.push({ id: randomUUID(), articleId: row.id, leagueId: entity.id });
        }
      }
      const storyType = feedStoryType(title, description);
      const holds = holdReasons(`${title}\n${description ?? ""}`);
      const derived = {
        storyType,
        label: feedLabel(row.sourceTier),
        certainty: feedCertainty(title, description),
        transferStage: feedTransferStage(storyType, title, description),
        originHint: originHint(title, description),
        holdReasons: holds,
        matchId: findLinkedMatch(matches, entities.filter((entity) => entity.kind === "club").map((entity) => entity.id), row.publishedAt),
      };
      const status = row.decidedById ? row.cardStatus! : holds.length ? "HELD" : "PUBLISHED";
      feedCardsToUpsert.push({ articleId: row.id, status, ...derived });
      if (row.decidedById) counts.kept++; else if (status === "HELD") counts.held++; else counts.published++;
    }

    // Batch insert entities into ArticleEntity
    if (clubEntities.length > 0) {
      await tx.query(`
        INSERT INTO "ArticleEntity" (id, "articleId", "clubId", "updatedAt")
        SELECT id, "articleId", "clubId", now()
        FROM json_to_recordset($1::json) AS x(id uuid, "articleId" uuid, "clubId" uuid)
        ON CONFLICT ("articleId", "clubId") DO NOTHING
      `, [JSON.stringify(clubEntities)]);
    }
    if (playerEntities.length > 0) {
      await tx.query(`
        INSERT INTO "ArticleEntity" (id, "articleId", "playerId", "updatedAt")
        SELECT id, "articleId", "playerId", now()
        FROM json_to_recordset($1::json) AS x(id uuid, "articleId" uuid, "playerId" uuid)
        ON CONFLICT ("articleId", "playerId") DO NOTHING
      `, [JSON.stringify(playerEntities)]);
    }
    if (leagueEntities.length > 0) {
      await tx.query(`
        INSERT INTO "ArticleEntity" (id, "articleId", "leagueId", "updatedAt")
        SELECT id, "articleId", "leagueId", now()
        FROM json_to_recordset($1::json) AS x(id uuid, "articleId" uuid, "leagueId" uuid)
        ON CONFLICT ("articleId", "leagueId") DO NOTHING
      `, [JSON.stringify(leagueEntities)]);
    }

    // Batch upsert into FeedCard
    if (feedCardsToUpsert.length > 0) {
      await tx.query(`
        INSERT INTO "FeedCard" ("articleId", status, "storyType", label, certainty, "transferStage", "originHint", "holdReasons", "matchId", "updatedAt")
        SELECT "articleId", status, "storyType", label, certainty, "transferStage", "originHint", "holdReasons", "matchId", now()
        FROM json_to_recordset($1::json) AS x(
          "articleId" uuid, status text, "storyType" text, label text, certainty text,
          "transferStage" text, "originHint" text, "holdReasons" text[], "matchId" uuid
        )
        ON CONFLICT ("articleId") DO UPDATE SET
          status = CASE WHEN "FeedCard"."decidedById" IS NULL THEN EXCLUDED.status ELSE "FeedCard".status END,
          "storyType" = EXCLUDED."storyType",
          label = EXCLUDED.label,
          certainty = EXCLUDED.certainty,
          "transferStage" = EXCLUDED."transferStage",
          "originHint" = EXCLUDED."originHint",
          "holdReasons" = EXCLUDED."holdReasons",
          "matchId" = EXCLUDED."matchId",
          "updatedAt" = now()
      `, [JSON.stringify(feedCardsToUpsert)]);
    }

    // Regroup every card in the window so late arrivals join earlier coverage deterministically.
    const cards = await tx.query<{ articleId: string; sourceId: string; publishedAt: string; title: string; matchId: string | null; transferStage: string | null; groupKey: string | null; entityIds: string[] }>(`SELECT c."articleId",a."sourceId",a."publishedAt",a."titleOriginal" AS title,c."matchId",c."transferStage",c."groupKey",
      COALESCE(ARRAY(SELECT COALESCE(e."clubId",e."playerId")::text FROM "ArticleEntity" e WHERE e."articleId"=a.id AND (e."clubId" IS NOT NULL OR e."playerId" IS NOT NULL)),'{}') AS "entityIds"
      FROM "FeedCard" c JOIN "Article" a ON a.id=c."articleId" WHERE c.status<>'HIDDEN' AND a."publishedAt" BETWEEN $1::timestamptz AND $2::timestamptz`, [since, now]);
    const keys = groupFeedCards(cards.map((card): GroupableCard => ({ ...card, publishedAt: new Date(card.publishedAt) })));
    const groupUpdates = cards
      .map((card) => ({ articleId: card.articleId, groupKey: keys.get(card.articleId) ?? card.articleId }))
      .filter((item, index) => cards[index].groupKey !== item.groupKey);

    if (groupUpdates.length > 0) {
      await tx.query(`
        UPDATE "FeedCard" AS f
        SET "groupKey" = x."groupKey", "updatedAt" = now()
        FROM json_to_recordset($1::json) AS x("articleId" uuid, "groupKey" uuid)
        WHERE f."articleId" = x."articleId"
      `, [JSON.stringify(groupUpdates)]);
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
