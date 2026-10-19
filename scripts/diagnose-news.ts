import { writeFile } from "node:fs/promises";
import { createDatabaseClient } from "../lib/database-client";
import { prismaSyncDatabase } from "../lib/sync-database";
import { AIProcessingStore, eligible } from "../services/ai-store";
import { loadReliabilityInput } from "../services/reliability-service";
import { ReliabilityEngine } from "../services/reliability-engine";
import { loadClusterState } from "../services/story-clustering";
import { canonicalizeStory } from "../services/story-canonicalization";
import { readPublishedStory } from "../services/news-ui-data";
import { defaultClusterPolicy } from "../types/story-clustering";

type ArticleRow = { id: string; sourceId: string; validatedProcessingRuns: number; [key: string]: unknown };
type ArticleDiagnostic = ArticleRow & { processingGate: string | null; publishable: boolean; blockers: string[]; reliability: { label: string; certainty: string } | null };
type ClusterDiagnostic = { id: string; publishable: boolean; blockers: string[]; visible: boolean; sourceIds: string[] };

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--output" || !/^docs\/samples\/[a-z0-9-]+\.json$/.test(args[1]))) throw new Error("Use --output docs/samples/<name>.json");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const client = createDatabaseClient(process.env.DATABASE_URL);
  try {
    const database = prismaSyncDatabase(client);
    const report = await database.transaction(async (tx) => {
      await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const now = new Date(); const engine = new ReliabilityEngine(); const store = new AIProcessingStore(database);
      const sources = await tx.query<Record<string, unknown> & { id: string }>(`SELECT s.id,s.name,s.slug,s.domain,s.enabled,s."termsReviewed",s."ingestionAllowed",s."permissionStatus",s."commercialReuseAllowed",s."sourceTier",s."permissionScope",s."feedUrl",s."lastTermsReviewAt",s."attributionRequirement",s."ingestionNotes",
        count(a.id)::int AS articles,
        count(a.id) FILTER(WHERE a."collectedAt">=now()-interval '24 hours')::int AS "collected24h",
        count(a.id) FILTER(WHERE a."processingStatus"='READY')::int AS ready,
        count(a.id) FILTER(WHERE nullif(trim(a."titleVi"),'') IS NOT NULL)::int AS "withTitleVi",
        count(a.id) FILTER(WHERE nullif(trim(a."summaryVi"),'') IS NOT NULL)::int AS "withSummaryVi",
        count(a.id) FILTER(WHERE a."publicationStatus"='HIDDEN')::int AS "hiddenOrRejected",
        count(a.id) FILTER(WHERE a."publicationStatus"='HIDDEN' AND EXISTS(SELECT 1 FROM "AdminAuditLog" audit WHERE audit."targetType"='Article' AND audit."targetId"=a.id::text AND audit.action='ARTICLE_REJECT'))::int AS rejected,
        count(a.id) FILTER(WHERE a."processingStatus"='NEEDS_REVIEW')::int AS "reviewRequired",
        count(a.id) FILTER(WHERE a."publicationStatus"='PUBLISHED')::int AS published,
        count(DISTINCT a."clusterId")::int AS clusters
        FROM "NewsSource" s LEFT JOIN "Article" a ON a."sourceId"=s.id GROUP BY s.id ORDER BY s.domain`);
      if (sources.reduce((sum,s) => sum+Number(s.articles),0) > 500) throw new Error("Diagnostic article limit exceeded; narrow the query before reporting");
      const articles = await tx.query<ArticleRow>(`SELECT a.id,a.slug,a."sourceId",a."sourceUrl",a."titleOriginal",a.language,a."publishedAt",a."collectedAt",a."processingStatus",a."publicationStatus",a."licenseName",a."clusterId",(SELECT count(*)::int FROM "AIProcessingRun" r WHERE r."articleId"=a.id AND r."validationOutcome"->>'valid'='true') AS "validatedProcessingRuns",(SELECT jsonb_agg(jsonb_build_object('provider',r.provider,'status',r.status,'error',r."errorSafe",'output',r.output,'validation',r."validationOutcome")) FROM "AIProcessingRun" r WHERE r."articleId"=a.id) AS processing,(SELECT jsonb_agg(jsonb_build_object('league',l.name,'club',c.name,'player',p.name)) FROM "ArticleEntity" e LEFT JOIN "League" l ON l.id=e."leagueId" LEFT JOIN "Club" c ON c.id=e."clubId" LEFT JOIN "Player" p ON p.id=e."playerId" WHERE e."articleId"=a.id) AS entities FROM "Article" a ORDER BY a."collectedAt",a.id LIMIT 500`);
      const details: ArticleDiagnostic[] = [];
      for (const article of articles) {
        const input = await loadReliabilityInput(tx, article.id); const processing = await store.article(article.id, tx);
        const result = input ? engine.assess(input, now) : null;
        details.push({ ...article, processingGate: processing ? eligible(processing) : "NOT_FOUND", publishable: result?.publishability.eligible ?? false, blockers: result?.publishability.blockers ?? [], reliability: result ? { label: result.label, certainty: result.certainty } : null });
      }
      const clusters: ClusterDiagnostic[] = [];
      for (const cluster of await tx.query<{ id: string }>('SELECT id FROM "ArticleCluster" ORDER BY id LIMIT 500')) {
        const ids = await tx.query<{ id: string }>('SELECT id FROM "Article" WHERE "clusterId"=$1::uuid ORDER BY id', [cluster.id]);
        const state = await loadClusterState(tx, ids.map((row) => row.id), [cluster.id], now, defaultClusterPolicy, true);
        const snapshot = canonicalizeStory(state.members, state.clusters[0]);
        clusters.push({ id: cluster.id, publishable: snapshot.eligible, blockers: snapshot.blockers, visible: Boolean(await readPublishedStory(tx, cluster.id, now)), sourceIds: [...new Set(state.members.map((member) => member.input.source.id))] });
      }
      return { checkedAt: now.toISOString(), aiMode: process.env.AI_PROVIDER ?? "fallback", totals: { sources: sources.length, enabled: sources.filter((s) => s.enabled).length, permissionAllowed: sources.filter((s) => s.permissionStatus === "ALLOWED").length, articles: details.length, collected24h: sources.reduce((sum, s) => sum + Number(s.collected24h), 0), processedValidated: details.filter((a) => Number(a.validatedProcessingRuns) > 0).length, ready: sources.reduce((sum,s) => sum+Number(s.ready),0), withTitleVi: sources.reduce((sum,s) => sum+Number(s.withTitleVi),0), withSummaryVi: sources.reduce((sum,s) => sum+Number(s.withSummaryVi),0), publishable: details.filter((a) => a.publishable).length, rejected: sources.reduce((sum,s) => sum+Number(s.rejected),0), hiddenOrRejected: sources.reduce((sum,s) => sum+Number(s.hiddenOrRejected),0), reviewRequired: sources.reduce((sum,s) => sum+Number(s.reviewRequired),0), clusters: clusters.length, publishableClusters: clusters.filter((c) => c.publishable).length, visibleClusters: clusters.filter((c) => c.visible).length }, sources: sources.map((s) => ({ ...s, processedValidated: details.filter((a) => a.sourceId === s.id && Number(a.validatedProcessingRuns)>0).length, publishable: details.filter((a) => a.sourceId===s.id && a.publishable).length, publishableClusters: clusters.filter((c) => c.sourceIds.includes(s.id) && c.publishable).length, visibleClusters: clusters.filter((c) => c.sourceIds.includes(s.id) && c.visible).length })), articles: details, clusters, diagnosticLimit: 500 };
    });
    const output = JSON.stringify(report, null, 2); console.log(output);
    if (args[1]) await writeFile(args[1], output + "\n", "utf8");
  } finally { await client.$disconnect(); }
}
main().catch(() => { console.error("News diagnostic failed; check database access and migrations. Sensitive error details withheld."); process.exitCode = 1; });
