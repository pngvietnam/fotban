import { AdminError, adminMessages, adminSections } from "../lib/admin-policy";
import { InvalidRequestBody, readSmallJson } from "../lib/request-body";
import { sameOriginMutation } from "../lib/auth-policy";
import { privateHeaders } from "./account-http";
import { AdminService } from "./admin";
import { AdminQueryService } from "./admin-query";

export async function adminRequest(request:Request,dependencies:{queries:AdminQueryService;service:AdminService;appUrl:string;onError?:()=>void}) {
  const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:privateHeaders});
  if(request.method!=="GET" && !sameOriginMutation(request.headers,dependencies.appUrl)) return reply({error:adminMessages.FORBIDDEN},403);
  try {
    const url=new URL(request.url);const section=url.pathname.split("/").at(-1);
    if(request.method==="GET" && section==="overview") return reply(await dependencies.queries.overview());
    if(request.method==="GET" && adminSections.includes(section as typeof adminSections[number])) {
      const kind=section as typeof adminSections[number];const id=url.searchParams.get("id");
      if(id) return reply(await dependencies.queries.detail(kind,id));
      return reply(await dependencies.queries.list(kind,Object.fromEntries(url.searchParams)));
    }
    if(request.method==="POST" && section==="action") return reply(await dependencies.service.mutate(await readSmallJson(request,32768)));
    return reply({error:adminMessages.NOT_FOUND},404);
  } catch(error) {
    if(error instanceof AdminError) return reply({error:adminMessages[error.code],code:error.code},error.status);
    if(error instanceof InvalidRequestBody) return reply({error:adminMessages.INVALID_INPUT},400);
    dependencies.onError?.(); return reply({error:adminMessages.UNAVAILABLE},503);
  }
}
export async function adminGuard(request:Request,authorize:()=>Promise<unknown>) {
  try {await authorize();return null;} catch(error) {
    const status=error instanceof AdminError?403:503;
    if(new URL(request.url).pathname.startsWith("/api/")) return Response.json({error:status===403?adminMessages.FORBIDDEN:adminMessages.UNAVAILABLE},{status,headers:privateHeaders});
    return new Response(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${status} · Quản trị</title></head><body style="font:16px Arial,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:40px 20px"><main style="max-width:600px;margin:auto"><h1>${status===403?"Không có quyền truy cập":"Khu vực quản trị tạm thời chưa khả dụng"}</h1><p>${status===403?adminMessages.FORBIDDEN:adminMessages.UNAVAILABLE}</p><p><a href="/login?returnTo=%2Fadmin">Đăng nhập bằng tài khoản quản trị</a></p><a href="/">Về trang chủ</a></main></body></html>`,{status,headers:{...privateHeaders,"Content-Type":"text/html; charset=utf-8"}});
  }
}
