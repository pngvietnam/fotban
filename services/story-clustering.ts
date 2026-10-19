import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
import type { ClusterArticle, ClusterPolicy, ExistingCluster } from "../types/story-clustering";
import { defaultClusterPolicy } from "../types/story-clustering";
import { aiResultSchema } from "../providers/ai/schema";
import { resolveEntities } from "../providers/ai/rules";
import { loadReliabilityInput } from "./reliability-service";
import { ReliabilityEngine } from "./reliability-engine";
import { canonicalizeStory, publicStoryCandidate } from "./story-canonicalization";
import { normalizeStoryText, partitionStories, scoreStories } from "./story-similarity";

function stable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
const json = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;
const uuid = (id: string) => z.uuid().parse(id);
const metadataSchema = z.object({ input: z.object({ entities: z.array(z.object({ id: z.uuid(), kind: z.enum(["club", "player", "league", "match"]), name: z.string(), aliases: z.array(z.string()) })) }) });
type State = { members: ClusterArticle[]; clusters: ExistingCluster[] };

async function locked(tx: SqlExecutor) {
  // A supported scalar, not the void result that Prisma cannot deserialize.
  await tx.query("SELECT 1 AS locked FROM pg_advisory_xact_lock(91531108)");
  await tx.query('SELECT id FROM "NewsSource" ORDER BY id FOR SHARE');
}
/** Shared current-data loader. Public readers use a read-only snapshot, never clustering writes. */
export async function loadClusterState(tx: SqlExecutor, ids: string[], extraClusters: string[], now: Date, policy: ClusterPolicy, readOnly = false): Promise<State> {
  if (ids.length > policy.maxArticles) throw new Error("CLUSTER_BATCH_TOO_LARGE");
  if (!readOnly) {
    await tx.query('SELECT id FROM "Article" WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [ids]);
    await tx.query('SELECT id FROM "ClaimEvidence" WHERE "articleId"=ANY($1::uuid[]) ORDER BY id FOR SHARE', [ids]);
  }
  const members: ClusterArticle[] = []; const engine = new ReliabilityEngine();
  for (const id of [...ids].sort()) {
    const input = await loadReliabilityInput(tx, id); if (!input) continue;
    const reliability = engine.assess(input, now);
    const rows = json<{ clusterId: string | null; collectedAt: string; urls: string[]; output: unknown; inputSnapshot: unknown }[]>(await tx.query(`SELECT a."clusterId",a."collectedAt",ARRAY(SELECT DISTINCT url FROM (SELECT a."sourceUrl" AS url UNION SELECT a."canonicalUrl" UNION SELECT url FROM "ArticleUrl" WHERE "articleId"=a.id) u ORDER BY url) AS urls,r.output,r."inputSnapshot" FROM "Article" a LEFT JOIN LATERAL (SELECT output,"inputSnapshot" FROM "AIProcessingRun" WHERE "articleId"=a.id ORDER BY "createdAt" DESC,id DESC LIMIT 1) r ON true WHERE a.id=$1::uuid`, [id]));
    const row = rows[0];
    const parsed = input.processing.validated ? aiResultSchema.safeParse(row.output) : null;
    const output = parsed?.success ? parsed.data : null;
    const catalog = metadataSchema.safeParse(row.inputSnapshot);
    const resolveRole = (value: string | undefined, kind: "club" | "player") => {
      if (!value || !catalog.success) return null;
      const matches = resolveEntities(value, catalog.data.input.entities.filter((item) => item.kind === kind));
      return matches.length === 1 && input.article.entityScopes.includes(`${kind}:${matches[0].id}`) ? matches[0].id : null;
    };
    const transferPair = { player: resolveRole(output?.transfer?.player?.value, "player"), currentClub: resolveRole(output?.transfer?.currentClub?.value, "club"), targetClub: resolveRole(output?.transfer?.targetClub?.value, "club") };
    const names = await tx.query<{ name: string; aliases: string[] }>(`SELECT c.name,c.aliases || ARRAY[COALESCE(c."shortName",''),COALESCE(c.tla,'')] AS aliases FROM "ArticleEntity" e JOIN "Club" c ON c.id=e."clubId" WHERE e."articleId"=$1::uuid UNION ALL SELECT p.name,p.aliases FROM "ArticleEntity" e JOIN "Player" p ON p.id=e."playerId" WHERE e."articleId"=$1::uuid UNION ALL SELECT l.name,l.aliases FROM "ArticleEntity" e JOIN "League" l ON l.id=e."leagueId" WHERE e."articleId"=$1::uuid`, [id]);
    const identityNames = [...new Set(names.flatMap((item) => [item.name, ...item.aliases]).filter(Boolean))].sort();
    const managers = (output?.mentions ?? []).map((item) => item.sourceText).filter((text) => text.length <= 60 && text.split(/\s+/).length <= 4 && !/\b(?:signed|leaves|returns|announced|wants)\b/iu.test(text)).map(normalizeStoryText).sort();
    const fingerprint = hash({ input, collectedAt: row.collectedAt, urls: row.urls, transferPair, managers, identityNames, decision: { label: reliability.label, certainty: reliability.certainty, evidence: reliability.evidenceStrength, eligibility: reliability.publishability } });
    members.push({ input, reliability, fingerprint, clusterId: row.clusterId, collectedAt: row.collectedAt, urls: row.urls, transferPair, managers, identityNames });
  }
  const clusterIds = [...new Set([...extraClusters, ...members.flatMap((item) => item.clusterId ? [item.clusterId] : [])])];
  const clusters = json<ExistingCluster[]>(await tx.query(`SELECT c.*,EXISTS(SELECT 1 FROM "BriefItem" b JOIN "BriefRevision" r ON r.id=b."revisionId" WHERE b."clusterId"=c.id AND r.status='PUBLISHED') AS "publishedReferenced" FROM "ArticleCluster" c WHERE c.id=ANY($1::uuid[]) ORDER BY c.id${readOnly ? "" : " FOR UPDATE OF c"}`, [clusterIds]));
  return { members, clusters };
}

async function persist(tx: SqlExecutor, clusterId: string, members: ClusterArticle[], existing: ExistingCluster | undefined, policy: ClusterPolicy) {
  const snapshot = canonicalizeStory(members, existing, policy); const inputHash = hash({ snapshot, policy });
  const prior = await tx.query<{ revision: number; inputHash: string }>('SELECT revision,"inputHash" FROM "ArticleClusterRevision" WHERE "clusterId"=$1::uuid ORDER BY revision DESC LIMIT 1', [clusterId]);
  if (prior[0]?.inputHash === inputHash) return { clusterId, changed: false, revision: prior[0].revision, snapshot };
  await tx.query('INSERT INTO "ArticleCluster" (id,"updatedAt") VALUES ($1::uuid,now()) ON CONFLICT (id) DO NOTHING', [clusterId]);
  const decisions = members.slice(1).map((member) => ({ articleId: member.input.article.id, ...scoreStories(members[0], member, policy) }));
  await tx.query('UPDATE "ArticleCluster" SET headline=$2,summary=$3,"representativeArticleId"=$4::uuid,"selectionReason"=$5,"algorithmVersion"=$6,"hasConflict"=$7,"updatedAt"=now() WHERE id=$1::uuid', [clusterId, snapshot.headlineVi, snapshot.summaryVi, snapshot.representativeArticleId, JSON.stringify({ reasons: snapshot.blockers.length ? snapshot.blockers : ["EXACT_ELIGIBLE_MEMBER_COPY"], decisions }), policy.version, snapshot.disputed]);
  const revision = (prior[0]?.revision ?? 0) + 1;
  await tx.query('INSERT INTO "ArticleClusterRevision" (id,"clusterId",revision,"inputHash","algorithmVersion",snapshot) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb)', [randomUUID(), clusterId, revision, inputHash, policy.version, JSON.stringify(snapshot)]);
  return { clusterId, changed: true, revision, snapshot };
}
async function assign(tx: SqlExecutor, plan: { id: string; members: ClusterArticle[]; existing?: ExistingCluster }[], policy: ClusterPolicy) {
  // Clear unique representative pointers before moving memberships, not Article/evidence records.
  for (const group of plan) await tx.query('UPDATE "ArticleCluster" SET "representativeArticleId"=NULL WHERE id=$1::uuid', [group.id]);
  const results = [];
  for (const group of plan) {
    await tx.query('INSERT INTO "ArticleCluster" (id,"updatedAt") VALUES ($1::uuid,now()) ON CONFLICT (id) DO NOTHING', [group.id]);
    await tx.query('UPDATE "Article" SET "clusterId"=$1::uuid WHERE id=ANY($2::uuid[]) AND "clusterId" IS DISTINCT FROM $1::uuid', [group.id, group.members.map((member) => member.input.article.id)]);
    results.push(await persist(tx, group.id, group.members, group.existing, policy));
  }
  // Cached revisions still need their unique representative pointer restored after the temporary clear.
  for (const result of results) await tx.query('UPDATE "ArticleCluster" SET "representativeArticleId"=$2::uuid WHERE id=$1::uuid', [result.clusterId, result.snapshot.representativeArticleId]);
  return results;
}

/** Database-only orchestration; no remote AI/provider or UI dependency. */
export class StoryClusteringService {
  /** Re-evaluate one editorially changed story with the existing canonicalizer.
   * Source/evidence history and membership are retained; no new semantic logic. */
  async refreshArticle(articleId: string, now = new Date()) {
    uuid(articleId);
    return this.db.transaction(async (tx) => {
      await locked(tx);
      const [article] = await tx.query<{ clusterId: string | null }>('SELECT "clusterId" FROM "Article" WHERE id=$1::uuid FOR UPDATE', [articleId]);
      if (!article) throw new Error("ARTICLE_NOT_FOUND");
      const id = article.clusterId ?? randomUUID();
      if (!article.clusterId) {
        await tx.query('INSERT INTO "ArticleCluster" (id,"updatedAt") VALUES ($1::uuid,now())', [id]);
        await tx.query('UPDATE "Article" SET "clusterId"=$2::uuid WHERE id=$1::uuid', [articleId,id]);
      }
      const ids = await tx.query<{ id: string }>('SELECT id FROM "Article" WHERE "clusterId"=$1::uuid ORDER BY id LIMIT $2', [id,this.policy.maxArticles + 1]);
      const state = await loadClusterState(tx,ids.map((row) => row.id),[id],now,this.policy);
      const current = state.clusters[0];
      const representative = state.members.find((member) => member.input.article.id === current?.representativeArticleId);
      const existing = current && representative ? { ...current, headline: representative.input.article.titleVi, summary: representative.input.article.summaryVi } : current;
      return persist(tx,id,state.members,existing,this.policy);
    });
  }
  readonly policy: ClusterPolicy;
  constructor(private db: SyncDatabase, policy: Partial<ClusterPolicy> = {}) {
    this.policy = { ...defaultClusterPolicy, ...policy, windows: { ...defaultClusterPolicy.windows, ...policy.windows } };
    if (!Number.isInteger(this.policy.maxArticles) || this.policy.maxArticles < 1 || this.policy.maxArticles > 500 || [this.policy.defaultWindowHours, ...Object.values(this.policy.windows)].some((hours) => !Number.isFinite(hours) || hours <= 0 || hours > 168)) throw new Error("INVALID_CLUSTER_POLICY");
  }
  async cluster(options: { since?: Date; now?: Date } = {}) {
    const now = options.now ?? new Date();
    if (options.since && !Number.isFinite(options.since.getTime())) throw new Error("INVALID_CLUSTER_WINDOW");
    return this.db.transaction(async (tx) => {
      await locked(tx);
      const seeds = await tx.query<{ id: string }>('SELECT id FROM "Article" WHERE ($1::timestamptz IS NULL OR "collectedAt">=$1::timestamptz OR "publishedAt">=$1::timestamptz) ORDER BY "collectedAt",id LIMIT $2', [options.since ?? null, this.policy.maxArticles + 1]);
      if (seeds.length > this.policy.maxArticles) throw new Error("CLUSTER_BATCH_TOO_LARGE");
      if (!seeds.length) return [];
      const seedIds = seeds.map((item) => item.id); const window = Math.ceil(Math.max(this.policy.defaultWindowHours, ...Object.values(this.policy.windows)));
      const nearby = await tx.query<{ id: string }>(`SELECT DISTINCT a.id FROM "Article" a
        WHERE a.id=ANY($1::uuid[]) OR EXISTS(SELECT 1 FROM "Article" s WHERE s.id=ANY($1::uuid[]) AND
          ((a."sourceUrl"=s."canonicalUrl" OR a."canonicalUrl"=s."sourceUrl") OR
          (abs(extract(epoch FROM(a."publishedAt"-s."publishedAt")))<=($2::int*3600) AND
            (lower(regexp_replace(a."titleOriginal",'[^[:alnum:]]','','g'))=lower(regexp_replace(s."titleOriginal",'[^[:alnum:]]','','g')) OR
              EXISTS(SELECT 1 FROM "ArticleEntity" x JOIN "ArticleEntity" y ON y."articleId"=s.id WHERE x."articleId"=a.id AND
                (x."clubId"=y."clubId" OR x."playerId"=y."playerId" OR x."matchId"=y."matchId"))))))
        ORDER BY a.id LIMIT $3`, [seedIds, window, this.policy.maxArticles + 1]);
      const expanded = await tx.query<{ id: string }>('SELECT id FROM "Article" WHERE id=ANY($1::uuid[]) OR "clusterId" IN (SELECT "clusterId" FROM "Article" WHERE id=ANY($1::uuid[])) ORDER BY id LIMIT $2', [nearby.map((item) => item.id), this.policy.maxArticles + 1]);
      const state = await loadClusterState(tx, expanded.map((item) => item.id), [], now, this.policy);
      const pinned = new Set(state.clusters.filter((cluster) => cluster.manualOverrideAt || cluster.publishedReferenced || state.members.some((member) => member.clusterId === cluster.id && (member.input.article.manualOverrideAt || member.input.article.publicationStatus !== "DRAFT"))).map((cluster) => cluster.id));
      const auto = state.members.filter((member) => !pinned.has(member.clusterId ?? "") && !member.input.article.manualOverrideAt && member.input.article.publicationStatus === "DRAFT");
      const groups = partitionStories(auto, this.policy); const used = new Set<string>();
      const plan = groups.map((members) => {
        const existingIds = [...new Set(members.flatMap((member) => member.clusterId && !used.has(member.clusterId) ? [member.clusterId] : []))].sort();
        const id = existingIds[0] ?? randomUUID(); used.add(id);
        return { id, members, existing: state.clusters.find((cluster) => cluster.id === id) };
      });
      for (const cluster of state.clusters) if (!used.has(cluster.id)) plan.push({ id: cluster.id, members: pinned.has(cluster.id) ? state.members.filter((member) => member.clusterId === cluster.id) : [], existing: cluster });
      return assign(tx, plan, this.policy);
    });
  }
  /** Refresh permissions/reliability for one existing cluster before future feed use. */
  async current(clusterId: string, now = new Date()) {
    uuid(clusterId);
    return this.db.transaction(async (tx) => {
      await locked(tx);
      const ids = await tx.query<{ id: string }>('SELECT id FROM "Article" WHERE "clusterId"=$1::uuid ORDER BY id', [clusterId]);
      const state = await loadClusterState(tx, ids.map((item) => item.id), [clusterId], now, this.policy);
      if (!state.clusters.length) return null;
      const [result] = await assign(tx, [{ id: clusterId, members: state.members, existing: state.clusters[0] }], this.policy);
      return { ...result, candidate: publicStoryCandidate(clusterId, result.snapshot) };
    });
  }

  private async admin(tx: SqlExecutor, actorId: string, reason: string) {
    uuid(actorId); if (reason.trim().length < 5 || reason.length > 1000) throw new Error("EDITORIAL_REASON_REQUIRED");
    const actor = await tx.query('SELECT id FROM "User" WHERE id=$1::uuid AND role=\'ADMIN\' FOR SHARE', [actorId]);
    if (!actor.length) throw new Error("ADMIN_REQUIRED");
  }
  private async audit(tx: SqlExecutor, actorId: string, action: string, targetId: string, reason: string, before: unknown, after: unknown) {
    const id = randomUUID();
    await tx.query('INSERT INTO "AdminAuditLog" (id,"actorId",action,"targetType","targetId",reason,before,after) VALUES ($1::uuid,$2::uuid,$3,\'ArticleCluster\',$4,$5,$6::jsonb,$7::jsonb)', [id, actorId, action, targetId, reason, JSON.stringify(before), JSON.stringify(after)]);
    return id;
  }
  private async manualState(tx: SqlExecutor, clusterIds: string[], now: Date) {
    clusterIds.forEach(uuid);
    const ids = await tx.query<{ id: string }>('SELECT id FROM "Article" WHERE "clusterId"=ANY($1::uuid[]) ORDER BY id', [clusterIds]);
    const state = await loadClusterState(tx, ids.map((item) => item.id), clusterIds, now, this.policy);
    if (state.clusters.length !== new Set(clusterIds).size || state.clusters.some((cluster) => cluster.publishedReferenced) || state.members.some((member) => member.input.article.publicationStatus === "PUBLISHED")) throw new Error("CLUSTER_MISSING_OR_PUBLISHED");
    return state;
  }
  private auditState(state: State) {
    return { clusters: state.clusters, membership: state.members.map((member) => ({ articleId: member.input.article.id, clusterId: member.clusterId })).sort((a, b) => a.articleId.localeCompare(b.articleId)) };
  }
  async merge(clusterIds: string[], targetId: string, actorId: string, reason: string, now = new Date()) {
    if (new Set(clusterIds).size < 2 || !clusterIds.includes(targetId)) throw new Error("INVALID_MERGE");
    return this.db.transaction(async (tx) => {
      await locked(tx); await this.admin(tx, actorId, reason);
      const state = await this.manualState(tx, [...new Set(clusterIds)], now); const before = this.auditState(state);
      await tx.query('UPDATE "ArticleCluster" SET "manualOverrideAt"=$2::timestamptz WHERE id=ANY($1::uuid[])', [clusterIds, now]);
      const plan = state.clusters.map((cluster) => ({ id: cluster.id, members: cluster.id === targetId ? state.members : [], existing: { ...cluster, manualOverrideAt: now.toISOString(), representativeArticleId: null } }));
      await assign(tx, plan, this.policy);
      const afterState = await this.manualState(tx, clusterIds, now);
      const auditId = await this.audit(tx, actorId, "CLUSTER_MERGE", targetId, reason, before, this.auditState(afterState));
      return { auditId, targetId };
    });
  }
  async split(clusterId: string, articleIds: string[], actorId: string, reason: string, now = new Date()) {
    articleIds.forEach(uuid);
    return this.db.transaction(async (tx) => {
      await locked(tx); await this.admin(tx, actorId, reason);
      const state = await this.manualState(tx, [clusterId], now); const before = this.auditState(state);
      const chosen = new Set(articleIds);
      if (!chosen.size || chosen.size >= state.members.length || articleIds.some((id) => !state.members.some((member) => member.input.article.id === id))) throw new Error("INVALID_SPLIT");
      const newId = randomUUID();
      await tx.query('INSERT INTO "ArticleCluster" (id,"manualOverrideAt","updatedAt") VALUES ($1::uuid,$2::timestamptz,now())', [newId, now]);
      await tx.query('UPDATE "ArticleCluster" SET "manualOverrideAt"=$2::timestamptz WHERE id=$1::uuid', [clusterId, now]);
      await assign(tx, [{ id: clusterId, members: state.members.filter((member) => !chosen.has(member.input.article.id)), existing: { ...state.clusters[0], manualOverrideAt: now.toISOString(), representativeArticleId: null } }, { id: newId, members: state.members.filter((member) => chosen.has(member.input.article.id)) }], this.policy);
      const after = this.auditState(await this.manualState(tx, [clusterId, newId], now));
      return { clusterId: newId, auditId: await this.audit(tx, actorId, "CLUSTER_SPLIT", clusterId, reason, before, after) };
    });
  }
  async undoMerge(auditId: string, actorId: string, reason: string, now = new Date()) {
    uuid(auditId);
    return this.db.transaction(async (tx) => {
      await locked(tx); await this.admin(tx, actorId, reason);
      const logs = await tx.query<{ before: ReturnType<StoryClusteringService["auditState"]>; after: ReturnType<StoryClusteringService["auditState"]> }>('SELECT before,after FROM "AdminAuditLog" WHERE id=$1::uuid AND action=\'CLUSTER_MERGE\' AND "targetType"=\'ArticleCluster\'', [auditId]);
      if (!logs.length) throw new Error("MERGE_AUDIT_NOT_FOUND");
      const log = logs[0]; const clusterIds = log.after.clusters.map((cluster) => cluster.id);
      const state = await this.manualState(tx, clusterIds, now);
      if (hash(this.auditState(state)) !== hash(log.after)) throw new Error("MERGE_CHANGED_SINCE_AUDIT");
      const plan = log.before.clusters.map((cluster) => ({ id: cluster.id, members: state.members.filter((member) => log.before.membership.some((link) => link.articleId === member.input.article.id && link.clusterId === cluster.id)), existing: { ...cluster, manualOverrideAt: now.toISOString() } }));
      for (const cluster of log.before.clusters) await tx.query('UPDATE "ArticleCluster" SET "manualOverrideAt"=$2::timestamptz,"manualDisputed"=$3,featured=$4 WHERE id=$1::uuid', [cluster.id, now, cluster.manualDisputed, cluster.featured]);
      await assign(tx, plan, this.policy);
      return { auditId: await this.audit(tx, actorId, "CLUSTER_UNMERGE", auditId, reason, this.auditState(state), this.auditState(await this.manualState(tx, clusterIds, now))) };
    });
  }
  async override(clusterId: string, changes: { representativeArticleId?: string; featured?: boolean; disputed?: boolean }, actorId: string, reason: string, now = new Date()) {
    return this.db.transaction(async (tx) => {
      await locked(tx); await this.admin(tx, actorId, reason);
      const state = await this.manualState(tx, [clusterId], now); const cluster = state.clusters[0]; const before = this.auditState(state);
      const member = changes.representativeArticleId ? state.members.find((item) => item.input.article.id === changes.representativeArticleId && item.reliability.publishability.eligible) : null;
      if (changes.representativeArticleId && !member) throw new Error("UNGROUNDED_CANONICAL_OVERRIDE");
      const existing = { ...cluster, manualOverrideAt: now.toISOString(), featured: changes.featured ?? cluster.featured, manualDisputed: changes.disputed ?? cluster.manualDisputed, ...(member ? { representativeArticleId: member.input.article.id, headline: member.input.article.titleVi, summary: member.input.article.summaryVi } : {}) };
      await tx.query('UPDATE "ArticleCluster" SET "manualOverrideAt"=$2::timestamptz,featured=$3,"manualDisputed"=$4 WHERE id=$1::uuid', [clusterId, now, existing.featured, existing.manualDisputed]);
      await assign(tx, [{ id: clusterId, members: state.members, existing }], this.policy);
      return { auditId: await this.audit(tx, actorId, "CLUSTER_OVERRIDE", clusterId, reason, before, this.auditState(await this.manualState(tx, [clusterId], now))) };
    });
  }
}
