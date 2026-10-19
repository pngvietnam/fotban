import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { AdminError, type AdminCommand } from "../lib/admin-policy";
import type { SqlExecutor } from "../lib/sync-database";
import { AIProcessingStore, eligible, makeInput } from "./ai-store";
import { RuleBasedFallbackProvider } from "../providers/ai/fallback";
import { validateAIResult } from "../providers/ai/validation";
import { aiResultSchema, versions } from "../providers/ai/schema";
import { resolveEntities } from "../providers/ai/rules";
import { adminAudit, scopedDatabase } from "./admin-access";
import { loadReliabilityInput } from "./reliability-service";
import { ReliabilityEngine } from "./reliability-engine";
import { StoryClusteringService } from "./story-clustering";
import { transferMember, TransferTrackingService } from "./transfer-service";
import { confirmationEvidenceIds, transferStatusFor } from "./transfer-evidence";

type Command<A extends AdminCommand["action"]> = Extract<AdminCommand, { action: A }>;
export async function editArticle(tx: SqlExecutor, actorId: string, command: Command<"ARTICLE_EDIT">, now: Date) {
  const store = new AIProcessingStore(scopedDatabase(tx)); const article = await store.article(command.id, tx);
  if (!article) throw new AdminError("NOT_FOUND", 404);
  if (eligible({ ...article, manualOverrideAt: null, publicationStatus: "DRAFT" })) throw new AdminError("PERMISSION_BLOCKED");
  const catalog = await store.catalog(); const matched = resolveEntities(`${article.titleOriginal}\n${article.excerptOriginal}`, catalog);
  const input = makeInput(article,catalog.filter((entity) => matched.some((m) => m.id===entity.id && m.kind===entity.kind)));
  const [prior] = await tx.query<{ id: string; output: unknown }>('SELECT id,output FROM "AIProcessingRun" WHERE "articleId"=$1::uuid ORDER BY "createdAt" DESC,id DESC LIMIT 1', [command.id]);
  const parsed = aiResultSchema.safeParse(prior?.output);
  let baseline = parsed.success ? parsed.data : await new RuleBasedFallbackProvider().process(input);
  try { baseline = validateAIResult(baseline,input); } catch { baseline = await new RuleBasedFallbackProvider().process(input); }
  const data = command.data;
  const draft = { ...baseline, titleVi:data.titleVi, summaryVi:data.summaryVi, storyType:data.storyType, warnings:["EDITORIAL_REVIEW"], publishable:false, evidence:[{field:"titleVi",sourceText:data.titleSourceText},{field:"summaryVi",sourceText:data.summarySourceText}], ...(data.storyType!=="TRANSFER"?{transfer:null}:{}), ...(data.storyType!=="INJURY"?{injury:null}:{}) };
  if (data.transfer) {
    if (data.storyType!=="TRANSFER") throw new AdminError("INVALID_INPUT");
    const [proof] = await tx.query<{ excerpt: string }>('SELECT excerpt FROM "ClaimEvidence" WHERE id=$1::uuid AND "articleId"=$2::uuid AND "sourceArticleId"=$2::uuid', [data.transfer.evidenceId,command.id]);
    if (!proof?.excerpt || !`${input.title}\n${input.excerpt}`.includes(proof.excerpt)) throw new AdminError("EVIDENCE_REQUIRED");
    const role = (id: string | null, kind:"club"|"player") => {
      if (!id) return null; const entity = input.entities.find((e) => e.id===id && e.kind===kind);
      const alias = entity && [entity.name,...entity.aliases].find((name) => name && proof.excerpt.toLowerCase().includes(name.toLowerCase()));
      if (!alias) throw new AdminError("EVIDENCE_REQUIRED");
      const at = proof.excerpt.toLowerCase().indexOf(alias.toLowerCase()); return {value:proof.excerpt.slice(at,at+alias.length),sourceText:proof.excerpt};
    };
    draft.transfer = {status:data.transfer.status,evidenceLevel:"SOURCE_REPORTED",sourceText:proof.excerpt,player:role(data.transfer.playerId,"player"),currentClub:role(data.transfer.currentClubId,"club"),targetClub:role(data.transfer.targetClubId,"club")};
  }
  let output;
  try { output = validateAIResult(draft,input); } catch { throw new AdminError("EVIDENCE_REQUIRED"); }
  const [before] = await tx.query('SELECT "titleVi","summaryVi","storyType","publicationStatus","processingStatus","approvalAuditId" FROM "Article" WHERE id=$1::uuid', [command.id]);
  const runId = randomUUID(); const hash = createHash("sha256").update(JSON.stringify({ input,output,runId })).digest("hex");
  await tx.query('INSERT INTO "AIProcessingRun" (id,"articleId",provider,model,"promptVersion","schemaVersion","outputVersion","inputHash","inputSnapshot",output,"validationOutcome",status,"createdAt","updatedAt") VALUES ($1::uuid,$2::uuid,\'EDITORIAL\',\'human-review\',\'editorial-v1\',$3,$4,$5,$6::jsonb,$7::jsonb,\'{"valid":true,"reviewRequired":true}\'::jsonb,\'NEEDS_REVIEW\',$8::timestamptz,$8::timestamptz)', [runId,command.id,versions.schema,versions.output,hash,JSON.stringify({input,provenance:{sourceId:article.sourceId,sourceUrl:article.sourceUrl,previousRunId:prior?.id??null}}),JSON.stringify(output),now]);
  await tx.query('UPDATE "Article" SET "titleVi"=$2,"summaryVi"=$3,"storyType"=$4::"StoryType","processingStatus"=\'NEEDS_REVIEW\',"publicationStatus"=\'DRAFT\',"approvalAuditId"=NULL,"manualOverrideAt"=$5::timestamptz,"updatedAt"=$5::timestamptz WHERE id=$1::uuid', [command.id,output.titleVi,output.summaryVi,output.storyType,now]);
  for (const evidence of output.evidence) await tx.query('INSERT INTO "ClaimEvidence" (id,"articleId",claim,"sourceArticleId",locator,excerpt,"fieldPath","updatedAt") VALUES ($1::uuid,$2::uuid,$3,$2::uuid,$4,$5,$6,$7::timestamptz)', [randomUUID(),command.id,output[evidence.field],`AIProcessingRun:${runId}:${evidence.field}`,evidence.sourceText,evidence.field,now]);
  await new StoryClusteringService(scopedDatabase(tx)).refreshArticle(command.id,now);
  return { runId, auditId:await adminAudit(tx,actorId,"ARTICLE_EDIT","Article",command.id,command.reason,before,{runId,titleVi:output.titleVi,summaryVi:output.summaryVi,storyType:output.storyType}) };
}

