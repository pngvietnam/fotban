import { randomUUID } from "node:crypto";
import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
import { defaultClusterPolicy, type ClusterArticle } from "../types/story-clustering";
import { transferSnapshotSchema, type TransferSnapshot } from "../types/transfers";
import { canonicalizeStory } from "./story-canonicalization";
import { loadClusterState } from "./story-clustering";
import { confirmationEvidenceIds, transferFacts, transferInputHash, transferStatusFor } from "./transfer-evidence";
import { statusRank } from "../lib/transfer-presentation";

export function currentTransferSnapshot(rows: TransferSnapshot[]) {
  const ordered = [...rows].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || statusRank[a.status] - statusRank[b.status] || a.inputHash.localeCompare(b.inputHash));
  let current: TransferSnapshot | null = null;
  for (const row of ordered) {
    if (!current || row.disputed || current.status !== "CONFIRMED" || row.status === "CONFIRMED") current = row;
  }
  return current;
}

export async function transferMember(tx: SqlExecutor, articleId: string, now: Date) {
  const state = await loadClusterState(tx, [articleId], [], now, defaultClusterPolicy, true);
  return state.members[0] ?? null;
}

/** Explicit database-only projection job. It never grants Article publication or source rights. */
export class TransferTrackingService {
  constructor(private db: SyncDatabase) {}
  async sync(now = new Date(), clusterId?: string) {
    return this.db.transaction(async (tx) => {
      await tx.query("SELECT 1 AS locked FROM pg_advisory_xact_lock(91531108)");
      await tx.query("SELECT 1 AS locked FROM pg_advisory_xact_lock(91531110)");
      // Follow the same source → Article → evidence locking order as M6–M8.
      await tx.query('SELECT id FROM "NewsSource" ORDER BY id FOR SHARE');
      const candidates = await tx.query<{ id: string }>('SELECT c.id FROM "ArticleCluster" c WHERE ($1::uuid IS NULL OR c.id=$1::uuid) AND EXISTS(SELECT 1 FROM "Article" a WHERE a."clusterId"=c.id AND a."storyType"=\'TRANSFER\') ORDER BY c.id LIMIT 101', [clusterId ?? null]);
      if (candidates.length > 100) throw new Error("TRANSFER_BATCH_TOO_LARGE");
      const report = { clusters: candidates.length, created: 0, cached: 0, incomplete: 0, blocked: 0, newEvidenceRequired: 0 };
      for (const candidate of candidates) {
        const ids = await tx.query<{ id: string }>('SELECT id FROM "Article" WHERE "clusterId"=$1::uuid ORDER BY id LIMIT 201', [candidate.id]);
        const state = await loadClusterState(tx, ids.map((row) => row.id), [candidate.id], now, defaultClusterPolicy);
        const canonical = canonicalizeStory(state.members, state.clusters[0]);
        const conflict = canonical.disputed;
        if ((!canonical.eligible && !conflict) || canonical.storyType !== "TRANSFER") { report.blocked++; continue; }
        for (const member of state.members) {
          if ((!member.reliability.publishability.eligible && !conflict) || !member.reliability.permission.usageAllowed || member.reliability.publishability.blockers.some((code) => !["DISPUTED"].includes(code))) { report.blocked++; continue; }
          if (!member.transferPair.player) { report.incomplete++; continue; }
          const proof = member.input.evidence.find((item) => member.reliability.explanation.evidenceIds.includes(item.id));
          if (!proof || !member.input.article.titleVi || !member.input.article.summaryVi || !member.input.article.publishedAt) { report.blocked++; continue; }
          await this.record(tx, member, candidate.id, proof.id, conflict, report);
        }
      }
      return report;
    });
  }
  private async record(tx: SqlExecutor, member: ClusterArticle, clusterId: string, evidenceId: string, disputed: boolean, report: { created: number; cached: number; newEvidenceRequired: number }) {
    const facts = transferFacts(member, new Date(member.reliability.evaluatedAt));
    const inputHash = transferInputHash(member, facts, disputed);
    if ((await tx.query('SELECT id FROM "TransferUpdate" WHERE "inputHash"=$1', [inputHash])).length) { report.cached++; return; }
    const status = disputed ? "RUMOR" : transferStatusFor(member);
    if (member.reliability.transferStatus === "CONFIRMED" && status !== "CONFIRMED") { report.newEvidenceRequired++; return; }
    const validProofs = member.input.evidence.filter((item) => member.reliability.explanation.evidenceIds.includes(item.id) && (disputed || item.stance === "SUPPORTS")).map((item) => item.id);
    const factProofs = Object.values(facts).flatMap((fact) => fact ? [fact.evidenceId] : []);
    const candidates = [...new Set([evidenceId, ...validProofs, ...factProofs])];
    const used = await tx.query<{ evidenceId: string; status: string }>('SELECT "evidenceId",status FROM "TransferUpdate" WHERE "evidenceId"=ANY($1::uuid[]) AND "inputHash" IS NOT NULL', [candidates]);
    const prior = await tx.query<{ snapshot: unknown }>('SELECT snapshot FROM "TransferUpdate" WHERE snapshot->>\'articleId\'=$1', [member.input.article.id]);
    const seen = new Set(prior.flatMap((row) => { const parsed = transferSnapshotSchema.safeParse(row.snapshot); return parsed.success ? [...parsed.data.evidenceIds, ...Object.values(parsed.data.facts).flatMap((fact) => fact ? [fact.evidenceId] : [])] : []; }));
    const unused = candidates.filter((id) => !seen.has(id) && !used.some((row) => row.evidenceId === id));
    const proofId = status === "CONFIRMED" && !used.some((row) => row.status === "CONFIRMED") ? confirmationEvidenceIds(member).find((id) => unused.includes(id)) : unused[0];
    // A new confirmation must carry new authoritative proof, never just a new fee or count.
    if (!proofId) { report.newEvidenceRequired++; return; }
    const pair = member.transferPair;
    const linked = await tx.query<{ id: string }>('SELECT DISTINCT t.id FROM "Transfer" t JOIN "TransferUpdate" u ON u."transferId"=t.id WHERE u."clusterId"=$1::uuid AND t."playerId"=$2::uuid AND t."currentClubId" IS NOT DISTINCT FROM $3::uuid AND t."targetClubId" IS NOT DISTINCT FROM $4::uuid', [clusterId, pair.player, pair.currentClub, pair.targetClub]);
    // Explicit destination identity + bounded source-time span; never group by player alone.
    const nearby = linked.length || !pair.targetClub ? [] : await tx.query<{ id: string }>(`SELECT t.id FROM "Transfer" t JOIN "TransferUpdate" u ON u."transferId"=t.id WHERE u."inputHash" IS NOT NULL AND t."playerId"=$1::uuid AND t."currentClubId" IS NOT DISTINCT FROM $2::uuid AND t."targetClubId"=$3::uuid GROUP BY t.id HAVING greatest(max(u."publishedAt"),$4::timestamptz)-least(min(u."publishedAt"),$4::timestamptz)<=interval '30 days' ORDER BY t.id LIMIT 2`, [pair.player, pair.currentClub, pair.targetClub, member.input.article.publishedAt]);
    // Ambiguous existing events are not silently merged.
    const existing = linked[0] ?? (nearby.length === 1 ? nearby[0] : null); const transferId = existing?.id ?? randomUUID();
    const snapshot = transferSnapshotSchema.parse({ version: "transfer-v1", reliabilityPolicyVersion: member.reliability.policyVersion, articleId: member.input.article.id, clusterId, inputHash, playerId: pair.player, currentClubId: pair.currentClub, targetClubId: pair.targetClub, status, headlineVi: member.input.article.titleVi, summaryVi: member.input.article.summaryVi, publishedAt: member.input.article.publishedAt, disputed, facts, evidenceIds: member.reliability.explanation.evidenceIds });
    if (!existing) await tx.query('INSERT INTO "Transfer" (id,"playerId","currentClubId","targetClubId",status,"updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::"TransferStatus",now())', [transferId, pair.player, pair.currentClub, pair.targetClub, status]);
    await tx.query('INSERT INTO "TransferUpdate" (id,"transferId","evidenceId",status,summary,reason,"publishedAt","updatedAt","clusterId","inputHash",snapshot) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::"TransferStatus",$5,\'Reviewed transfer evidence; transfer-v1\',$6::timestamptz,now(),$7::uuid,$8,$9::jsonb)', [randomUUID(), transferId, proofId, status, snapshot.summaryVi, snapshot.publishedAt, clusterId, inputHash, JSON.stringify(snapshot)]);
    const history = await tx.query<{ snapshot: unknown }>('SELECT snapshot FROM "TransferUpdate" WHERE "transferId"=$1::uuid AND snapshot IS NOT NULL ORDER BY "publishedAt",id', [transferId]);
    const current = currentTransferSnapshot(history.map((row) => transferSnapshotSchema.parse(row.snapshot)))!;
    await tx.query('UPDATE "Transfer" SET status=$2::"TransferStatus",summary=$3,"updatedAt"=now() WHERE id=$1::uuid', [transferId, current.status, current.summaryVi]);
    report.created++;
  }
}
