import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { SyncDatabase } from "../../lib/sync-database";
import type { AIResult } from "../../providers/ai/schema";
import { processArticle } from "../../services/ai-processing";
import { AIProcessingStore } from "../../services/ai-store";
import { StoryClusteringService } from "../../services/story-clustering";
import type { TransferStatus } from "../../types/transfers";
import { clusterId } from "./clustering";
import { relNow } from "./reliability";

export const transferIds = { player: clusterId(901), origin: clusterId(900), arsenal: clusterId(902), chelsea: clusterId(903), league: clusterId(904) };
export async function transferDatabase() {
  const db = new PGlite();
  for (const entry of readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await db.exec(readFileSync(`prisma/migrations/${entry.name}/migration.sql`, "utf8"));
  const database: SyncDatabase = { query: async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows, transaction: (work) => db.transaction((tx) => work({ query: async <T>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows })) };
  return { db, database };
}
export async function resetTransferDatabase(db: PGlite) {
  await db.exec('TRUNCATE "Transfer","Article","ArticleCluster","NewsSource","Club","Player","League" CASCADE');
  for (const [id, name] of [[transferIds.origin, "Origin"], [transferIds.arsenal, "Arsenal"], [transferIds.chelsea, "Chelsea"]]) await db.query('INSERT INTO "Club" (id,slug,name,aliases,"updatedAt") VALUES ($1::uuid,$2,$2,$3::text[],now())', [id, name, name === "Arsenal" ? ["ARS", "Arsenal FC"] : []]);
  await db.query('INSERT INTO "Player" (id,slug,name,aliases,"updatedAt") VALUES ($1::uuid,\'player-x\',\'Player X\',ARRAY[\'Player Alias\'],now())', [transferIds.player]);
  await db.query('INSERT INTO "League" (id,slug,name,country,"updatedAt") VALUES ($1::uuid,\'premier-league\',\'Premier League\',\'England\',now())', [transferIds.league]);
}
type Options = { status?: TransferStatus; destination?: "Arsenal" | "Chelsea"; official?: boolean; feeText?: string; alias?: boolean; date?: string; publish?: boolean; missingPlayer?: boolean; missingTarget?: boolean };
export async function seedTransferArticle(db: PGlite, database: SyncDatabase, n: number, options: Options = {}) {
  const status = options.status ?? "INTEREST"; const official = options.official ?? status === "CONFIRMED"; const destination = options.destination ?? "Arsenal";
  const id = clusterId(n); const sourceId = clusterId(n + 100); const domain = `transfer-${n}.example.test`;
  const player = options.alias ? "Player Alias" : "Player X";
  const title = status === "CONFIRMED" ? `${destination} has signed ${player} from Origin` : status === "NEGOTIATION" ? `${destination} in talks to sign ${player} from Origin` : status === "INTEREST" ? `${destination} interested in ${player} from Origin` : `${destination} could sign ${player} from Origin`;
  const excerpt = `${title}. ${options.feeText ?? "The transfer situation is described by the source."}`;
  const titleVi = status === "CONFIRMED" ? `${destination} đã ký hợp đồng với ${player}` : status === "NEGOTIATION" ? `${destination} đàm phán chiêu mộ ${player}` : status === "INTEREST" ? `${destination} đang quan tâm đến ${player}` : `${player} có thể tới ${destination}`;
  const summaryVi = status === "CONFIRMED" ? `${destination} đã ký hợp đồng với ${player} từ Origin.` : status === "NEGOTIATION" ? `${destination} đang đàm phán với Origin về ${player}.` : status === "INTEREST" ? `${destination} được cho là đang quan tâm đến ${player} của Origin.` : `${player} được cho là có thể tới ${destination} từ Origin.`;
  await db.query('INSERT INTO "NewsSource" (id,name,domain,type,"reliabilityScore","sourceTier",official,"authorityScopes",rationale,reviewer,"reviewedAt","accessPolicy",enabled,"termsReviewed","ingestionAllowed","permissionStatus","permissionReference","updatedAt") VALUES ($1::uuid,$2,$3,$4::"SourceType",95,$5::"SourceTier",$6,$7::text[],\'Fixture review\',\'Fixture editor\',\'2026-10-16T00:00:00Z\',\'test-only\',true,true,true,\'ALLOWED\',$8,now())', [sourceId, `Transfer fixture ${n}`, domain, official ? "OFFICIAL" : "PUBLICATION", official ? "TIER_0_OFFICIAL" : "TIER_1_HIGH", official, official ? [`club:${destination === "Arsenal" ? transferIds.arsenal : transferIds.chelsea}`] : [], `https://${domain}/terms`]);
  const url = `https://${domain}/story/${n}`;
  await db.query('INSERT INTO "Article" (id,slug,"sourceId","sourceUrl","canonicalUrl","titleOriginal","excerptOriginal",language,"publishedAt","collectedAt","licenseName","licenseUrl","attributionText","licenseEvidenceUrl","sourceRevisionUrl","licenseVerifiedAt","commercialReuseAllowed","updatedAt") VALUES ($1::uuid,$2,$3::uuid,$4,$4,$5,$6,\'en\',$7::timestamptz,$7::timestamptz,\'CC BY 4.0\',\'https://creativecommons.org/licenses/by/4.0/\',\'Fixture authors · CC BY 4.0\',$8,$9,\'2026-10-17T06:00:00Z\',true,\'2026-10-17T06:01:00Z\')', [id, `transfer-fixture-${n}`, sourceId, url, title, excerpt, options.date ?? "2026-10-17T06:00:00Z", `https://${domain}/terms`, `https://${domain}/revision`]);
  const result = await processArticle(id, new AIProcessingStore(database), { name: "TEST_ONLY", model: "transfer-fixture-v1", process: async (input): Promise<AIResult> => ({ language: "en", titleVi, summaryVi, storyType: "TRANSFER", subtype: null, certainty: ["INTEREST", "RUMOR"].includes(status) ? "UNCERTAIN" : "REPORTED", publishable: false, warnings: ["EDITORIAL_REVIEW"], entities: input.entities.map((entity) => ({ id: entity.id, kind: entity.kind, mention: options.alias && entity.kind === "player" ? "Player Alias" : entity.name })), mentions: [], evidence: [{ field: "titleVi", sourceText: input.title }, { field: "summaryVi", sourceText: input.excerpt }], transfer: { status: status === "CONFIRMED" ? "RUMOR" : status, evidenceLevel: "SOURCE_REPORTED", sourceText: input.excerpt, player: options.missingPlayer ? null : { value: player, sourceText: input.excerpt }, currentClub: { value: "Origin", sourceText: input.excerpt }, targetClub: options.missingTarget ? null : { value: destination, sourceText: input.excerpt } }, injury: null }) });
  if (result.status !== "NEEDS_REVIEW") throw new Error(`Fixture processing failed: ${result.status}`);
  await db.query('UPDATE "AIProcessingRun" SET "createdAt"=\'2026-10-17T06:05:00Z\' WHERE "articleId"=$1::uuid', [id]);
  await db.query('UPDATE "ClaimEvidence" SET "claimKey"=\'transfer-fixture-claim\',"lineageKey"=$2,"reviewedBy"=\'Fixture editor\',"reviewedAt"=\'2026-10-17T07:00:00Z\',kind=$3::"EvidenceKind","authorityScope"=$4 WHERE "articleId"=$1::uuid', [id, `transfer-origin-${n}`, official ? "OFFICIAL_STATEMENT" : "ARTICLE_SOURCE", official ? `club:${destination === "Arsenal" ? transferIds.arsenal : transferIds.chelsea}` : null]);
  await db.query('INSERT INTO "ArticleEntity" (id,"articleId","leagueId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,now())', [clusterId(20000 + n), id, transferIds.league]);
  await new StoryClusteringService(database).cluster({ now: relNow });
  if (options.publish !== false) await db.query('UPDATE "Article" SET "processingStatus"=\'READY\',"publicationStatus"=\'PUBLISHED\',"reliabilityClass"=$2::"ReliabilityClass" WHERE id=$1::uuid', [id, official ? "OFFICIAL" : status === "NEGOTIATION" ? "RELIABLE" : "RUMOR"]);
  return { id, sourceId, title, excerpt };
}