export async function reviewEvidence(tx: SqlExecutor, actorId: string, command: Command<"EVIDENCE_REVIEW">, now: Date) {
  const input = await loadReliabilityInput(tx,command.id); if (!input) throw new AdminError("NOT_FOUND",404);
  if (!input.article.permissionAllowed || !input.source.enabled || input.source.permissionStatus!=="ALLOWED") throw new AdminError("PERMISSION_BLOCKED");
  const chosen = input.evidence.filter((item) => command.data.evidenceIds.includes(item.id));
  if (chosen.length!==new Set(command.data.evidenceIds).size) throw new AdminError("EVIDENCE_REQUIRED");
  if (command.data.kind==="OFFICIAL_STATEMENT" && (!input.source.official || input.source.type!=="OFFICIAL" || input.source.sourceTier!=="TIER_0_OFFICIAL" || !command.data.authorityScope || !input.source.authorityScopes.includes(command.data.authorityScope) || !input.article.entityScopes.includes(command.data.authorityScope))) throw new AdminError("EVIDENCE_REQUIRED");
  const sourceText = `${input.article.titleOriginal}\n${input.article.excerptOriginal??""}`;
  for (const item of chosen) {
    if (item.sourceArticleId!==command.id || !item.excerpt || !sourceText.includes(item.excerpt) || !item.locator) throw new AdminError("EVIDENCE_REQUIRED");
    await tx.query('UPDATE "ClaimEvidence" SET kind=$2::"EvidenceKind","authorityScope"=$3,"claimKey"=COALESCE("claimKey",$4),"lineageKey"=$5,"reviewedBy"=$6,"reviewedAt"=$7::timestamptz,"updatedAt"=$7::timestamptz WHERE id=$1::uuid', [item.id,command.data.kind,command.data.kind==="OFFICIAL_STATEMENT"?command.data.authorityScope:null,`article:${command.id}`,command.data.lineageKey,actorId,now]);
  }
  await tx.query('UPDATE "Article" SET "approvalAuditId"=NULL,"manualOverrideAt"=$2::timestamptz,"publicationStatus"=\'DRAFT\',"processingStatus"=\'NEEDS_REVIEW\',"updatedAt"=$2::timestamptz WHERE id=$1::uuid', [command.id,now]);
  await new StoryClusteringService(scopedDatabase(tx)).refreshArticle(command.id,now);
  const prior=chosen.map(({id,kind,authorityScope,lineageKey,reviewedBy,reviewedAt})=>({id,kind,authorityScope,lineageKey,reviewedBy,reviewedAt}));
  return { auditId:await adminAudit(tx,actorId,command.action,"Article",command.id,command.reason,{evidence:prior},{evidenceIds:command.data.evidenceIds,kind:command.data.kind,lineageKey:command.data.lineageKey,authorityScope:command.data.authorityScope}) };
}

