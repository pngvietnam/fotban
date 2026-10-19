import { AdminError, adminCommandSchema, adminErrorCodes, type AdminCommand } from "../lib/admin-policy";
import { z } from "zod";
import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
import type { SessionResolver } from "./following";
import { adminAudit, requireAdmin, scopedDatabase } from "./admin-access";
import { editArticle, reviewEvidence, decideArticle, reviewTransfer } from "./admin-editorial";
import { StoryClusteringService } from "./story-clustering";
import { MorningBriefService } from "./morning-brief";
import { publisherFeedAllowed } from "../lib/publisher-feed-permission";
import { vietnameseSource } from "../providers/news/vietnamese-sources";

export type AdminRerun = (date: string) => Promise<{ status: string; workflowId?: string; code?: string }>;
const sourceCasts: Record<string,string> = {type:"SourceType",sourceTier:"SourceTier",permissionStatus:"NewsPermissionStatus",ingestionMethod:"NewsIngestionMethod",authorityScopes:"text[]"};
const cast = (key:string, value:unknown, special:Record<string,string>) => special[key] ?? (["videoSourceId","competitionId"].includes(key) ? "uuid" : key==="validFrom" || key==="validTo" || key==="lastVerifiedAt" ? "timestamptz" : typeof value==="boolean" ? "boolean" : typeof value==="number" ? "integer" : "text");
async function update(tx:SqlExecutor,table:string,id:string,data:Record<string,unknown>,special:Record<string,string>={}) {
  const entries=Object.entries(data); const params:unknown[]=[id,...entries.map(([,v])=>v)];
  await tx.query(`UPDATE "${table}" SET ${entries.map(([key,v],i)=>`"${key}"=$${i+2}::${special[key] && !["text[]","uuid","timestamptz"].includes(special[key]) ? `"${special[key]}"` : cast(key,v,special)}`).join(",")},"updatedAt"=GREATEST(clock_timestamp(),"updatedAt"+interval '1 millisecond') WHERE id=$1::uuid`,params);
}
async function row(tx:SqlExecutor,table:string,id:string) { const [value]=await tx.query<Record<string,unknown>>(`SELECT * FROM "${table}" WHERE id=$1::uuid FOR UPDATE`,[id]); if(!value) throw new AdminError("NOT_FOUND",404); return value; }
function current(before:Record<string,unknown>,command:AdminCommand) { if (command.expectedUpdatedAt && new Date(before.updatedAt instanceof Date?before.updatedAt.getTime():String(before.updatedAt)).toISOString()!==command.expectedUpdatedAt) throw new AdminError("CONFLICT",409); }
function summary(before:Record<string,unknown>,data:Record<string,unknown>) { return Object.fromEntries(Object.keys(data).map((key)=>[key,before[key]])); }

