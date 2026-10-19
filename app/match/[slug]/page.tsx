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

export const metadata: Metadata = { title: "Chi tiết trận đấu | Football Morning Brief" };
export const dynamic = "force-dynamic";
export default async function MatchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
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
  return <MatchShell>{result.kind === "ready" ? <MatchDetailView match={result.match} highlight={highlight} now={new Date()} /> : <><h1 className="text-2xl font-bold">Chi tiết trận đấu</h1><MatchState kind="error" /></>}</MatchShell>;
}
