import type { Metadata } from "next";
import { getDatabase } from "@/lib/db";
import { logger } from "@/lib/logger";
import { prismaSyncDatabase } from "@/lib/sync-database";
import { parseTimeline } from "@/lib/match-timeline";
import { readTimeline, readTimelineSidebar, timelineScope, type TimelineData, type TimelineSidebar } from "@/services/match-timeline";
import { listMatchesOnDays } from "@/services/match-queries";
import { viewerFollows } from "@/services/viewer-follows";
import type { MatchSummary } from "@/types/match-ui";
import { MatchShell } from "@/components/matches/match-shell";
import { MatchTimeline } from "@/components/matches/match-timeline";
import { MatchState } from "@/components/matches/match-state";

export const metadata: Metadata = { title: "Trận đấu | Fotban" };
export const dynamic = "force-dynamic";
export default async function MatchesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const now = new Date();
  const parsed = parseTimeline(await searchParams, now);
  if (!parsed.success) return <MatchShell><MatchState kind="invalid-filter" /></MatchShell>;
  const view = parsed.data;
  const viewer = await viewerFollows(now, { fixtures: false });
  const clubs = viewer.clubs ?? [];
  const scope = timelineScope(view, clubs.map((club) => club.id));
  let data: TimelineData | null = null; let sidebar: TimelineSidebar | null = null;
  const db = getDatabase();
  if (db) {
    const tx = prismaSyncDatabase(db);
    try { data = await readTimeline(tx, view, scope, now, (days, within) => listMatchesOnDays(db, days, within) as Promise<MatchSummary[]>); } catch { logger.error({ requestId: crypto.randomUUID() }, "matches.ui_list_failed"); }
    // The right column is optional: the timeline still renders without it.
    try { sidebar = await readTimelineSidebar(tx, view, scope, clubs.map((club) => club.id), now); } catch { logger.warn({ event: "matches.ui_sidebar_unavailable" }); }
  } else logger.error({ requestId: crypto.randomUUID() }, "matches.ui_list_failed");
  return <MatchShell><MatchTimeline view={view} data={data} sidebar={sidebar} follow={{ signedIn: viewer.signedIn, clubs }} now={now} /></MatchShell>;
}
