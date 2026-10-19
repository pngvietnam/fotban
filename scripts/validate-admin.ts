// Isolated runtime verification, never imported by application code.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { Client } from "pg";
import type { PGlite } from "@electric-sql/pglite";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { testUtils } from "better-auth/plugins";
import { createDatabaseClient } from "../lib/database-client";
import { authenticationOptions } from "../lib/auth-options";
import { prismaSyncDatabase } from "../lib/sync-database";
import { seedBriefNews } from "../tests/fixtures/brief-news";
import { resetTransferDatabase, seedTransferArticle, transferIds } from "../tests/fixtures/transfer-store";
import { seedHomepageMatch } from "../tests/fixtures/homepage";
import { videoSource } from "../tests/fixtures/videos";
import { TransferTrackingService } from "../services/transfer-service";
import { MorningBriefService } from "../services/morning-brief";
import { sourceEditSchema, videoEditSchema } from "../lib/admin-policy";
import { PostgresSchedulerLock } from "../lib/scheduler-lock";

let stage="configuration";
async function main(){
  if(process.env.NODE_ENV==='production'||!process.env.DATABASE_URL)throw new Error('Local development database required');
  const original=new URL(process.env.DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(original.hostname));
  const name=`fmb_m16_smoke_${randomUUID().replaceAll('-','')}`;assert.match(name,/^fmb_m16_smoke_[a-f0-9]{32}$/);
  const operator=new Client({connectionString:original.toString()});await operator.connect();
  const originalState=async()=>{
    const counts:Record<string,number>={};for(const table of ['Match','Article','ArticleCluster','Transfer','Video','DailyBrief','BriefRevision','JobRun','User','UserFollow','AdminAuditLog'])counts[table]=Number((await operator.query(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n);
    const permissions=createHash('sha256').update(JSON.stringify((await operator.query('SELECT id,enabled,"permissionStatus","termsReviewed","ingestionAllowed","commercialReuseAllowed" FROM "NewsSource" ORDER BY id')).rows)).digest('hex');return {counts,permissions};
  };
  const before=await originalState();const isolated=new URL(original);isolated.pathname=`/${name}`;
  let created=false;let sql:Client|undefined;let db:ReturnType<typeof createDatabaseClient>|undefined;let child:ReturnType<typeof spawn>|undefined;
  const checks:Record<string,string>={};
  try{
    stage='isolated migrations';await operator.query(`CREATE DATABASE "${name}"`);created=true;sql=new Client({connectionString:isolated.toString()});await sql.connect();
    for(const entry of readdirSync('prisma/migrations',{withFileTypes:true}).filter(e=>e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name)))await sql.query(readFileSync(`prisma/migrations/${entry.name}/migration.sql`,'utf8'));
    db=createDatabaseClient(isolated.toString());const database=prismaSyncDatabase(db);
    const fixtureDb={query:(text:string,params:unknown[]=[])=>sql!.query(text,params),exec:(text:string)=>sql!.query(text)} as unknown as PGlite;
    await resetTransferDatabase(fixtureDb);await seedHomepageMatch(database);
    const story=await seedBriefNews(fixtureDb,database,1,'OFF_FIELD',true);await seedTransferArticle(fixtureDb,database,2,{status:'RUMOR'});await new TransferTrackingService(database).sync();
    const v=videoSource();await sql.query('INSERT INTO "VideoSource" (id,"channelId","channelHandle",name,country,language,verified,enabled,"sourceType","lastVerifiedAt","reviewReference","updatedAt") VALUES ($1::uuid,$2,$3,$4,\'VN\',\'vi\',true,true,\'RIGHTS_HOLDER\',$5::timestamptz,$6,now())',[v.id,v.channelId,v.channelHandle,v.name,v.lastVerifiedAt,v.reviewReference]);
    const admin=await db.user.create({data:{email:'isolated-admin@example.test',displayName:'Quản trị kiểm thử',role:'ADMIN',emailVerified:true}});
    const reader=await db.user.create({data:{email:'isolated-reader@example.test',displayName:'Người đọc kiểm thử',role:'USER',emailVerified:true}});
    const port=3019,runtimeUrl=`http://127.0.0.1:${port}`,appUrl=`https://localhost:${port}`;
    const settings={DATABASE_URL:isolated.toString(),NEXT_PUBLIC_APP_URL:appUrl,AUTH_SECRET:randomBytes(48).toString('base64url'),AUTH_GOOGLE_ID:'isolated-test-only',AUTH_GOOGLE_SECRET:randomBytes(32).toString('base64url')};
    const auth=betterAuth({...authenticationOptions(prismaAdapter(db,{provider:'postgresql',transaction:true}),settings,async()=>{},true),plugins:[testUtils()]});
    const ctx=await auth.$context;const adminSession=await ctx.test.login({userId:admin.id});const readerSession=await ctx.test.login({userId:reader.id});const cookie=adminSession.headers.get('cookie')!;
    stage='production server';let output='';
    child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:process.cwd(),env:{...process.env,...settings,NODE_ENV:'production',LOG_LEVEL:'silent',YOUTUBE_API_KEY:'',FOOTBALL_DATA_API_KEY:'',AI_API_KEY:''},windowsHide:true,stdio:['ignore','pipe','pipe']});
    child.stdout!.on('data',c=>{output=(output+c.toString()).slice(-12000);});child.stderr!.on('data',c=>{output=(output+c.toString()).slice(-12000);});
    let ready=false;for(let n=0;n<60;n++){if(child.exitCode!==null)throw new Error('Server exited');try{if((await fetch(`${runtimeUrl}/api/health`)).status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
    const request=(path:string,options:{cookie?:string;method?:string;body?:unknown;origin?:string}={})=>fetch(`${runtimeUrl}${path}`,{redirect:'manual',method:options.method??'GET',headers:{origin:options.origin??appUrl,'Content-Type':'application/json',...(options.cookie?{cookie:options.cookie}:{})},...(options.body?{body:JSON.stringify(options.body)}:{})});
    const command=(action:string,id:string,data?:unknown)=>({action,id,reason:'Isolated runtime editorial verification',confirm:true,...(data?{data}:{})});
    const action=async(body:unknown,expected=200)=>{const r=await request('/api/admin/action',{cookie,method:'POST',body});const payload=await r.json();assert.equal(r.status,expected,`action status at ${stage}: ${payload.code??'unknown'}`);return payload;};
    stage='access boundary';for(const token of [undefined,readerSession.headers.get('cookie')!])for(const path of ['/admin','/admin/sources','/admin/briefs','/api/admin/overview'])assert.equal((await request(path,{cookie:token})).status,403);
    assert.equal((await request('/api/admin/action',{cookie:readerSession.headers.get('cookie')!,method:'POST',body:command('ARTICLE_APPROVE',story.articleId)})).status,403);
    assert.equal((await request('/api/admin/action',{cookie,method:'POST',body:command('ARTICLE_APPROVE',story.articleId),origin:'https://attacker.example.test'})).status,403);
    checks.authorization='PASS: anonymous/USER denied by server; cross-origin mutation rejected';
    stage='admin routes';for(const path of ['/admin','/admin/sources','/admin/videos','/admin/videos?type=MAPPINGS','/admin/stories','/admin/transfers','/admin/briefs','/admin/jobs']){
      const r=await request(path,{cookie});assert.equal(r.status,200,path);const html=await r.text();assert.ok(html.includes('Nội bộ'));assert.ok(!html.includes('Không thể tải khu vực này'),path);assert.ok(r.headers.get('cache-control')?.includes('private'));assert.ok(html.includes('noindex'));
    }checks.routes='PASS: all seven production admin pages, private cache and noindex';
    stage='source edit';const source=await db.newsSource.findUniqueOrThrow({where:{id:story.sourceId}});const data=sourceEditSchema.parse({...Object.fromEntries(Object.keys(sourceEditSchema.shape).map(k=>[k,(source as unknown as Record<string,unknown>)[k]])),rationale:'Reviewed isolated test source'});
    await action({...command('SOURCE_UPDATE',source.id,{...data,permissionStatus:'RESTRICTED'}),expectedUpdatedAt:source.updatedAt.toISOString()},400);
    await action({...command('SOURCE_UPDATE',source.id,data),expectedUpdatedAt:source.updatedAt.toISOString()});
    checks.sources='PASS: invalid enable blocked; permitted fixture edit and audit persisted';
    stage='video edit';const video=await db.videoSource.findUniqueOrThrow({where:{id:v.id}});const videoData=videoEditSchema.parse({...Object.fromEntries(Object.keys(videoEditSchema.shape).map(k=>[k,(video as unknown as Record<string,unknown>)[k]])),lastVerifiedAt:video.lastVerifiedAt?.toISOString()??null,notes:'Isolated reviewed source'});
    await action({...command('VIDEO_UPDATE',video.id,videoData),expectedUpdatedAt:video.updatedAt.toISOString()});
    await action(command('MAPPING_SAVE',randomUUID(),{videoSourceId:video.id,competitionId:transferIds.league,season:'2026/2027',market:'VN',language:'vi',rightsType:'AUTHORIZED_LINK',priority:10,validFrom:'2026-08-01T00:00:00Z',validTo:'2027-07-01T00:00:00Z',enabled:true,evidenceUrl:'https://fixture.example.test/rights'}));
    checks.videos='PASS: reviewed source edit and season/date mapping';
    stage='story review';const detail=await request(`/admin/stories?id=${story.articleId}`,{cookie});assert.ok((await detail.text()).includes('Rà soát câu chuyện'));
    const originalArticle=await db.article.findUniqueOrThrow({where:{id:story.articleId}});
    await action(command('ARTICLE_EDIT',story.articleId,{titleVi:`${originalArticle.titleVi}.`,summaryVi:originalArticle.summaryVi,storyType:'OFF_FIELD',titleSourceText:originalArticle.titleOriginal,summarySourceText:originalArticle.excerptOriginal}));
    await action(command('ARTICLE_APPROVE',story.articleId),400);
    const newProof=await db.claimEvidence.findMany({where:{articleId:story.articleId,reviewedAt:null},select:{id:true}});assert.equal(newProof.length,2);
    await action(command('EVIDENCE_REVIEW',story.articleId,{evidenceIds:newProof.map(e=>e.id),kind:'OFFICIAL_STATEMENT',authorityScope:`club:${transferIds.arsenal}`,lineageKey:'isolated-editorial-origin'}));
    await action(command('ARTICLE_APPROVE',story.articleId));const cluster=await db.article.findUniqueOrThrow({where:{id:story.articleId}});assert.equal(cluster.publicationStatus,'PUBLISHED');assert.ok(cluster.approvalAuditId);
    assert.equal(await db.aIProcessingRun.count({where:{articleId:story.articleId}}),2);
    checks.storyApproval='PASS: generated version retained; manual edit needs fresh proof review; immutable exact approval audit';
    stage='transfer guard';const transfer=await db.transfer.findFirstOrThrow();const proof=await db.claimEvidence.findFirstOrThrow({where:{articleId:{not:story.articleId}}});
    assert.ok((await (await request(`/admin/transfers?id=${transfer.id}`,{cookie})).text()).includes('Dòng thời gian'));
    await action(command('TRANSFER_REVIEW',transfer.id,{evidenceId:proof.id,status:'CONFIRMED'}),400);await action(command('TRANSFER_REVIEW',transfer.id,{evidenceId:proof.id,status:'RUMOR'}));
    checks.transfers='PASS: reviewed timeline; rumor cannot be promoted to confirmed';
    stage='brief preview and publish';const generated=await new MorningBriefService(database).generate({date:'2026-10-18'});assert.equal(generated.record.status,'READY');
    const preview=await request(`/admin/briefs?id=${generated.record.id}`,{cookie});assert.ok((await preview.text()).includes('Xuất bản phiên bản READY'));
    await action(command('BRIEF_PUBLISH',generated.record.id));assert.equal((await db.briefRevision.findUniqueOrThrow({where:{id:generated.record.id}})).publishedById,admin.id);
    const home=await request('/');assert.equal(home.status,200);assert.ok((await home.text()).includes('Arsenal'));
    checks.briefs='PASS: protected READY preview, explicit publication, publishedBy admin and public homepage';
    stage='story hide propagation';await action(command('ARTICLE_REJECT',story.articleId));const news=await request('/news');assert.ok(!(await news.text()).includes('Arsenal công bố hoạt động từ thiện'));
    const withdrawn=await request('/');assert.ok(!(await withdrawn.text()).includes('Arsenal công bố hoạt động từ thiện'));
    checks.withdrawal='PASS: rejection revokes approval and hides previously published news/Brief content';
    stage='scheduler lock';const lock=new PostgresSchedulerLock(isolated.toString());const release=await lock.acquire();assert.ok(release);
    try{const skipped=await action(command('WORKFLOW_RERUN',randomUUID(),{date:'2026-10-18'}));assert.equal(skipped.status,'SKIPPED');assert.equal(skipped.code,'WORKFLOW_RUNNING');}finally{await release();}
    const rerun=await action(command('WORKFLOW_RERUN',randomUUID(),{date:'2026-10-18'}));assert.ok(['SUCCEEDED','PARTIAL'].includes(rerun.status));
    const latest=await db.briefRevision.findFirstOrThrow({orderBy:{generatedAt:'desc'}});assert.equal(latest.status,'READY');
    const jobs=await request('/api/admin/jobs',{cookie});const jobsJson=await jobs.json();assert.equal(jobs.status,200);assert.ok(jobsJson.rows.length>0);assert.ok(!JSON.stringify(jobsJson).includes('checkpoint'));
    checks.jobs='PASS: existing runner used; real PostgreSQL concurrency lock and persisted safe JobRun DTO';
    stage='public route regression';for(const path of ['/','/matches','/news','/transfers'])assert.equal((await request(path)).status,200);
    await db.user.update({where:{id:admin.id},data:{role:'USER'}});assert.equal((await request('/admin',{cookie})).status,403);checks.revocation='PASS: existing signed session loses admin access after role revocation';
    assert.ok(await db.adminAuditLog.count()>=10);assert.ok(!output.includes(settings.AUTH_SECRET));assert.ok(!output.includes(settings.AUTH_GOOGLE_SECRET));
  }finally{
    if(child&&child.exitCode===null){const exit=once(child,'exit');child.kill();await exit;}
    await db?.$disconnect();await sql?.end();if(created)await operator.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    const after=await originalState();await operator.end();assert.deepEqual(after,before,'Original content, users, audits and source permissions must remain unchanged');
  }
  checks.cleanup='PASS: disposable server/database removed; original counts and source permissions unchanged';
  writeFileSync('docs/samples/admin-validation.json',JSON.stringify({date:new Date().toISOString(),mode:'isolated PostgreSQL + production Next; library-issued test sessions; no external provider requests',checks},null,2)+'\n');
  console.log(JSON.stringify(checks,null,2));
}
main().catch((error:unknown)=>{console.error(`Admin runtime validation failed at ${stage} (${error instanceof Error?error.name:'UNKNOWN'}); no credentials or raw database/provider error logged.`);process.exitCode=1;});