export class AdminService {
  constructor(private db:SyncDatabase,private session:SessionResolver,private rerun?:AdminRerun) {}
  async mutate(input:unknown,now=new Date()) {
    const actor=await requireAdmin(this.db,this.session); const parsed=adminCommandSchema.safeParse(input);
    if(!parsed.success) throw new AdminError("INVALID_INPUT"); const command=parsed.data;
    if(command.action==="BRIEF_PUBLISH") {
      try { const id=await new MorningBriefService(this.db).publish(command.id,now,{actorId:actor.id,reason:command.reason}); return {id}; }
      catch { throw new AdminError("EVIDENCE_REQUIRED",409); }
    }
    if(command.action==="BRIEF_GENERATE" || command.action==="WORKFLOW_RERUN") {
      // Durable intent before long work; no external work is held inside a DB transaction.
      await this.db.transaction(async(tx)=>{await requireAdmin(tx,this.session,true);await adminAudit(tx,actor.id,`${command.action}_REQUEST`,"Operation",command.id,command.reason,null,{date:command.data.date,storedOnly:true});});
      try {
        const raw=command.action==="BRIEF_GENERATE" ? await new MorningBriefService(this.db).generate({date:command.data.date},now).then((r)=>({status:r.record.status,id:r.record.id,cached:r.cached})) : this.rerun ? await this.rerun(command.data.date) : (()=>{throw new AdminError("UNAVAILABLE",503);})();
        const result=z.object({status:z.enum(["PENDING","RUNNING","SUCCEEDED","PARTIAL","FAILED","SKIPPED","READY","PUBLISHED","DRAFT","NEEDS_REVIEW"]),id:z.uuid().optional(),workflowId:z.uuid().optional(),cached:z.boolean().optional(),code:z.string().optional()}).parse(raw);
        if(result.code&&!adminErrorCodes.includes(result.code))result.code="JOB_FAILED";
        await adminAudit(this.db,actor.id,`${command.action}_RESULT`,"Operation",command.id,command.reason,null,result);
        return result;
      } catch {
        await adminAudit(this.db,actor.id,`${command.action}_FAILED`,"Operation",command.id,command.reason,null,{code:"OPERATION_FAILED"}); throw new AdminError("UNAVAILABLE",503);
      }
    }
    return this.db.transaction(async(tx)=>{
      await tx.query("SELECT 1 AS locked FROM pg_advisory_xact_lock(91531108)");
      await tx.query("SELECT 1 AS locked FROM pg_advisory_xact_lock(91531112)");
      await requireAdmin(tx,this.session,true);
      await tx.query('SELECT id FROM "NewsSource" ORDER BY id FOR SHARE');
      if(command.action==="SOURCE_UPDATE") {
        const before=await row(tx,"NewsSource",command.id); current(before,command); const d=command.data;
        if(!command.expectedUpdatedAt) throw new AdminError("INVALID_INPUT");
        if((d.enabled || d.ingestionAllowed) && (!d.termsReviewed || d.permissionStatus!=="ALLOWED" || !d.permissionReference || !d.rationale?.trim())) throw new AdminError("PERMISSION_BLOCKED");
        if(d.commercialReuseAllowed && (!d.termsReviewed || d.permissionStatus!=="ALLOWED" || !d.permissionReference)) throw new AdminError("PERMISSION_BLOCKED");
        const scopes=await tx.query<{scope:string}>(`SELECT 'club:'||id AS scope FROM "Club" WHERE 'club:'||id=ANY($1::text[]) UNION ALL SELECT 'player:'||id FROM "Player" WHERE 'player:'||id=ANY($1::text[]) UNION ALL SELECT 'league:'||id FROM "League" WHERE 'league:'||id=ANY($1::text[])`,[d.authorityScopes]);
        if(new Set(scopes.map(s=>s.scope)).size!==new Set(d.authorityScopes).size)throw new AdminError("INVALID_INPUT");
        const feedChanged = ["permissionScope","feedUrl","attributionRequirement","permissionReference","commercialReuseAllowed","permissionStatus","ingestionAllowed"].some(key => key in d && d[key as keyof typeof d] !== before[key]);
        const feedPolicy = {...before,...d,id:command.id,reviewer:actor.id,reviewedAt:now.toISOString(),lastTermsReviewAt:feedChanged ? now.toISOString() : before.lastTermsReviewAt};
        if (vietnameseSource(String(before.slug)) && (d.enabled || d.ingestionAllowed) && !publisherFeedAllowed(feedPolicy as Parameters<typeof publisherFeedAllowed>[0])) throw new AdminError("PERMISSION_BLOCKED");
        const data={...d,reviewer:actor.id,reviewedAt:now.toISOString(),...(feedChanged ? {lastTermsReviewAt:now.toISOString()} : {})};
        await update(tx,"NewsSource",command.id,data,{...sourceCasts,reviewedAt:"timestamptz",lastTermsReviewAt:"timestamptz"});
        return {auditId:await adminAudit(tx,actor.id,command.action,"NewsSource",command.id,command.reason,summary(before,data),data)};
      }
      if(command.action==="VIDEO_UPDATE") {
        const [before]=await tx.query<Record<string,unknown>>('SELECT * FROM "VideoSource" WHERE id=$1::uuid FOR UPDATE',[command.id]); const d=command.data;
        if(before) {current(before,command);if(!command.expectedUpdatedAt) throw new AdminError("INVALID_INPUT");}
        else if(command.expectedUpdatedAt) throw new AdminError("NOT_FOUND",404);
        if(d.enabled && (!d.verified || !d.channelId || !d.lastVerifiedAt || Date.parse(d.lastVerifiedAt)>now.getTime() || now.getTime()-Date.parse(d.lastVerifiedAt)>=180*86400000)) throw new AdminError("PERMISSION_BLOCKED");
        if(!before) await tx.query('INSERT INTO "VideoSource" (id,"channelHandle",name,country,language,"sourceType","reviewReference","updatedAt") VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,now())',[command.id,d.channelHandle,d.name,d.country,d.language,d.sourceType,d.reviewReference]);
        await update(tx,"VideoSource",command.id,d);
        return {auditId:await adminAudit(tx,actor.id,before?command.action:"VIDEO_CREATE","VideoSource",command.id,command.reason,before?summary(before,d):null,d)};
      }
      if(command.action==="MAPPING_SAVE") {
        const d=command.data; if(d.enabled && Date.parse(d.validTo)<=now.getTime()) throw new AdminError("PERMISSION_BLOCKED");
        const source=await row(tx,"VideoSource",d.videoSourceId);
        if(d.enabled && (!source.enabled || !source.verified)) throw new AdminError("PERMISSION_BLOCKED");
        const leagues=await tx.query('SELECT id FROM "League" WHERE id=$1::uuid AND slug IN (\'premier-league\',\'la-liga\')',[d.competitionId]); if(!leagues.length) throw new AdminError("INVALID_INPUT");
        const [before]=await tx.query<Record<string,unknown>>('SELECT * FROM "VideoSourceCompetition" WHERE id=$1::uuid FOR UPDATE',[command.id]);
        if(before) {current(before,command);if(!command.expectedUpdatedAt) throw new AdminError("INVALID_INPUT");await update(tx,"VideoSourceCompetition",command.id,d);}
        else await tx.query('INSERT INTO "VideoSourceCompetition" (id,"videoSourceId","competitionId",season,market,language,"rightsType",priority,"validFrom","validTo",enabled,"evidenceUrl","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8::integer,$9::timestamptz,$10::timestamptz,$11::boolean,$12,now())',[command.id,d.videoSourceId,d.competitionId,d.season,d.market,d.language,d.rightsType,d.priority,d.validFrom,d.validTo,d.enabled,d.evidenceUrl]);
        return {auditId:await adminAudit(tx,actor.id,command.action,"VideoSourceCompetition",command.id,command.reason,before?summary(before,d):null,d)};
      }
      if(command.action==="ARTICLE_EDIT" || command.action==="EVIDENCE_REVIEW" || ["ARTICLE_APPROVE","ARTICLE_REJECT","ARTICLE_REVIEW"].includes(command.action)) {
        const before=await row(tx,"Article",command.id); current(before,command);
        if(command.action==="ARTICLE_EDIT") return editArticle(tx,actor.id,command,now);
        if(command.action==="EVIDENCE_REVIEW") return reviewEvidence(tx,actor.id,command,now);
        return decideArticle(tx,actor.id,command,now);
      }
      const clusters=new StoryClusteringService(scopedDatabase(tx));
      if(command.action==="CLUSTER_FLAGS") {
        const before=await row(tx,"ArticleCluster",command.id); current(before,command);
        await tx.query('UPDATE "ArticleCluster" SET featured=$2,"manualDisputed"=$3,"updatedAt"=now() WHERE id=$1::uuid',[command.id,command.data.featured,command.data.disputed]);
        const [member]=await tx.query<{id:string}>('SELECT id FROM "Article" WHERE "clusterId"=$1::uuid ORDER BY id LIMIT 1',[command.id]); if(member) await clusters.refreshArticle(member.id,now);
        return {auditId:await adminAudit(tx,actor.id,command.action,"ArticleCluster",command.id,command.reason,{featured:before.featured,disputed:before.manualDisputed},command.data)};
      }
      if(command.action==="CLUSTER_MERGE") return clusters.merge(command.data.clusterIds,command.id,actor.id,command.reason,now);
      if(command.action==="CLUSTER_SPLIT") return clusters.split(command.id,command.data.articleIds,actor.id,command.reason,now);
      if(command.action==="CLUSTER_UNMERGE") return clusters.undoMerge(command.id,actor.id,command.reason,now);
      if(command.action==="TRANSFER_REVIEW") return reviewTransfer(tx,actor.id,command,now);
      throw new AdminError("INVALID_INPUT");
    });
  }
}
