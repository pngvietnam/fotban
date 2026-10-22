import "server-only";
import { cookies, headers } from "next/headers";
import { activeUser } from "../lib/auth";
import { getDatabase } from "../lib/db";
import { logger } from "../lib/logger";
import { prismaSyncDatabase } from "../lib/sync-database";
import type { FeedFilters } from "../types/feed-card";
import { FollowingService, type ActiveUser } from "./following";
import { guestFollowCookie, parseGuestFollowCookie, resolveGuestFollows } from "./guest-follows";
import { followFixtures, summarizeFollows, type FollowFixtures } from "./following-feed";

export type ViewerFollows = { signedIn: boolean; follow?: NonNullable<FeedFilters["follow"]>; fixtures?: FollowFixtures; clubs?: { id: string; name: string }[] };

/** What a signed-in viewer follows, if anything; any failure just means the generic top stories. */
export async function viewerFollows(now: Date, options: { fixtures?: boolean } = {}): Promise<ViewerFollows> {
  let user: ActiveUser | null = null;
  try { user = await activeUser(await headers()); } catch { return { signedIn: false }; }
  const db = getDatabase();
  if (!db) return { signedIn: Boolean(user) };
  try {
    const database = prismaSyncDatabase(db);
    // A guest's follows live in this browser and in a cookie, so the server can show them too.
    const follows = user ? await new FollowingService(database, async () => user).list() : await resolveGuestFollows(database, parseGuestFollowCookie((await cookies()).get(guestFollowCookie)?.value));
    if (!follows.length) return { signedIn: Boolean(user) };
    const signedIn = Boolean(user);
    const summary = await summarizeFollows(database, follows);
    const follow = { entityIds: summary.entityIds, leagueSlugs: summary.leagueSlugs };
    return options.fixtures === false ? { signedIn, follow, clubs: summary.clubs } : { signedIn, follow, clubs: summary.clubs, fixtures: await followFixtures(database, summary.clubs.map((club) => club.id), now) };
  } catch { logger.warn({ event: "viewer_follows_unavailable" }); return { signedIn: Boolean(user) }; }
}
