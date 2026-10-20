import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { parsePlayerQuery, playerHref } from "@/lib/player-presentation";
import { playerIdFromSlug } from "@/services/player-hub";
import { readPlayer } from "@/services/player-page-data";
import { readFeedList } from "@/services/feed-page-data";
import { NewsShell } from "@/components/news/news-shell";
import { NewsState } from "@/components/news/news-state";
import { FeedSection } from "@/components/news/feed-section";
import { PlayerHeader } from "@/components/player/player-hub";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params; const query = parsePlayerQuery(await searchParams);
  const result = playerIdFromSlug(slug) && query ? await readPlayer(slug) : null;
  if (result?.kind !== "ready" || !query) return { title: "Không tìm thấy cầu thủ | Fotban", robots: { index: false, follow: false } };
  const { player } = result.data;
  // Pages show publisher text, so they are not indexed; the canonical stays the tab URL.
  return { title: `${player.name} | Fotban`, description: `Tin tức và chuyển nhượng về ${player.name} (${player.club.name}).`, alternates: { canonical: new URL(playerHref(slug, { tab: query.tab }), env.NEXT_PUBLIC_APP_URL).href }, robots: { index: false, follow: true } };
}
export default async function PlayerPage({ params, searchParams }: Props) {
  const { slug } = await params;
  if (!playerIdFromSlug(slug)) notFound();
  const query = parsePlayerQuery(await searchParams);
  if (!query) return <NewsShell section="league"><NewsState kind="invalid" /></NewsShell>;
  const now = new Date();
  const result = await readPlayer(slug, now);
  if (result.kind === "not-found") notFound();
  if (result.kind === "error") return <NewsShell section="league"><h1 className="sr-only">Cầu thủ chưa khả dụng</h1><NewsState kind="error" /></NewsShell>;
  const { player, fixtures } = result.data;
  const follow = { entityIds: [player.playerId], leagueSlugs: [] };
  const href = (offset: number) => playerHref(slug, { tab: query.tab, offset });
  const transfers = query.tab === "chuyen-nhuong";
  const feed = await readFeedList({ league: "all", offset: query.tab === "tong-quan" ? 0 : query.offset, follow, ...(transfers ? { storyType: "TRANSFER" } : {}) });
  const shown = query.tab === "tong-quan" && feed.kind === "ready" ? { kind: "ready" as const, data: { groups: feed.data.groups.slice(0, 6), nextOffset: null } } : feed;
  return <NewsShell section="league">
    <PlayerHeader player={player} fixtures={fixtures} active={query.tab} now={now} />
    <FeedSection result={shown} filters={{ league: "all", offset: query.offset, follow, ...(transfers ? { storyType: "TRANSFER" } : {}) }} now={now} href={href}
      emptyText={transfers ? `Chưa có tin chuyển nhượng về ${player.name} trong 7 ngày gần đây.` : `Chưa có tin về ${player.name} trong 7 ngày gần đây.`} />
  </NewsShell>;
}
