import { z } from "zod";
import { safeReturnPath, sameOriginMutation } from "../lib/auth-policy";
import { privateHeaders } from "./account-http";
import { InvalidRequestBody, readSmallJson } from "../lib/request-body";

const signInSchema = z.object({ callbackURL: z.string().max(500).optional() }).strict();
export async function authRequest(request: Request, dependencies: { appUrl: string; handler: ((request: Request) => Promise<Response>) | null; onError?: () => void }) {
  const reply = (error: string, status: number) => Response.json({ error }, { status, headers: privateHeaders });
  const pathname = new URL(request.url).pathname;
  const allowed = request.method === "GET" ? pathname === "/api/auth/callback/google" : request.method === "POST" && ["/api/auth/sign-in/social", "/api/auth/sign-out"].includes(pathname);
  if (!allowed) return reply("Không tìm thấy yêu cầu.", 404);
  if (request.method === "POST" && !sameOriginMutation(request.headers, dependencies.appUrl)) return reply("Yêu cầu không hợp lệ.", 403);
  if (!dependencies.handler) return reply("Đăng nhập chưa được cấu hình. Bạn vẫn có thể đọc nội dung công khai.", 503);
  try {
    if (request.method === "POST") {
      const input = await readSmallJson(request, 2048);
      const headers = new Headers(request.headers); headers.delete("content-length"); headers.set("content-type", "application/json");
      let body: Record<string, unknown> = {};
      if (pathname === "/api/auth/sign-in/social") {
        const parsed = signInSchema.safeParse(input);
        if (!parsed.success) return reply("Yêu cầu không hợp lệ.", 400);
        body = { provider: "google", callbackURL: safeReturnPath(parsed.data.callbackURL), errorCallbackURL: "/login?error=1" };
      } else if (!z.object({}).strict().safeParse(input).success) return reply("Yêu cầu không hợp lệ.", 400);
      request = new Request(request.url, { method: "POST", headers, body: JSON.stringify(body) });
    }
    const response = await dependencies.handler(request);
    for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
    return response;
  } catch (error) {
    if (error instanceof InvalidRequestBody) return reply("Yêu cầu không hợp lệ.", 400);
    dependencies.onError?.();
    return reply("Không thể đăng nhập lúc này. Vui lòng thử lại.", 503);
  }
}
