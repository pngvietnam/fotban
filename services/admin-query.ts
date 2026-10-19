import { z } from "zod";
import { AdminError, adminErrorCodes, adminListSchema, safeAdminText, type AdminFilters, type AdminSection } from "../lib/admin-policy";
import type { SyncDatabase } from "../lib/sync-database";
import type { SessionResolver } from "./following";
import { requireAdmin } from "./admin-access";
import { loadReliabilityInput } from "./reliability-service";
import { ReliabilityEngine } from "./reliability-engine";
import { BriefQueryService } from "./brief-query";
import { transferSnapshotSchema } from "../types/transfers";
import { aiResultSchema, storyTypes } from "../providers/ai/schema";
import { AIProcessingStore } from "./ai-store";
import { resolveEntities } from "../providers/ai/rules";

export type AdminRow = Record<string, unknown> & { id: string };
export type AdminList = { section: AdminSection; rows: AdminRow[]; page: number; hasNext: boolean; filters: AdminFilters; competitions: { id: string; name: string }[] };
const clean = <T>(value: unknown): T => JSON.parse(JSON.stringify(value), (_key, item) => typeof item === "string" ? safeAdminText(item) : item) as T;
const statuses: Record<AdminSection, string[]> = { sources: ["UNREVIEWED", "ALLOWED", "RESTRICTED"], videos: ["true", "false"], stories: ["PENDING", "PROCESSING", "NEEDS_REVIEW", "READY", "FAILED", "PUBLISHED", "HIDDEN", "DISPUTED"], transfers: ["CONFIRMED", "NEGOTIATION", "INTEREST", "RUMOR"], briefs: ["DRAFT", "VALIDATING", "READY", "PUBLISHED", "FAILED", "NEEDS_REVIEW"], jobs: ["PENDING", "RUNNING", "SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED", "SKIPPED"] };
export class AdminQueryService {
  constructor(private db: SyncDatabase, private session: SessionResolver) {}
  async overview() {
    await requireAdmin(this.db, this.session);
    const [counts] = await this.db.query<{ review: number; restricted: number; videos: number }>(`SELECT (SELECT count(*)::integer FROM "Article" WHERE "publicationStatus"<>'HIDDEN' AND ("processingStatus"<>'READY' OR "publicationStatus"='DRAFT')) AS review,(SELECT count(*)::integer FROM "NewsSource" WHERE NOT enabled OR "permissionStatus"<>'ALLOWED') AS restricted,(SELECT count(*)::integer FROM "VideoSource" WHERE enabled AND verified) AS videos`);
    const jobs = clean<AdminRow[]>(await this.db.query(`SELECT id,"jobName",status,"logicalDate","startedAt","finishedAt","recordsProcessed" FROM "JobRun" WHERE status IN ('FAILED','PARTIAL','SUCCEEDED') ORDER BY COALESCE("finishedAt","createdAt") DESC,id LIMIT 8`));
    const briefs = clean<AdminRow[]>(await this.db.query(`SELECT r.id,b.date,r.revision,r.status,r."generatedAt",r."publishedAt" FROM "BriefRevision" r JOIN "DailyBrief" b ON b.id=r."briefId" ORDER BY b.date DESC,r.revision DESC LIMIT 1`));
    const providers = clean<AdminRow[]>(await this.db.query('SELECT id,provider,health,enabled,"lastSuccessAt","lastFailureAt","recordsProcessed" FROM "ProviderStatus" ORDER BY provider LIMIT 30'));
    const scheduler=clean<AdminRow[]>(await this.db.query('SELECT DISTINCT ON (status) id,status,"finishedAt","logicalDate" FROM "JobRun" WHERE "jobName"=\'scheduler:morning-attempt\' AND status IN (\'SUCCEEDED\',\'PARTIAL\',\'FAILED\') ORDER BY status,"finishedAt" DESC,id DESC'));
    return { counts, jobs, briefs, providers, scheduler };
  }
  async list(section: AdminSection, input: unknown): Promise<AdminList> {
    await requireAdmin(this.db, this.session);
    const normalized = input && typeof input === "object" && !Array.isArray(input) ? Object.fromEntries(Object.entries(input).filter(([,v])=>v!=="" && v!==undefined)) : input;
    const parsed = adminListSchema.safeParse(normalized); if (!parsed.success) throw new AdminError("INVALID_INPUT");
    const f = parsed.data; if (f.status && !statuses[section].includes(f.status)) throw new AdminError("INVALID_INPUT");
    if (f.type && (section === "stories" ? !storyTypes.includes(f.type as typeof storyTypes[number]) : section === "videos" ? f.type!=="MAPPINGS" : section!=="jobs")) throw new AdminError("INVALID_INPUT");
    if (f.tier && !["TIER_0_OFFICIAL","TIER_1_HIGH","TIER_2_ESTABLISHED","TIER_3_UNVERIFIED","COMMUNITY"].includes(f.tier)) throw new AdminError("INVALID_INPUT");
    const params: unknown[] = []; const where: string[] = [];
    const add = (expression: string, value: unknown) => { params.push(value); where.push(expression.replaceAll("?", `$${params.length}`)); };
    let select = ""; let from = ""; let order = "";
    if (section === "sources") {
      select = 's.id,s.name,s.domain,s.type,s.language,s.country,s.official,s."sourceTier",s."reliabilityScore",s.rationale,s.enabled,s."termsReviewed",s."ingestionAllowed",s."permissionStatus",s."accessPolicy",s."permissionReference",s."commercialReuseAllowed",s."requiresReusableLicense",s."maxExcerptChars",s."ingestionMethod",s."authorityScopes",s."permissionScope",s."feedUrl",s."attributionRequirement",s."lastTermsReviewAt",s."newsPriority",s."ingestionNotes",s."reviewedAt",s.reviewer,s."updatedAt"'; from = '"NewsSource" s'; order = 's.name,s.id';
      if (f.q) add("(strpos(lower(s.name),lower(?))>0 OR strpos(lower(s.domain),lower(?))>0)", f.q);
      if (f.status) add('s."permissionStatus"::text=?', f.status);
      if (f.enabled) add('s.enabled=?::boolean', f.enabled === "true");
      if (f.tier) add('s."sourceTier"::text=?', f.tier);
    } else if (section === "videos" && f.type === "MAPPINGS") {
      select = 'm.id,m."videoSourceId",m."competitionId",m.season,m.market,m.language,m."rightsType",m.priority,m."validFrom",m."validTo",m.enabled,m."evidenceUrl",s.name,l.name AS "competitionName",m."updatedAt"'; from = '"VideoSourceCompetition" m JOIN "VideoSource" s ON s.id=m."videoSourceId" JOIN "League" l ON l.id=m."competitionId"'; order = 'm."validFrom" DESC,m.id';
      if (f.q) add('strpos(lower(s.name),lower(?))>0', f.q);
      if (f.league) add('l.slug=?', f.league);
      if (f.enabled) add('m.enabled=?::boolean', f.enabled === "true");
    } else if (section === "videos") {
      select = 'v.id,v.platform,v."channelId",v."channelHandle",v.name,v.country,v.language,v.verified,v.enabled,v.priority,v."sourceType",v.notes,v."lastVerifiedAt",v."reviewReference",v."updatedAt"'; from = '"VideoSource" v'; order = 'v.priority,v.name,v.id';
      if (f.q) add('(strpos(lower(v.name),lower(?))>0 OR strpos(lower(v."channelHandle"),lower(?))>0)', f.q);
      if (f.enabled) add('v.enabled=?::boolean', f.enabled === "true");
    } else if (section === "stories") {
      select = 'a.id,a.slug,a."titleVi",a."summaryVi",a."titleOriginal",a."excerptOriginal",a."sourceUrl",a.language,a."storyType",a."processingStatus",a."publicationStatus",a."publishedAt",a."updatedAt",a."clusterId",c.featured,c."manualDisputed",s.name AS "sourceName",s."permissionStatus",s."sourceTier"';
      from = '"Article" a JOIN "NewsSource" s ON s.id=a."sourceId" LEFT JOIN "ArticleCluster" c ON c.id=a."clusterId"'; order = 'a."updatedAt" DESC,a.id';
      if (f.q) add('(strpos(lower(COALESCE(a."titleVi",\'\')),lower(?))>0 OR strpos(lower(a."titleOriginal"),lower(?))>0)', f.q);
      if (f.status === "DISPUTED") where.push('(c."manualDisputed" OR c."hasConflict")');
      else if (f.status) add(['PUBLISHED', 'HIDDEN'].includes(f.status) ? 'a."publicationStatus"::text=?' : 'a."processingStatus"::text=?', f.status);
      if (f.type) add('a."storyType"::text=?', f.type);
      if (f.reliability) add('a."reliabilityClass"::text=?', f.reliability);
      if (f.certainty) add('(SELECT r.result->>\'certainty\' FROM "ReliabilityAssessment" r WHERE r."articleId"=a.id ORDER BY r."createdAt" DESC,r.id DESC LIMIT 1)=?', f.certainty);
      if (f.league) add('EXISTS(SELECT 1 FROM "ArticleEntity" e JOIN "League" l ON l.id=e."leagueId" WHERE e."articleId"=a.id AND l.slug=?)', f.league);
    } else if (section === "transfers") {
      select = 't.id,t."playerId",t."currentClubId",t."targetClubId",t.status,t.summary,t."updatedAt",p.name AS "playerName",c.name AS "currentClub",d.name AS "targetClub"'; from = '"Transfer" t JOIN "Player" p ON p.id=t."playerId" LEFT JOIN "Club" c ON c.id=t."currentClubId" LEFT JOIN "Club" d ON d.id=t."targetClubId"'; order = 't."updatedAt" DESC,t.id';
      if (f.q) add('(strpos(lower(p.name),lower(?))>0 OR strpos(lower(COALESCE(c.name,\'\')),lower(?))>0 OR strpos(lower(COALESCE(d.name,\'\')),lower(?))>0)', f.q);
      if (f.status) add('t.status::text=?', f.status);
      if (f.league) add('EXISTS(SELECT 1 FROM "TransferUpdate" u JOIN "Article" a ON a."clusterId"=u."clusterId" JOIN "ArticleEntity" e ON e."articleId"=a.id JOIN "League" l ON l.id=e."leagueId" WHERE u."transferId"=t.id AND l.slug=?)', f.league);
    } else if (section === "briefs") {
      select = 'r.id,r."briefId",b.date,r.revision,r.status,r."generatedAt",r."publishedAt",r."publishedById",u."displayName" AS "publisherName"'; from = '"BriefRevision" r JOIN "DailyBrief" b ON b.id=r."briefId" LEFT JOIN "User" u ON u.id=r."publishedById"'; order = 'b.date DESC,r.revision DESC';
      if (f.status) add('r.status::text=?', f.status);
      if (f.date) add('b.date=?::date', f.date);
    } else {
      select = 'j.id,j."jobName",j."logicalDate",j.status,j."startedAt",j."finishedAt",j."recordsProcessed",j.attempts,CASE WHEN j."errorCode" ~ \'^[A-Z_]{1,60}$\' THEN j."errorCode" ELSE NULL END AS "errorCode"'; from = '"JobRun" j'; order = 'j."createdAt" DESC,j.id';
      if (f.status) add('j.status::text=?', f.status);
      if (f.type) add('strpos(j."jobName",?)>0', f.type);
      if (f.date) add('j."logicalDate"=?::date', f.date);
    }
    params.push(21, (f.page - 1) * 20);
    const rows = clean<AdminRow[]>(await this.db.query(`SELECT ${select} FROM ${from} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order} LIMIT $${params.length - 1}::integer OFFSET $${params.length}::integer`, params));
    if(section==="jobs") for(const row of rows) if(!adminErrorCodes.includes(String(row.errorCode))) row.errorCode=row.errorCode?"JOB_FAILED":null;
    const competitions = section === "videos" ? await this.db.query<{ id: string; name: string }>('SELECT id,name FROM "League" WHERE slug IN (\'premier-league\',\'la-liga\') ORDER BY name') : [];
    return { section, rows: rows.slice(0,20), hasNext: rows.length > 20, page: f.page, filters: f, competitions };
  }
  async detail(section: AdminSection, id: string, now = new Date()) {
    await requireAdmin(this.db, this.session); if (!z.uuid().safeParse(id).success) throw new AdminError("INVALID_INPUT");
    if (section === "briefs") return { brief: await new BriefQueryService(this.db).getRevision(id, { internal: true, now }) };
    if (section === "stories") {
      const input = await loadReliabilityInput(this.db, id); if (!input) throw new AdminError("NOT_FOUND", 404);
      const evidence = clean<AdminRow[]>(await this.db.query('SELECT id,claim,kind,stance,"sourceArticleId",excerpt,locator,"claimKey","lineageKey","authorityScope","reviewedBy","reviewedAt" FROM "ClaimEvidence" WHERE "articleId"=$1::uuid ORDER BY id LIMIT 100', [id]));
      const rawRuns = await this.db.query<AdminRow>('SELECT id,provider,model,status,"createdAt",output FROM "AIProcessingRun" WHERE "articleId"=$1::uuid ORDER BY "createdAt" DESC,id DESC LIMIT 10', [id]);
      const runs = rawRuns.map(({output,...row})=>{const parsed=aiResultSchema.safeParse(output);return {...row,...(parsed.success?{titleVi:parsed.data.titleVi,summaryVi:parsed.data.summaryVi,warnings:parsed.data.warnings,transfer:parsed.data.transfer}:{warnings:["INVALID_OUTPUT"]})};});
      const allEntities=await new AIProcessingStore(this.db).catalog();
      const matches=resolveEntities(`${input.article.titleOriginal}\n${input.article.excerptOriginal??""}`,allEntities);
      const catalog=allEntities.filter(e=>matches.some(m=>m.id===e.id&&m.kind===e.kind)).map(({id,kind,name})=>({id,kind,name}));
      const audits=await this.db.query<AdminRow>('SELECT a.id,a.action,a.reason,a."createdAt",u."displayName" AS editor FROM "AdminAuditLog" a LEFT JOIN "User" u ON u.id=a."actorId" WHERE a."targetType"=\'Article\' AND a."targetId"=$1 ORDER BY a."createdAt" DESC,a.id DESC LIMIT 20',[id]);
      const [cluster]=await this.db.query<AdminRow>('SELECT c.id,c.featured,c."manualDisputed",c."updatedAt" FROM "ArticleCluster" c JOIN "Article" a ON a."clusterId"=c.id WHERE a.id=$1::uuid',[id]);
      return clean({ input, reliability: new ReliabilityEngine().assess(input, now), evidence, runs, catalog, audits, cluster });
    }
    if (section === "transfers") {
      const updates = clean<(AdminRow & { snapshot: unknown })[]>(await this.db.query(`SELECT u.id,u.status,u.summary,u.reason,u."publishedAt",u."evidenceId",u."clusterId",u.snapshot,e."articleId",e.kind,e.excerpt,s.name AS "sourceName",s."sourceTier",a."sourceUrl" FROM "TransferUpdate" u JOIN "ClaimEvidence" e ON e.id=u."evidenceId" LEFT JOIN "Article" a ON a.id=e."articleId" LEFT JOIN "NewsSource" s ON s.id=a."sourceId" WHERE u."transferId"=$1::uuid ORDER BY u."publishedAt",u.id LIMIT 100`, [id]));
      return { updates: updates.map(({ snapshot, ...row }) => { const parsed = transferSnapshotSchema.safeParse(snapshot); return { ...row, facts: parsed.success ? parsed.data.facts : null }; }) };
    }
    return null;
  }
}