export async function decideArticle(tx: SqlExecutor, actorId: string, command: AdminCommand, now: Date) {
  const input = await loadReliabilityInput(tx,command.id); if (!input) throw new AdminError("NOT_FOUND",404);
  const [before] = await tx.query('SELECT "titleVi","summaryVi","storyType","processingStatus","publicationStatus","approvalAuditId" FROM "Article" WHERE id=$1::uuid FOR UPDATE', [command.id]);
  let after: Record<string,unknown>;
  if (command.action==="ARTICLE_APPROVE") {
    const assessed = new ReliabilityEngine().assess({...input,article:{...input.article,manualOverrideAt:null,publicationStatus:"DRAFT"}},now);
    if (!assessed.publishability.eligible || assessed.disputed) throw new AdminError("EVIDENCE_REQUIRED");
    after = {runId:input.processing.id,titleVi:input.article.titleVi,summaryVi:input.article.summaryVi,storyType:input.article.storyType,reliability:assessed.label,certainty:assessed.certainty,status:"PUBLISHED"};
    const auditId = await adminAudit(tx,actorId,command.action,"Article",command.id,command.reason,before,after);
    await tx.query('UPDATE "Article" SET "publicationStatus"=\'PUBLISHED\',"processingStatus"=\'READY\',"approvalAuditId"=$2::uuid,"manualOverrideAt"=$3::timestamptz,"reliabilityClass"=$4::"ReliabilityClass","reliabilityScore"=$5::integer,"updatedAt"=$3::timestamptz WHERE id=$1::uuid', [command.id,auditId,now,assessed.label,assessed.source.score]);
    const cluster = await new StoryClusteringService(scopedDatabase(tx)).refreshArticle(command.id,now);
    if (input.article.storyType==="TRANSFER") await new TransferTrackingService(scopedDatabase(tx)).sync(now,cluster.clusterId);
    return {auditId};
  }
  const rejected = command.action==="ARTICLE_REJECT";
  after = {status:rejected?"HIDDEN":"DRAFT",processingStatus:"NEEDS_REVIEW"};
  await tx.query('UPDATE "Article" SET "publicationStatus"=$2::"PublicationStatus","processingStatus"=\'NEEDS_REVIEW\',"approvalAuditId"=NULL,"manualOverrideAt"=$3::timestamptz,"updatedAt"=$3::timestamptz WHERE id=$1::uuid', [command.id,after.status,now]);
  await new StoryClusteringService(scopedDatabase(tx)).refreshArticle(command.id,now);
  return {auditId:await adminAudit(tx,actorId,command.action,"Article",command.id,command.reason,before,after)};
}

export async function reviewTransfer(tx: SqlExecutor, actorId: string, command: Command<"TRANSFER_REVIEW">, now: Date) {
  const [transfer] = await tx.query<{ playerId:string;currentClubId:string|null;targetClubId:string|null;status:string }>('SELECT "playerId","currentClubId","targetClubId",status FROM "Transfer" WHERE id=$1::uuid FOR UPDATE', [command.id]);
  const [proof] = await tx.query<{articleId:string}>('SELECT "articleId" FROM "ClaimEvidence" WHERE id=$1::uuid', [command.data.evidenceId]);
  const member = proof?.articleId?await transferMember(tx,proof.articleId,now):null;
  if (!transfer || !member || !member.reliability.publishability.eligible || !member.reliability.explanation.evidenceIds.includes(command.data.evidenceId) || member.transferPair.player!==transfer.playerId || member.transferPair.currentClub!==transfer.currentClubId || member.transferPair.targetClub!==transfer.targetClubId || transferStatusFor(member)!==command.data.status || command.data.status==="CONFIRMED" && !confirmationEvidenceIds(member).includes(command.data.evidenceId)) throw new AdminError("EVIDENCE_REQUIRED");
  const result = await new TransferTrackingService(scopedDatabase(tx)).sync(now,member.clusterId ?? undefined);
  const [after] = await tx.query<{status:string}>('SELECT status FROM "Transfer" WHERE id=$1::uuid', [command.id]);
  if (after?.status!==command.data.status) throw new AdminError("CONFLICT",409);
  return {auditId:await adminAudit(tx,actorId,command.action,"Transfer",command.id,command.reason,transfer,{evidenceId:command.data.evidenceId,status:command.data.status}),processed:result.created};
}

export const editorialId = (value: unknown) => z.uuid().parse(value);
