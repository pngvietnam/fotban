import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AccountError } from "../lib/auth-policy";
import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
import { requireAccount, type SessionResolver } from "./following";

const likeSchema = z.object({ articleId: z.uuid() }).strict();

/** Likes of signed-in readers. A like on any card of a story counts for the whole story. */
export class StoryLikeService {
  constructor(private db: SyncDatabase, private session: SessionResolver) {}
  async set(input: unknown, liked: boolean) {
    const user = await requireAccount(this.session);
    const parsed = likeSchema.safeParse(input);
    if (!parsed.success) throw new AccountError("INVALID_INPUT", 400);
    const { articleId } = parsed.data;
    return this.db.transaction(async (tx) => {
      // Only published feed stories can be liked.
      const [card] = await tx.query<{ articleId: string }>(`SELECT "articleId" FROM "FeedCard" WHERE "articleId"=$1::uuid AND status='PUBLISHED'`, [articleId]);
      if (!card) throw new AccountError("NOT_FOUND", 404);
      if (liked) await tx.query(`INSERT INTO "StoryLike" (id,"userId","articleId") VALUES ($1::uuid,$2::uuid,$3::uuid) ON CONFLICT ("userId","articleId") DO NOTHING`, [randomUUID(), user.id, articleId]);
      else await tx.query(`DELETE FROM "StoryLike" WHERE "userId"=$1::uuid AND "articleId"=$2::uuid`, [user.id, articleId]);
      const [count] = await likeCounts(tx, [[articleId]]);
      return { articleId, liked, count };
    });
  }
}

/** Distinct readers who liked any card of each story; `stories` lists the article ids of each story. */
export async function likeCounts(tx: SqlExecutor, stories: string[][]): Promise<number[]> {
  const ids = [...new Set(stories.flat())];
  if (!ids.length) return stories.map(() => 0);
  const rows = await tx.query<{ articleId: string; userId: string }>(`SELECT "articleId","userId" FROM "StoryLike" WHERE "articleId"=ANY($1::uuid[])`, [ids]);
  return stories.map((articleIds) => new Set(rows.filter((row) => articleIds.includes(row.articleId)).map((row) => row.userId)).size);
}
/** Which stories this reader has liked (by any of their cards). */
export async function likedStories(tx: SqlExecutor, userId: string, stories: string[][]): Promise<boolean[]> {
  const ids = [...new Set(stories.flat())];
  if (!ids.length) return stories.map(() => false);
  const rows = await tx.query<{ articleId: string }>(`SELECT "articleId" FROM "StoryLike" WHERE "userId"=$1::uuid AND "articleId"=ANY($2::uuid[])`, [userId, ids]);
  const liked = new Set(rows.map((row) => row.articleId));
  return stories.map((articleIds) => articleIds.some((id) => liked.has(id)));
}
