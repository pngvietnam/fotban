import "server-only";
import { headers } from "next/headers";
import { activeUser } from "../lib/auth";
import { getDatabase } from "../lib/db";
import { logger } from "../lib/logger";
import { prismaSyncDatabase } from "../lib/sync-database";
import type { FeedGroupView } from "../types/feed-card";
import { likeCounts, likedStories } from "./story-likes";

export type StoryLikeState = { signedIn: boolean; counts: Record<string, number>; liked: Record<string, boolean> };
const articleIds = (group: FeedGroupView) => [group.lead.articleId, ...group.others.map((card) => card.articleId)];

/** Like counts (from signed-in readers only) and this reader's own likes for the stories on a page, keyed by story. */
export async function viewerStoryLikes(groups: FeedGroupView[]): Promise<StoryLikeState> {
  const empty: StoryLikeState = { signedIn: false, counts: {}, liked: {} };
  const db = getDatabase();
  if (!db || !groups.length) return empty;
  try {
    const database = prismaSyncDatabase(db);
    const stories = groups.map(articleIds);
    const user = await activeUser(await headers()).catch(() => null);
    const [counts, liked] = await Promise.all([likeCounts(database, stories), user ? likedStories(database, user.id, stories) : stories.map(() => false)]);
    return { signedIn: Boolean(user), counts: Object.fromEntries(groups.map((group, index) => [group.key, counts[index]])), liked: Object.fromEntries(groups.map((group, index) => [group.key, liked[index]])) };
  } catch { logger.warn({ event: "story_likes_unavailable" }); return empty; }
}
