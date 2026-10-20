import "server-only";
import { headers } from "next/headers";
import { activeUser } from "../lib/auth";
import { getDatabase } from "../lib/db";
import { logger } from "../lib/logger";
import { prismaSyncDatabase } from "../lib/sync-database";
import type { FeedFilters } from "../types/feed-card";
import { FollowingService, type ActiveUser } from "./following";
import { followFixtures, summarizeFollows, type FollowFixtures } from "./following-feed";

export type ViewerFollows = { signedIn: boolean; follow?: NonNullable<FeedFilters["follow"]>; fixtures?: FollowFixtures; clubs?: { id: string; name: string }[] };

/** What a signed-in viewer follows, if anything; any failure just means the generic top stories. */
export async function viewerFollows(now: Date, options: { fixtures?: boolean } = {}): Promise<ViewerFollows> {
  let user: ActiveUser | null = null;
  try { user = await activeUser(await headers()); } catch { return { signedIn: false }; }
  const db = getDatabase();
  if (!user || !db) return { signedIn: Boolean(user) };
  try {
    const database = prismaSyncDatabase(db);
    const follows = await new FollowingService(database, async () => user).list();
    if (!follows.length) return { signedIn: true };
    const summary = await summarizeFollows(database, follows);
    const follow = { entityIds: summary.entityIds, leagueSlugs: summary.leagueSlugs };
    return options.fixtures === false ? { signedIn: true, follow, clubs: summary.clubs } : { signedIn: true, follow, clubs: summary.clubs, fixtures: await followFixtures(database, summary.clubs.map((club) => club.id), now) };
  } catch { logger.warn({ event: "viewer_follows_unavailable" }); return { signedIn: true }; }
}
