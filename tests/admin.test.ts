import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { SyncDatabase } from "../lib/sync-database";
import { AdminService } from "../services/admin";
import { AdminQueryService, type AdminRow } from "../services/admin-query";
import { requireAdmin } from "../services/admin-access";
import { adminGuard, adminRequest } from "../services/admin-http";
import { bootstrapAdmin } from "../services/admin-bootstrap";
import { sourceEditSchema, videoEditSchema, mappingEditSchema, adminUrl } from "../lib/admin-policy";
import { loadReliabilityInput } from "../services/reliability-service";
import { ReliabilityEngine } from "../services/reliability-engine";
import { MorningBriefService } from "../services/morning-brief";
import { TransferTrackingService } from "../services/transfer-service";
import { ScheduledJobRunner } from "../services/scheduler";
import { SchedulerStore } from "../services/scheduler-store";
import { morningPlan } from "../lib/scheduler-policy";
import { scheduledJobs, type SchedulerHandlers, type SchedulerLock } from "../types/scheduler";
import { transferDatabase, resetTransferDatabase, seedTransferArticle, transferIds } from "./fixtures/transfer-store";
import { seedBriefNews } from "./fixtures/brief-news";
import { briefNow } from "./fixtures/briefs";
import { vidId, videoSource, videoMapping } from "./fixtures/videos";
import type { ActiveUser } from "../services/following";
import { readPublishedStory } from "../services/news-ui-data";
import { BriefQueryService } from "../services/brief-query";
import { StoryClusteringService } from "../services/story-clustering";
import { VideoStore } from "../services/video-store";
import { NewsSyncStore } from "../services/news-store";

