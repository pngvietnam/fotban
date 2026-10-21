import { AccountError, accountErrorText, sameOriginMutation } from "../lib/auth-policy";
import { FollowingService, UserPreferenceService, requireAccount, type SessionResolver } from "./following";
import type { SyncDatabase } from "../lib/sync-database";
import { InvalidRequestBody, readSmallJson } from "../lib/request-body";
import { StoryLikeService } from "./story-likes";
import { StorySaveService } from "./story-saves";

export const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", "X-Robots-Tag": "noindex, nofollow" };
export async function accountRequest(request: Request, dependencies: { database: SyncDatabase; session: SessionResolver; appUrl: string; onError?: () => void }) {
  const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: privateHeaders });
  if (request.method !== "GET" && !sameOriginMutation(request.headers, dependencies.appUrl)) return reply({ error: "Yêu cầu không hợp lệ." }, 403);
  try {
    const user = await requireAccount(dependencies.session);
    const session = async () => user;
    const following = new FollowingService(dependencies.database, session);
    const preferences = new UserPreferenceService(dependencies.database, session);
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some((key) => key !== "q")) throw new AccountError("INVALID_INPUT", 400);
    if (request.method === "GET") {
      if (url.pathname === "/api/account") return reply({ user, preferences: await preferences.get(), follows: await following.list(), catalog: await following.catalog(url.searchParams.get("q") ?? "") });
      if (url.pathname === "/api/following") return reply({ follows: await following.list() });
      if (url.pathname === "/api/preferences") return reply(await preferences.get());
      if (url.pathname === "/api/saved") return reply({ saved: await new StorySaveService(dependencies.database, session).list() });
    }
    const body = await readSmallJson(request, 8192);
    if (url.pathname === "/api/following" && ["POST", "DELETE"].includes(request.method)) return reply(await following.set(body, request.method === "POST"));
    if (url.pathname === "/api/preferences" && request.method === "PATCH") return reply(await preferences.update(body));
    if (url.pathname === "/api/saved" && ["POST", "DELETE"].includes(request.method)) return reply(await new StorySaveService(dependencies.database, session).set(body, request.method === "POST"));
    if (url.pathname === "/api/sync" && request.method === "POST") return reply(await new StorySaveService(dependencies.database, session).merge(body));
    if (url.pathname === "/api/likes" && ["POST", "DELETE"].includes(request.method)) return reply(await new StoryLikeService(dependencies.database, session).set(body, request.method === "POST"));
    return reply({ error: "Yêu cầu không được hỗ trợ." }, 405);
  } catch (error) {
    if (error instanceof InvalidRequestBody) return reply({ error: accountErrorText.INVALID_INPUT, code: "INVALID_INPUT" }, 400);
    if (error instanceof AccountError) return reply({ error: accountErrorText[error.code], code: error.code }, error.status);
    dependencies.onError?.();
    return reply({ error: accountErrorText.UNAVAILABLE, code: "UNAVAILABLE" }, 503);
  }
}
