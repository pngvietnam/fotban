import "server-only";
import { headers } from "next/headers";
import { activeUser } from "./auth";
import { getDatabase } from "./db";
import { env } from "./env";
import { logger } from "./logger";
import { prismaSyncDatabase } from "./sync-database";
import { AdminError } from "./admin-policy";
import { AdminService } from "../services/admin";
import { AdminQueryService } from "../services/admin-query";
import { adminRequest } from "../services/admin-http";
import { requireAdmin } from "../services/admin-access";
import { ScheduledJobRunner } from "../services/scheduler";
import { SchedulerStore } from "../services/scheduler-store";
import { PostgresSchedulerLock } from "./scheduler-lock";
import { createSchedulerHandlers } from "./scheduler-runtime";
import { morningPlan } from "./scheduler-policy";

export function adminRuntime(requestHeaders:Headers) {
  const db=getDatabase();if(!db) throw new AdminError("FORBIDDEN",403);
  const database=prismaSyncDatabase(db);const session=()=>activeUser(requestHeaders);
  return {authorize:()=>requireAdmin(database,session),queries:new AdminQueryService(database,session),service:new AdminService(database,session,async(date)=>{
    const plan=morningPlan({date,storedOnly:true,rerun:true},env);
    const result=await new ScheduledJobRunner(new SchedulerStore(database),new PostgresSchedulerLock(env.DATABASE_URL!),createSchedulerHandlers(db,env,logger),{log:logger}).run(plan);
    return {status:result.status,...("workflowId" in result && result.workflowId?{workflowId:result.workflowId}:{}),...("code" in result && typeof result.code==="string"?{code:result.code}:{})};
  })};
}
export async function adminPageRuntime() {return adminRuntime(await headers());}
export async function handleAdminRequest(request:Request) {
  try {return await adminRequest(request,{...adminRuntime(request.headers),appUrl:env.NEXT_PUBLIC_APP_URL,onError:()=>logger.warn({event:"admin_request_failed",category:"ADMIN"})});}
  catch {return Response.json({error:"Khu vực quản trị chưa khả dụng."},{status:503,headers:{"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow"}});}
}
