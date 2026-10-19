import { NextResponse, type NextRequest } from "next/server";
import { adminRuntime } from "./lib/admin-runtime";
import { adminGuard } from "./services/admin-http";

export async function proxy(request:NextRequest) {
  const denied=await adminGuard(request,()=>adminRuntime(request.headers).authorize());
  if(denied) return denied;
  const response=NextResponse.next();response.headers.set("Cache-Control","private, no-store, max-age=0");response.headers.set("X-Robots-Tag","noindex, nofollow");return response;
}
export const config={matcher:["/admin/:path*","/api/admin/:path*"]};
