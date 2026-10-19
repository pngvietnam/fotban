import { randomUUID } from "node:crypto";
import type { SyncDatabase, SqlExecutor } from "../lib/sync-database";
import { briefHash, briefWindow, resolveBriefRequest } from "../lib/brief-policy";
import { loadBriefInputs } from "./brief-inputs";
import { buildMorningBrief, validateMorningBrief } from "./brief-builder";
import { readBriefRecord, saveBriefRevision, type BriefRecord } from "./brief-store";
import type { BriefRequest } from "../types/morning-brief";

type Log = { info(fields: Record<string, unknown>, event: string): void; error(fields: Record<string, unknown>, event: string): void };
export function briefTransactionConflict(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 7) return false;
  const item = error as Record<string, unknown>;
  if (["40001", "40P01", "P2034"].includes(String(item.code)) || item.kind === "TransactionWriteConflict") return true;
  return ["cause", "meta", "driverAdapterError", "originalError", "error"].some((key) => briefTransactionConflict(item[key], depth + 1)) || ["40001", "40P01"].includes(String(item.originalCode));
}
export class MorningBriefService {
  constructor(private db: SyncDatabase, private log?: Log) {}
  async generate(input: unknown, now = new Date()) {
    const request = resolveBriefRequest(input); const window = briefWindow(request, now);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await this.db.transaction(async (tx) => {
          await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
          await tx.query("SELECT 1 AS locked FROM pg_advisory_xact_lock(91531112)");
          const identity = await tx.query<{ id: string }>('INSERT INTO "DailyBrief" (id,date,locale,"updatedAt") VALUES ($1::uuid,$2::date,\'vi-VN\',$3::timestamptz) ON CONFLICT (date,locale) DO UPDATE SET "updatedAt"="DailyBrief"."updatedAt" RETURNING id', [randomUUID(), request.date, now]);
          const inputs = await loadBriefInputs(tx, request, window, now);
          const document = validateMorningBrief(buildMorningBrief(request, window, inputs), request, window, inputs);
          return saveBriefRevision(tx, identity[0].id, request, window, inputs, document, now);
        });
        this.log?.info({ revisionId: result.record.id, revision: result.record.revision, status: result.record.status, cached: result.cached }, "brief.generated");
        return result;
      } catch (error) {
        if (briefTransactionConflict(error) && attempt < 2) continue;
        this.log?.error({ code: "BRIEF_GENERATION_FAILED", date: request.date }, "brief.failed"); throw new Error("BRIEF_GENERATION_FAILED");
      }
    }
    throw new Error("BRIEF_GENERATION_FAILED");
  }
  /** Explicit internal operation only; generation and CLI never publish automatically. */
  async publish(revisionId: string, now = new Date(), editorial?: { actorId: string; reason: string }) {
    return this.db.transaction(async (tx) => {
      await tx.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await tx.query("SELECT 1 AS locked FROM pg_advisory_xact_lock(91531112)");
      if (editorial) {
        const actors = await tx.query('SELECT id FROM "User" WHERE id=$1::uuid AND role=\'ADMIN\' FOR SHARE', [editorial.actorId]);
        if (!actors.length || editorial.reason.trim().length < 5) throw new Error("ADMIN_REQUIRED");
      }
      // Lock inputs that may revoke rights/change facts while publication is committing.
      for (const table of ["NewsSource", "Article", "AIProcessingRun", "ArticleEntity", "ArticleCluster", "ArticleClusterRevision", "ClaimEvidence", "Match", "MatchEvent", "Club", "League", "Season", "ClubSeason", "ExternalIdentity", "Video", "VideoSource", "VideoSourceCompetition", "Transfer", "TransferUpdate"]) await tx.query(`LOCK TABLE "${table}" IN SHARE MODE`);
      const record = await readBriefRecord(tx, revisionId); if (!record || record.status !== "READY") throw new Error("BRIEF_NOT_READY");
      await assertBriefCurrent(tx, record, now);
      const latest = await tx.query<{ id: string }>('SELECT id FROM "BriefRevision" WHERE "briefId"=$1::uuid ORDER BY revision DESC LIMIT 1', [record.briefId]);
      if (latest[0]?.id !== record.id) throw new Error("BRIEF_REVISION_SUPERSEDED");
      await tx.query('UPDATE "BriefRevision" SET status=\'PUBLISHED\',"publishedAt"=$2::timestamptz,"updatedAt"=$2::timestamptz,"publishedById"=$3::uuid WHERE id=$1::uuid', [record.id, now, editorial?.actorId ?? null]);
      await tx.query('UPDATE "DailyBrief" SET status=\'PUBLISHED\',"publishedAt"=$2::timestamptz,"updatedAt"=$2::timestamptz WHERE id=$1::uuid', [record.briefId, now]);
      if (editorial) await tx.query('INSERT INTO "AdminAuditLog" (id,"actorId",action,"targetType","targetId",reason,before,after) VALUES ($1::uuid,$2::uuid,\'BRIEF_PUBLISH\',\'BriefRevision\',$3,$4,$5::jsonb,$6::jsonb)', [randomUUID(),editorial.actorId,record.id,editorial.reason,JSON.stringify({ status:"READY" }),JSON.stringify({ status:"PUBLISHED",publishedAt:now.toISOString(),publishedBy:editorial.actorId })]);
      return record.id;
    });
  }
}
export async function assertBriefCurrent(tx: SqlExecutor, record: BriefRecord, now: Date) {
  const request: BriefRequest = record.metadata.request;
  const window = briefWindow(request, now);
  validateMorningBrief(record.document, request, window, record.metadata.inputs);
  const current = await loadBriefInputs(tx, request, window, now);
  for (const item of record.document.sections.flatMap((section) => section.items)) {
    if (item.section === "UPCOMING" && item.match) {
      // A historical schedule remains a schedule as of its stated cutoff, even after kickoff.
      const rows = await tx.query<{ homeId: string; awayId: string; league: string; kickoff: Date; home: string; away: string; provider: string }>('SELECT m."homeClubId" AS "homeId",m."awayClubId" AS "awayId",m."kickoffAt" AS kickoff,m.provider,l.slug AS league,h.name AS home,a.name AS away FROM "Match" m JOIN "League" l ON l.id=m."leagueId" JOIN "Club" h ON h.id=m."homeClubId" JOIN "Club" a ON a.id=m."awayClubId" WHERE m.id=$1::uuid AND m.status NOT IN (\'CANCELLED\',\'POSTPONED\') AND EXISTS(SELECT 1 FROM "ExternalIdentity" x WHERE x."matchId"=m.id AND x.provider=m.provider AND x."entityType"=\'MATCH\')', [item.match.id]);
      const row = rows[0];
      if (!row || row.homeId !== item.match.homeId || row.awayId !== item.match.awayId || row.home !== item.match.home || row.away !== item.match.away || row.league !== item.match.league || row.provider !== item.match.provider || new Date(row.kickoff).toISOString() !== item.match.kickoffAt) throw new Error("BRIEF_FIXTURE_CHANGED");
      continue;
    }
    const fresh = current.candidates.find((candidate) => candidate.key === item.key);
    if (!fresh || item.titleVi !== fresh.titleVi || item.summaryVi !== fresh.summaryVi || !item.match && item.sourceFingerprint !== fresh.sourceFingerprint) throw new Error("BRIEF_SOURCE_CHANGED");
    if (!item.match && (briefHash(item.citations) !== briefHash(fresh.citations) || briefHash(item.reliability) !== briefHash(fresh.reliability) || item.transferStatus !== fresh.transferStatus || item.clusterId !== fresh.clusterId || item.transferId !== fresh.transferId)) throw new Error("BRIEF_PROVENANCE_CHANGED");
    if (item.match && fresh.match) {
      const { observedAt: _old, ...oldFacts } = item.match; const { observedAt: _new, ...newFacts } = fresh.match; void _old; void _new;
      if (briefHash(oldFacts) !== briefHash(newFacts)) throw new Error("BRIEF_MATCH_CHANGED");
    }
  }
}
