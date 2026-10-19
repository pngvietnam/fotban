import "server-only";
import { headers } from "next/headers";
import { activeUser } from "../lib/auth";
import { getDatabase } from "../lib/db";
import { logger } from "../lib/logger";
import { prismaSyncDatabase } from "../lib/sync-database";
import type { FeedGroupView } from "../types/feed-card";
import type { FixtureRow } from "../types/league-hub";
import { FollowingService } from "./following";
import { followFixtures, summarizeFollows, type FollowSummary } from "./following-feed";
import { readFeedList } from "./feed-page-data";

export type MyTeams = { kind: "empty" } | { kind: "ready"; summary: FollowSummary; upcoming: FixtureRow[]; groups: FeedGroupView[] };
/**
 * Homepage block for a signed-in reader. Guests (no session cookie) cost nothing: the session is not
 * even looked up. Any failure returns null so the public homepage always renders without this block.
 */
export async function readMyTeams(now = new Date()): Promise<MyTeams | null> {
  try {
    const requestHeaders = await headers();
    if (!/session_token/i.test(requestHeaders.get("cookie") ?? "")) return null;
    const user = await activeUser(requestHeaders);
    const db = getDatabase();
    if (!user || !db) return null;
    const database = prismaSyncDatabase(db);
    const follows = await new FollowingService(database, async () => user).list();
    if (!follows.length) return { kind: "empty" };
    const summary = await summarizeFollows(database, follows);
    const [fixtures, news] = await Promise.all([
      followFixtures(database, summary.clubs.map((club) => club.id), now, 3),
      readFeedList({ league: "all", offset: 0, follow: { entityIds: summary.entityIds, leagueSlugs: summary.leagueSlugs } }),
    ]);
    return { kind: "ready", summary, upcoming: fixtures.upcoming, groups: news.kind === "ready" ? news.data.groups.slice(0, 3) : [] };
  } catch { logger.warn({ event: "my_teams_unavailable" }); return null; }
}