describe("admin authorization, editorial safety and immutable audit",()=>{
  let db:PGlite;let database:SyncDatabase;let current:ActiveUser|null;let service:AdminService;let queries:AdminQueryService;
  const admin=randomUUID(),reader=randomUUID();const session=async()=>current;
  const command=(action:string,id:string,data?:unknown)=>({action,id,reason:"Deterministic local editorial review",confirm:true,...(data?{data}:{})});
  const request=(path:string,method="GET",body?:unknown,origin="http://localhost:3000")=>new Request(`http://localhost:3000${path}`,{method,headers:{origin,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  const handle=(req:Request)=>adminRequest(req,{queries,service,appUrl:"http://localhost:3000"});
  const run=(action:string,id:string,data?:unknown)=>service.mutate(command(action,id,data),briefNow);
  beforeAll(async()=>{({db,database}=await transferDatabase());},30000);
  afterAll(async()=>{await db.close();});
  beforeEach(async()=>{
    await db.exec('TRUNCATE "User","VideoSource","DailyBrief","JobRun" CASCADE');await resetTransferDatabase(db);
    for(const [id,role] of [[admin,"ADMIN"],[reader,"USER"]]) await db.query('INSERT INTO "User" (id,"authSubject",email,"displayName",role,"updatedAt") VALUES ($1::uuid,$1::text,$2,$3,$4::"UserRole",now())',[id,`${id}@example.test`,role,role]);
    current={id:admin};service=new AdminService(database,session);queries=new AdminQueryService(database,session);
  });
  async function news(){return seedBriefNews(db,database,1,"OFF_FIELD",true);}
  async function sourceCommand(sourceId:string,patch:Record<string,unknown>={}){
    const [row]=await database.query<AdminRow>('SELECT * FROM "NewsSource" WHERE id=$1::uuid',[sourceId]);
    return {...command("SOURCE_UPDATE",sourceId,sourceEditSchema.parse({...Object.fromEntries(Object.keys(sourceEditSchema.shape).map(k=>[k,row[k]])),...patch})),expectedUpdatedAt:new Date(row.updatedAt instanceof Date?row.updatedAt.getTime():String(row.updatedAt)).toISOString()};
  }
  async function video(){const v=videoSource();await db.query('INSERT INTO "VideoSource" (id,"channelId","channelHandle",name,country,language,verified,enabled,"sourceType","lastVerifiedAt","reviewReference","updatedAt") VALUES ($1,$2,$3,$4,\'VN\',\'vi\',true,true,\'RIGHTS_HOLDER\',$5,$6,now())',[v.id,v.channelId,v.channelHandle,v.name,v.lastVerifiedAt,v.reviewReference]);return v;}
  it("anonymous and USER cannot access pages, data or mutations",async()=>{
    for(const identity of [null,{id:reader}]){current=identity;
      expect((await adminGuard(request('/admin'),()=>requireAdmin(database,session)))?.status).toBe(403);
      expect((await handle(request('/api/admin/overview'))).status).toBe(403);
      expect((await handle(request('/api/admin/action','POST',command('ARTICLE_APPROVE',randomUUID())))).status).toBe(403);
    }
  });
  it("ADMIN gets overview and private non-indexable responses",async()=>{
    expect(await adminGuard(request('/admin'),()=>requireAdmin(database,session))).toBeNull();
    const response=await handle(request('/api/admin/overview'));expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');expect(response.headers.get('x-robots-tag')).toContain('noindex');expect(await response.json()).toHaveProperty('counts.review',0);
  });
  it("database role revocation takes effect without trusting session claims",async()=>{
    await db.query('UPDATE "User" SET role=\'USER\' WHERE id=$1::uuid',[admin]);await expect(queries.overview()).rejects.toThrow('FORBIDDEN');
  });
  it("blocks cross-origin mutations and ownership/role injection",async()=>{
    expect((await handle(request('/api/admin/action','POST',command('ARTICLE_APPROVE',randomUUID()),'https://attacker.example.test'))).status).toBe(403);
    expect((await handle(request('/api/admin/action','POST',{...command('ARTICLE_APPROVE',randomUUID()),role:'ADMIN',actorId:reader}))).status).toBe(400);
  });
  it("restricted/prohibited sources cannot be enabled, even with high reliability",async()=>{
    const {sourceId}=await news();await expect(service.mutate(await sourceCommand(sourceId,{permissionStatus:'RESTRICTED',reliabilityScore:100}),briefNow)).rejects.toThrow('PERMISSION_BLOCKED');
    expect((await database.query<{permissionStatus:string}>('SELECT "permissionStatus" FROM "NewsSource" WHERE id=$1::uuid',[sourceId]))[0].permissionStatus).toBe('ALLOWED');
  });
  it("unreviewed or missing permission reference cannot enable ingestion",async()=>{
    const {sourceId}=await news();for(const patch of [{permissionStatus:'UNREVIEWED'},{permissionReference:null},{termsReviewed:false}]) await expect(service.mutate(await sourceCommand(sourceId,patch),briefNow)).rejects.toThrow('PERMISSION_BLOCKED');
  });
  it("allows reviewed permitted source changes, persists reliability and audit",async()=>{
    const {sourceId}=await news();await service.mutate(await sourceCommand(sourceId,{reliabilityScore:82,sourceTier:'TIER_2_ESTABLISHED',official:false,authorityScopes:[]}),briefNow);
    expect((await database.query('SELECT "reliabilityScore","sourceTier",reviewer FROM "NewsSource"'))[0]).toMatchObject({reliabilityScore:82,sourceTier:'TIER_2_ESTABLISHED',reviewer:admin});
    expect((await database.query('SELECT action,"actorId" FROM "AdminAuditLog"'))[0]).toMatchObject({action:'SOURCE_UPDATE',actorId:admin});
  });
  it("optimistic concurrency refuses stale source form",async()=>{
    const {sourceId}=await news();const input=await sourceCommand(sourceId);await service.mutate(input,briefNow);await expect(service.mutate(input,briefNow)).rejects.toThrow('CONFLICT');
  });
  it("video source editing persists without fetching a provider",async()=>{
    const v=await video();const [row]=await database.query<AdminRow>('SELECT * FROM "VideoSource"');const data=videoEditSchema.parse({...Object.fromEntries(Object.entries(v).filter(([k])=>!["id","platform"].includes(k))),notes:'Reviewed local fixture',priority:20});
    await service.mutate({...command('VIDEO_UPDATE',v.id,data),expectedUpdatedAt:new Date(row.updatedAt instanceof Date?row.updatedAt.getTime():String(row.updatedAt)).toISOString()},briefNow);
    expect((await database.query('SELECT priority,notes FROM "VideoSource"'))[0]).toMatchObject({priority:20,notes:'Reviewed local fixture'});
  });
  it("new whitelist entry requires validated channel identity, expired verification cannot enable",async()=>{
    const data=videoEditSchema.parse({...Object.fromEntries(Object.entries(videoSource()).filter(([k])=>!['id','platform'].includes(k))),notes:null});
    await run('VIDEO_UPDATE',randomUUID(),data);expect((await queries.list('videos',{})).rows).toHaveLength(1);
    await expect(run('VIDEO_UPDATE',randomUUID(),{...data,channelHandle:'@new-channel',lastVerifiedAt:'2020-01-01T00:00:00Z'})).rejects.toThrow('PERMISSION_BLOCKED');
  });
  it("rights windows validate, expired mapping can only be saved disabled",async()=>{
    await video();const {id:_,...mapping}=videoMapping({competitionId:transferIds.league});void _;
    const data=mappingEditSchema.parse(mapping);
    await expect(run('MAPPING_SAVE',randomUUID(),{...data,validTo:'2026-01-01T00:00:00Z'})).rejects.toThrow('INVALID_INPUT');
    const expired={...data,validFrom:'2025-08-01T00:00:00Z',validTo:'2026-07-01T00:00:00Z'};
    await expect(run('MAPPING_SAVE',randomUUID(),expired)).rejects.toThrow('PERMISSION_BLOCKED');
    await run('MAPPING_SAVE',randomUUID(),{...expired,enabled:false});expect((await queries.list('videos',{type:'MAPPINGS'})).rows[0].enabled).toBe(false);
  });
  it("registry refresh preserves admin-edited handles and rights windows without recreating defaults",async()=>{
    const store=new VideoStore(database);await store.registry();
    const row=(await queries.list('videos',{})).rows.find(r=>r.channelHandle==='@FPTBongDaOfficial')!;
    const data=videoEditSchema.parse({...Object.fromEntries(Object.keys(videoEditSchema.shape).map(k=>[k,row[k]])),channelHandle:'@operator-renamed-test',enabled:false});
    await service.mutate({...command('VIDEO_UPDATE',row.id,data),expectedUpdatedAt:row.updatedAt},briefNow);
    const mapping=(await queries.list('videos',{type:'MAPPINGS'})).rows[0];
    const changed=mappingEditSchema.parse({...Object.fromEntries(Object.keys(mappingEditSchema.shape).map(k=>[k,mapping[k]])),validFrom:'2026-08-02T00:00:00Z',enabled:false});
    await service.mutate({...command('MAPPING_SAVE',mapping.id,changed),expectedUpdatedAt:mapping.updatedAt},briefNow);
    expect(await store.registry()).toBe(0);expect((await database.query('SELECT id FROM "VideoSource"'))).toHaveLength(2);
    expect((await database.query('SELECT id FROM "VideoSourceCompetition"'))).toHaveLength(1);
    expect((await queries.list('videos',{type:'MAPPINGS'})).rows[0]).toMatchObject({enabled:false,validFrom:'2026-08-02T00:00:00.000Z'});
    expect((await queries.list('videos',{})).rows.find(r=>r.id===row.id)).toMatchObject({enabled:false,channelHandle:'@operator-renamed-test'});
  });
  it("news registry refresh honors source slug after an admin domain edit",async()=>{
    const store=new NewsSyncStore(database);await store.registerSources();
    const [row]=await database.query<{id:string}>('SELECT id FROM "NewsSource" WHERE slug=\'wikinews-en\'');
    const before=(await database.query('SELECT id FROM "NewsSource"')).length;
    await service.mutate(await sourceCommand(row.id,{domain:'reviewed-domain.example.test',enabled:false,ingestionAllowed:false}),briefNow);
    await store.registerSources();expect((await database.query('SELECT id FROM "NewsSource"'))).toHaveLength(before);
    expect((await database.query('SELECT domain,enabled FROM "NewsSource" WHERE id=$1::uuid',[row.id]))[0]).toMatchObject({domain:'reviewed-domain.example.test',enabled:false});
  });
  it("story approval creates immutable audit and public eligibility",async()=>{
    const {articleId}=await news();await run('ARTICLE_APPROVE',articleId);
    const [a]=await database.query<{approvalAuditId:string;publicationStatus:string}>('SELECT "approvalAuditId","publicationStatus" FROM "Article" WHERE id=$1::uuid',[articleId]);expect(a.publicationStatus).toBe('PUBLISHED');expect(a.approvalAuditId).toBeTruthy();
    expect(new ReliabilityEngine().assess((await loadReliabilityInput(database,articleId))!,briefNow).publishability.eligible).toBe(true);
    await expect(db.query('UPDATE "AdminAuditLog" SET reason=\'overwrite\' WHERE id=$1::uuid',[a.approvalAuditId])).rejects.toThrow();
  });
  it("story rejection records audit and revokes approval",async()=>{
    const {articleId}=await news();await run('ARTICLE_APPROVE',articleId);await run('ARTICLE_REJECT',articleId);
    expect((await database.query('SELECT "approvalAuditId","publicationStatus" FROM "Article"'))[0]).toMatchObject({approvalAuditId:null,publicationStatus:'HIDDEN'});
    expect((await database.query('SELECT id FROM "AdminAuditLog" WHERE action=\'ARTICLE_REJECT\''))).toHaveLength(1);
  });
  it("hiding a story removes it from public news and previously published Brief reads",async()=>{
    const {articleId}=await news();await run('ARTICLE_APPROVE',articleId);
    const [a]=await database.query<{clusterId:string}>('SELECT "clusterId" FROM "Article" WHERE id=$1::uuid',[articleId]);
    expect(await readPublishedStory(database,a.clusterId,briefNow)).not.toBeNull();
    const {record}=await new MorningBriefService(database).generate({date:'2026-10-18'},briefNow);await run('BRIEF_PUBLISH',record.id);
    const query=new BriefQueryService(database);expect(await query.getLatest(briefNow)).not.toBeNull();
    await run('ARTICLE_REJECT',articleId);expect(await readPublishedStory(database,a.clusterId,briefNow)).toBeNull();expect(await query.getLatest(briefNow)).toBeNull();
  });
  it("admin merge and unmerge reuse reversible audited membership operations",async()=>{
    await seedBriefNews(db,database,1,'OFF_FIELD',true);await seedBriefNews(db,database,2,'CLUB',true);
    const clusters=await new StoryClusteringService(database).cluster({now:briefNow});expect(clusters).toHaveLength(2);
    const ids=clusters.map(c=>c.clusterId);const merged=await run('CLUSTER_MERGE',ids[0],{clusterIds:ids});
    expect((await database.query('SELECT DISTINCT "clusterId" FROM "Article"'))).toHaveLength(1);
    await run('CLUSTER_UNMERGE',(merged as {auditId:string}).auditId);expect((await database.query('SELECT DISTINCT "clusterId" FROM "Article"'))).toHaveLength(2);
    expect((await database.query('SELECT id FROM "ClaimEvidence"'))).toHaveLength(4);
  });
  it("manual Vietnamese edit preserves generated version and requires new evidence review",async()=>{
    const {articleId}=await news();const input=(await loadReliabilityInput(database,articleId))!;
    const changed='Arsenal công bố hoạt động từ thiện.';
    await run('ARTICLE_EDIT',articleId,{titleVi:changed,summaryVi:input.article.summaryVi,storyType:'OFF_FIELD',titleSourceText:input.article.titleOriginal,summarySourceText:input.article.excerptOriginal});
    const runs=await database.query<AdminRow>('SELECT provider,output FROM "AIProcessingRun" WHERE "articleId"=$1::uuid',[articleId]);expect(runs).toHaveLength(2);expect(runs.some(r=>r.provider==='EDITORIAL')).toBe(true);
    await expect(run('ARTICLE_APPROVE',articleId)).rejects.toThrow('EVIDENCE_REQUIRED');
    const proof=await database.query<{id:string}>('SELECT id FROM "ClaimEvidence" WHERE "articleId"=$1::uuid AND "reviewedAt" IS NULL',[articleId]);
    await service.mutate(command('EVIDENCE_REVIEW',articleId,{evidenceIds:proof.map(p=>p.id),kind:'OFFICIAL_STATEMENT',authorityScope:`club:${transferIds.arsenal}`,lineageKey:'editorial-original-report'}),new Date(briefNow.getTime()+1000));
    await service.mutate(command('ARTICLE_APPROVE',articleId),new Date(briefNow.getTime()+2000));
    expect(new ReliabilityEngine().assess((await loadReliabilityInput(database,articleId))!,new Date(briefNow.getTime()+3000)).publishability.eligible).toBe(true);
    const detail=await queries.detail('stories',articleId);expect(detail).toHaveProperty('runs');expect(JSON.stringify(detail)).toContain(changed);
  });
  it("rejects invented text and cannot approve revoked source permissions",async()=>{
    const {articleId,sourceId}=await news();const input=(await loadReliabilityInput(database,articleId))!;
    await expect(run('ARTICLE_EDIT',articleId,{titleVi:'Arsenal thắng 9–0 hôm nay',summaryVi:input.article.summaryVi,storyType:'MATCH',titleSourceText:input.article.titleOriginal,summarySourceText:input.article.excerptOriginal})).rejects.toThrow('EVIDENCE_REQUIRED');
    await db.query('UPDATE "NewsSource" SET "permissionStatus"=\'RESTRICTED\',enabled=false WHERE id=$1::uuid',[sourceId]);await expect(run('ARTICLE_APPROVE',articleId)).rejects.toThrow('EVIDENCE_REQUIRED');
  });
  it("feature/dispute is audited without fabricating confirmation",async()=>{
    const {articleId}=await news();await run('ARTICLE_APPROVE',articleId);const [a]=await database.query<{clusterId:string}>('SELECT "clusterId" FROM "Article" WHERE id=$1::uuid',[articleId]);
    await run('CLUSTER_FLAGS',a.clusterId,{featured:true,disputed:true});expect((await database.query('SELECT featured,"manualDisputed" FROM "ArticleCluster"'))[0]).toMatchObject({featured:true,manualDisputed:true});
  });
  it("admin cannot promote rumor to confirmed without authoritative evidence",async()=>{
    await seedTransferArticle(db,database,1,{status:'RUMOR'});await new TransferTrackingService(database).sync(briefNow);
    const [t]=await database.query<{id:string}>('SELECT id FROM "Transfer"');const [e]=await database.query<{id:string}>('SELECT id FROM "ClaimEvidence"');
    await expect(run('TRANSFER_REVIEW',t.id,{evidenceId:e.id,status:'CONFIRMED'})).rejects.toThrow('EVIDENCE_REQUIRED');
    expect((await database.query('SELECT status FROM "Transfer"'))[0]).toMatchObject({status:'RUMOR'});
  });
  it("authoritative explicit announcement supports confirmed state and audited review",async()=>{
    await seedTransferArticle(db,database,1,{status:'CONFIRMED'});await new TransferTrackingService(database).sync(briefNow);
    const [t]=await database.query<{id:string}>('SELECT id FROM "Transfer"');const [e]=await database.query<{id:string}>('SELECT id FROM "ClaimEvidence" WHERE kind=\'OFFICIAL_STATEMENT\'');
    await run('TRANSFER_REVIEW',t.id,{evidenceId:e.id,status:'CONFIRMED'});expect((await database.query('SELECT action FROM "AdminAuditLog"'))[0]).toMatchObject({action:'TRANSFER_REVIEW'});
  });
  it("READY -> PUBLISHED revalidates current data and records publishing admin",async()=>{
    await seedBriefNews(db,database,1);const {record}=await new MorningBriefService(database).generate({date:'2026-10-18'},briefNow);expect(record.status).toBe('READY');
    expect(await queries.detail('briefs',record.id,briefNow)).toHaveProperty('brief.status','READY');
    await run('BRIEF_PUBLISH',record.id);expect((await database.query('SELECT status,"publishedById","publishedAt" FROM "BriefRevision"'))[0]).toMatchObject({status:'PUBLISHED',publishedById:admin});
    expect((await database.query('SELECT action FROM "AdminAuditLog"'))[0]).toMatchObject({action:'BRIEF_PUBLISH'});
    await expect(db.query('UPDATE "BriefRevision" SET status=\'READY\'')).rejects.toThrow();
  });
  it("pagination, search and filters are bounded and stable",async()=>{
    for(let n=0;n<23;n++) await db.query('INSERT INTO "NewsSource" (id,name,domain,type,"accessPolicy","updatedAt") VALUES ($1::uuid,$2,$3,\'PUBLICATION\',\'pending review\',now())',[randomUUID(),`Source ${String(n).padStart(2,'0')}`,`source-${n}.example.test`]);
    const first=await queries.list('sources',{}),second=await queries.list('sources',{page:'2'});expect(first.rows).toHaveLength(20);expect(first.hasNext).toBe(true);expect(second.rows).toHaveLength(3);expect(second.hasNext).toBe(false);expect(new Set([...first.rows,...second.rows].map(r=>r.id)).size).toBe(23);
    expect((await queries.list('sources',{q:'Source 22',status:'',enabled:''})).rows).toHaveLength(1);
    await expect(queries.list('sources',{status:'PROHIBITED'})).rejects.toThrow('INVALID_INPUT');
  });
  it("secret-bearing job payloads and unchecked processing JSON never reach DTOs",async()=>{
    const secret='DO_NOT_RETURN_PRIVATE_PAYLOAD';await db.query('INSERT INTO "JobRun" (id,"correlationId","jobName","logicalKey",checkpoint,"errorSafe","errorCode","updatedAt") VALUES ($1::uuid,$1::uuid,\'scheduler:morning\',\'test\',$2::jsonb,$3,$3,now())',[randomUUID(),JSON.stringify({token:secret}),secret]);
    const result=JSON.stringify(await queries.list('jobs',{}));expect(result).not.toContain(secret);expect(result).not.toContain('checkpoint');expect(result).not.toContain('errorSafe');
    const {articleId}=await news();await db.query('UPDATE "AIProcessingRun" SET output=$2::jsonb WHERE "articleId"=$1::uuid',[articleId,JSON.stringify({warnings:[secret]})]);expect(JSON.stringify(await queries.detail('stories',articleId))).not.toContain(secret);
  });
  it("invalid dates, enums, URLs and missing confirmation are refused",async()=>{
    for(const input of [{...command('ARTICLE_APPROVE',randomUUID()),confirm:false},command('BRIEF_GENERATE',randomUUID(),{date:'2026-02-31'}),command('TRANSFER_REVIEW',randomUUID(),{status:'UNKNOWN',evidenceId:randomUUID()})]) await expect(service.mutate(input,briefNow)).rejects.toThrow('INVALID_INPUT');
    expect(adminUrl.safeParse('https://example.test/?api_key=test-only').success).toBe(false);expect(adminUrl.safeParse('https://example.test/?AUTH_SECRET=test-only').success).toBe(false);
  });
  it("initial admin bootstrap is explicit, audited and refuses a second bootstrap",async()=>{
    await expect(bootstrapAdmin(database,reader,'Local operator bootstrap',true)).rejects.toThrow('CONFLICT');
    await db.query('UPDATE "User" SET role=\'USER\' WHERE id=$1::uuid',[admin]);
    await bootstrapAdmin(database,reader,'Local operator bootstrap',true);expect((await database.query('SELECT action FROM "AdminAuditLog"'))[0]).toMatchObject({action:'ADMIN_BOOTSTRAP'});
    await expect(bootstrapAdmin(database,admin,'Local operator bootstrap',true)).rejects.toThrow('CONFLICT');
  });
  it("manual job rerun delegates to ScheduledJobRunner, audits and retains concurrent protection",async()=>{
    let held=false;const lock:SchedulerLock={async acquire(){if(held)return null;held=true;return async()=>{held=false;};},assertHeld(){}};
    let release!:()=>void;let entered!:()=>void;const enteredPromise=new Promise<void>(resolve=>{entered=resolve;});
    const jobs=Object.fromEntries(scheduledJobs.map(type=>[type,vi.fn(async()=>{if(type==='ARTICLE_PROCESS'){entered();await new Promise<void>(resolve=>{release=resolve;});}return {status:'SUCCEEDED',processed:0,succeeded:0,failed:0,...(type==='MORNING_BRIEF_GENERATE'?{brief:{id:vidId(999),revision:1,status:'READY',cached:false}}:{})};})])) as unknown as SchedulerHandlers;
    const runner=new ScheduledJobRunner(new SchedulerStore(database),lock,jobs,{clock:()=>briefNow});
    const rerun=vi.fn((date:string)=>runner.run(morningPlan({date,storedOnly:true,rerun:true},{},briefNow)));
    service=new AdminService(database,session,rerun);const first=run('WORKFLOW_RERUN',randomUUID(),{date:'2026-10-18'});await enteredPromise;
    const second=await run('WORKFLOW_RERUN',randomUUID(),{date:'2026-10-18'});expect(second).toMatchObject({status:'SKIPPED',code:'WORKFLOW_RUNNING'});release();expect(await first).toMatchObject({status:'SUCCEEDED'});
    expect(jobs.ARTICLE_PROCESS).toHaveBeenCalledTimes(1);expect((await database.query('SELECT id FROM "AdminAuditLog" WHERE action=\'WORKFLOW_RERUN_REQUEST\''))).toHaveLength(2);expect((await queries.list('jobs',{})).rows.length).toBeGreaterThan(0);
  });
});
