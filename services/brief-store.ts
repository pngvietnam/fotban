import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SqlExecutor } from "../lib/sync-database";
import { briefHash, databaseSections } from "../lib/brief-policy";
import { briefDocumentSchema, briefItemSchema, briefRequestSchema, type BriefDocument, type BriefInputs, type BriefRequest, type BriefWindow } from "../types/morning-brief";
import { matchEvidenceId } from "./brief-inputs";

const candidate = briefItemSchema.omit({ components: true, importanceScore: true }).extend({ featured: z.boolean(), seenBefore: z.boolean() }).strict();
export const briefMetadataSchema = z.object({ version: z.literal("brief-revision-v1"), request: briefRequestSchema, header: briefDocumentSchema.omit({ sections: true }), sections: z.array(z.object({ type: z.string(), labelVi: z.string(), keys: z.array(z.string()) }).strict()), inputs: z.object({ candidates: z.array(candidate), excluded: z.number().int().nonnegative() }).strict() }).strict();
export type BriefRecord = { id: string; briefId: string; revision: number; status: string; inputHash: string; generatedAt: string; publishedAt: string | null; document: BriefDocument; metadata: z.infer<typeof briefMetadataSchema> };
export function briefStateHash(request: BriefRequest, window: BriefWindow, inputs: BriefInputs) { return briefHash({ request, window, inputs, version: "brief-v1", ranking: "brief-ranking-v1" }); }
export async function readBriefRecord(tx: SqlExecutor, id: string): Promise<BriefRecord | null> {
  const rows = await tx.query<{ id: string; briefId: string; revision: number; status: string; inputHash: string; generatedAt: Date; publishedAt: Date | null; generationMetadata: unknown }>('SELECT id,"briefId",revision,status,"inputHash","generatedAt","publishedAt","generationMetadata" FROM "BriefRevision" WHERE id=$1::uuid AND "generationMetadata" IS NOT NULL', [id]);
  const row = rows[0]; if (!row) return null;
  const metadata = briefMetadataSchema.parse(row.generationMetadata);
  const frozenWindow = { windowStart: metadata.header.windowStart, windowEnd: metadata.header.windowEnd, cutoffAt: metadata.header.cutoffAt, upcomingEnd: metadata.header.upcomingEnd };
  if (briefStateHash(metadata.request, frozenWindow, metadata.inputs) !== row.inputHash) throw new Error("INVALID_BRIEF_INPUT_HASH");
  const items = await tx.query<{ inputSnapshot: unknown }>('SELECT "inputSnapshot" FROM "BriefItem" WHERE "revisionId"=$1::uuid AND section<>\'MORNING_SUMMARY\' ORDER BY section,position', [id]);
  const indexed = new Map(items.map((item) => { const parsed = briefItemSchema.parse(item.inputSnapshot); return [parsed.key, parsed]; }));
  if (indexed.size !== items.length || metadata.sections.flatMap((section) => section.keys).length !== items.length) throw new Error("INVALID_BRIEF_STORAGE");
  const document = briefDocumentSchema.parse({ ...metadata.header, sections: metadata.sections.map((section) => ({ type: section.type, labelVi: section.labelVi, items: section.keys.map((key) => indexed.get(key)) })) });
  return { ...row, generatedAt: new Date(row.generatedAt).toISOString(), publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null, document, metadata };
}
export async function saveBriefRevision(tx: SqlExecutor, briefId: string, request: BriefRequest, window: BriefWindow, inputs: BriefInputs, document: BriefDocument, now: Date) {
  const inputHash = briefStateHash(request, window, inputs);
  const old = await tx.query<{ id: string; inputHash: string }>('SELECT id,"inputHash" FROM "BriefRevision" WHERE "briefId"=$1::uuid AND "generationMetadata" IS NOT NULL ORDER BY revision DESC LIMIT 1', [briefId]);
  if (old[0]?.inputHash === inputHash) return { record: (await readBriefRecord(tx, old[0].id))!, cached: true };
  const count = await tx.query<{ next: number }>('SELECT coalesce(max(revision),0)+1 AS next FROM "BriefRevision" WHERE "briefId"=$1::uuid', [briefId]);
  const id = randomUUID(); const status = document.sections.length ? "READY" : "DRAFT";
  const { sections, ...header } = document;
  const metadata = briefMetadataSchema.parse({ version: "brief-revision-v1", request, header, sections: sections.map((section) => ({ type: section.type, labelVi: section.labelVi, keys: section.items.map((item) => item.key) })), inputs });
  await tx.query('INSERT INTO "BriefRevision" (id,"briefId",revision,status,"windowStart","windowEnd","cutoffAt","inputHash","rankingVersion","generationMetadata","generatedAt","updatedAt") VALUES ($1::uuid,$2::uuid,$3,\'DRAFT\',$4::timestamptz,$5::timestamptz,$6::timestamptz,$7,\'brief-ranking-v1\',$8::jsonb,$9::timestamptz,$9::timestamptz)', [id, briefId, count[0].next, window.windowStart, window.windowEnd, window.cutoffAt, inputHash, JSON.stringify(metadata), now]);
  const positions = new Map<string, number>();
  const insert = async (section: keyof typeof databaseSections, headline: string, summary: string, snapshot: unknown, evidenceIds: string[], articleId: string | null = null, clusterId: string | null = null, matchId: string | null = null, score: number | null = null, components: unknown = null) => {
    const dbSection = databaseSections[section]; const position = positions.get(dbSection) ?? 0; positions.set(dbSection, position + 1); const itemId = randomUUID();
    // No Video FK or YouTube API metadata is frozen; historical briefs survive retention cleanup.
    await tx.query('INSERT INTO "BriefItem" (id,"briefId","revisionId",section,position,headline,summary,"articleId","clusterId","matchId","importanceScore","inputSnapshot","componentScores","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::"BriefSection",$5,$6,$7,$8::uuid,$9::uuid,$10::uuid,$11::numeric,$12::jsonb,$13::jsonb,$14::timestamptz)', [itemId, briefId, id, dbSection, position, headline, summary, articleId, clusterId, matchId, score, JSON.stringify(snapshot), components ? JSON.stringify(components) : null, now]);
    for (const evidenceId of [...new Set(evidenceIds)]) await tx.query('INSERT INTO "BriefItemEvidence" ("briefItemId","evidenceId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::timestamptz)', [itemId, evidenceId, now]);
  };
  const all = sections.flatMap((section) => section.items);
  for (const item of all) {
    if (item.match) {
      const evidenceId = matchEvidenceId(item.match);
      await tx.query('INSERT INTO "ClaimEvidence" (id,claim,"matchId","fieldPath",locator,kind,"claimKey","lineageKey","updatedAt") VALUES ($1::uuid,$2,$3::uuid,\'briefMatchSnapshot\',\'persisted MatchProvider fields\',\'MATCH_DATA\',$4,$5,$6::timestamptz) ON CONFLICT (id) DO NOTHING', [evidenceId, JSON.stringify(item.match), item.match.id, `brief-match:${item.sourceFingerprint}`, `match:${item.match.provider}:${item.match.id}`, now]);
    }
    await insert(item.section, item.titleVi, item.summaryVi, item, item.citations.map((citation) => citation.evidenceId), item.articleIds[0] ?? null, item.clusterId, item.match?.id ?? null, item.importanceScore, item.components);
  }
  if (document.summary.length) await insert("SUMMARY", document.titleVi, document.summary.map((point) => point.textVi).join("\n"), { version: "brief-summary-v1", points: document.summary }, document.summary.flatMap((point) => all.find((item) => item.key === point.itemKey)!.citations.map((citation) => citation.evidenceId)));
  await tx.query('UPDATE "BriefRevision" SET status=$2::"BriefStatus" WHERE id=$1::uuid', [id, status]);
  await tx.query('UPDATE "DailyBrief" SET "generatedAt"=$2::timestamptz,status=CASE WHEN status=\'PUBLISHED\' THEN status ELSE $3::"BriefStatus" END,"updatedAt"=$2::timestamptz WHERE id=$1::uuid', [briefId, now, status]);
  return { record: (await readBriefRecord(tx, id))!, cached: false };
}
