import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDatabase } from "@/lib/db";
import { logger } from "@/lib/logger";
import { loadMatchDetail, readMatchBySlug } from "@/services/match-ui-data";
import { MatchShell } from "@/components/matches/match-shell";
import { MatchDetailView } from "@/components/matches/match-detail";
import { MatchState } from "@/components/matches/match-state";
import { readVerifiedHighlight } from "@/services/video-query";
import { VideoStore } from "@/services/video-store";
import { prismaSyncDatabase } from "@/lib/sync-database";
import type { ReactNode } from "react";
import { parseMatchTab } from "@/lib/match-tabs";
import { pickMatchReview, type MatchReview } from "@/lib/match-review";
import { matchHub, type MatchHub } from "@/services/match-hub";
import { readFeedList } from "@/services/feed-page-data";
import { FeedSection } from "@/components/news/feed-section";

export const metadata: Metadata = { title: "Chi tiết trận đấu | Football Morning Brief" };
export const dynamic = "force-dynamic";
export default async function MatchPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const tab = parseMatchTab((await searchParams).tab);
  const result = await loadMatchDetail(slug, async () => {
    const db = getDatabase();
    if (!db) throw new Error("Database unavailable");
    return readMatchBySlug(db, slug);
  }, () => logger.error({ requestId: crypto.randomUUID() }, "matches.ui_detail_failed"));
  if (result.kind === "not-found") notFound();
  let highlight = null;
  if (result.kind === "ready" && result.match.status === "FINISHED") {
    try { const db = getDatabase(); if (db) highlight = await readVerifiedHighlight(new VideoStore(prismaSyncDatabase(db)), result.match.id); }
    catch { logger.warn({ requestId: crypto.randomUUID() }, "video.ui_highlight_unavailable"); }
  }
  if (!tab) notFound();
  const now = new Date();
  let hub: MatchHub | null = null; let news: ReactNode = null; let review: MatchReview | null = null;
  if (result.kind === "ready") {
    const { match } = result;
    try { const db = getDatabase(); if (db) hub = await matchHub(prismaSyncDatabase(db), match, now); }
    catch { logger.warn({ requestId: crypto.randomUUID() }, "matches.ui_hub_unavailable"); }
    const clubIds = [match.homeClub?.id, match.awayClub?.id].filter((id): id is string => Boolean(id));
    if (tab === "du-kien" && clubIds.length) {
      const follow = { entityIds: clubIds, leagueSlugs: [] };
      const feed = await readFeedList({ league: "all", offset: 0, follow });
      if (feed.kind === "ready") {
        // The review can sit past the first page when the clubs have many stories; look at up to three pages.
        const groups = [...feed.data.groups];
        for (let next = feed.data.nextOffset, pages = 1; next !== null && pages < 3; pages++) {
          const more = await readFeedList({ league: "all", offset: next, follow });
          if (more.kind !== "ready") break;
          groups.push(...more.data.groups); next = more.data.nextOffset;
        }
        review = pickMatchReview(groups,{ slug: match.slug, kickoffAt: match.kickoffAt, status: match.status, homeClubId: match.homeClub?.id, awayClubId: match.awayClub?.id });
        const rest = feed.data.groups.filter((group) => group.key !== review?.group.key).slice(0, 4);
        if (rest.length) news = <FeedSection result={{ kind: "ready", data: { groups: rest, nextOffset: null } }} filters={{ league: "all", offset: 0 }} now={now} />;
      }
    }
  }
  return <MatchShell>{result.kind === "ready" ? <MatchDetailView match={result.match} highlight={highlight} now={now} tab={tab} hub={hub} news={news} review={review} /> : <><h1 className="text-2xl font-bold">Chi tiết trận đấu</h1><MatchState kind="error" /></>}</MatchShell>;
}
