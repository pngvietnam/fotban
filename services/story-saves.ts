import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AccountError } from "../lib/auth-policy";
import { feedArticleIdFromSlug } from "../lib/feed-card-presentation";
import type { SyncDatabase } from "../lib/sync-database";
import { requireAccount, type SessionResolver } from "./following";

export type AccountSavedStory = { slug: string; title: string; publisher: string; savedAt: string };
const slugSchema = z.object({ slug: z.string().max(80) }).strict();
const mergeSchema = z.object({ saved: z.array(z.string().max(80)).max(200), liked: z.array(z.uuid()).max(500) }).strict();
const PUBLISHED = `EXISTS (SELECT 1 FROM "FeedCard" f WHERE f."articleId"=a.id AND f.status='PUBLISHED')`;

/** Stories a signed-in reader saved, and the one-time merge of what a guest saved or liked in the browser. Only published feed stories count. */
export class StorySaveService {
  constructor(private db: SyncDatabase, private session: SessionResolver) {}
  async list(): Promise<AccountSavedStory[]> {
    const user = await requireAccount(this.session);
    const rows = await this.db.query<{ articleId: string; title: string; publisher: string; savedAt: string | Date }>(
      `SELECT a.id AS "articleId",a."titleOriginal" AS title,s.name AS publisher,v."createdAt" AS "savedAt" FROM "StorySave" v JOIN "Article" a ON a.id=v."articleId" JOIN "NewsSource" s ON s.id=a."sourceId"
       WHERE v."userId"=$1::uuid AND ${PUBLISHED} ORDER BY v."createdAt" DESC LIMIT 200`, [user.id]);
    return rows.map((row) => ({ slug: `bao-${row.articleId}`, title: row.title, publisher: row.publisher, savedAt: new Date(row.savedAt).toISOString() }));
  }
  async set(input: unknown, saved: boolean) {
    const user = await requireAccount(this.session);
    const parsed = slugSchema.safeParse(input);
    const articleId = parsed.success ? feedArticleIdFromSlug(parsed.data.slug) : null;
    if (!parsed.success || !articleId) throw new AccountError("INVALID_INPUT", 400);
    return this.db.transaction(async (tx) => {
      if (saved) {
        const [story] = await tx.query<{ id: string }>(`SELECT a.id FROM "Article" a WHERE a.id=$1::uuid AND ${PUBLISHED}`, [articleId]);
        if (!story) throw new AccountError("NOT_FOUND", 404);
        await tx.query(`INSERT INTO "StorySave" (id,"userId","articleId") VALUES ($1::uuid,$2::uuid,$3::uuid) ON CONFLICT ("userId","articleId") DO NOTHING`, [randomUUID(), user.id, articleId]);
      } else await tx.query(`DELETE FROM "StorySave" WHERE "userId"=$1::uuid AND "articleId"=$2::uuid`, [user.id, articleId]);
      return { slug: parsed.data.slug, saved };
    });
  }
  /** Adds a guest's browser lists to the account; stories that are gone or unpublished are skipped, never an error. */
  async merge(input: unknown) {
    const user = await requireAccount(this.session);
    const parsed = mergeSchema.safeParse(input);
    if (!parsed.success) throw new AccountError("INVALID_INPUT", 400);
    const saved = [...new Set(parsed.data.saved.flatMap((slug) => feedArticleIdFromSlug(slug) ?? []))];
    const liked = [...new Set(parsed.data.liked)];
    return this.db.transaction(async (tx) => {
      const savedRows = saved.length ? await tx.query(`INSERT INTO "StorySave" (id,"userId","articleId") SELECT gen_random_uuid(),$1::uuid,a.id FROM "Article" a WHERE a.id=ANY($2::uuid[]) AND ${PUBLISHED} ON CONFLICT ("userId","articleId") DO NOTHING RETURNING id`, [user.id, saved]) : [];
      const likedRows = liked.length ? await tx.query(`INSERT INTO "StoryLike" (id,"userId","articleId") SELECT gen_random_uuid(),$1::uuid,a.id FROM "Article" a WHERE a.id=ANY($2::uuid[]) AND ${PUBLISHED} ON CONFLICT ("userId","articleId") DO NOTHING RETURNING id`, [user.id, liked]) : [];
      return { saved: savedRows.length, liked: likedRows.length };
    });
  }
}
