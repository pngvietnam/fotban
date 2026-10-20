import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { leagueHref, parseLeagueQuery } from "@/lib/league-presentation";
import { isLeagueSlug, leagueNames } from "@/services/league-hub";
import { readLeague } from "@/services/league-page-data";
import { readFeedList } from "@/services/feed-page-data";
import { NewsShell } from "@/components/news/news-shell";
import { NewsState } from "@/components/news/news-state";
import { FeedSection } from "@/components/news/feed-section";
import { ClubGrid, FixtureList, LeagueHeader, StandingsTable, UpcomingStrip } from "@/components/league/league-hub";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
// Tabs that show publisher text are not indexed; the standings, fixtures and clubs tabs are FotBan's own data.
const indexable = new Set(["bang-xep-hang", "lich-thi-dau", "doi-bong"]);
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!isLeagueSlug(slug)) return { title: "Không tìm thấy giải đấu | Fotban", robots: { index: false } };
  const query = parseLeagueQuery(await searchParams, new Date());
  return { title: `${leagueNames[slug].name} | Fotban`, description: `Tin tức, bảng xếp hạng, lịch thi đấu và đội bóng ${leagueNames[slug].name}.`,
    alternates: { canonical: new URL(leagueHref(slug, query ? { tab: query.tab } : {}), env.NEXT_PUBLIC_APP_URL).href }, robots: { index: Boolean(query && indexable.has(query.tab)), follow: true } };
}
export default async function LeaguePage({ params, searchParams }: Props) {
  const { slug } = await params;
  if (!isLeagueSlug(slug)) notFound();
  const now = new Date();
  const query = parseLeagueQuery(await searchParams, now);
  if (!query) return <NewsShell section="league"><NewsState kind="invalid" /></NewsShell>;
  const needsFeed = ["tin-tuc", "tong-quan", "chuyen-nhuong"].includes(query.tab);
  const feedLimit = query.tab === "tong-quan" ? 0 : query.offset;
  const [result, feed] = await Promise.all([readLeague(slug, query, now), needsFeed ? readFeedList({ league: slug, offset: feedLimit, ...(query.tab === "chuyen-nhuong" ? { storyType: "TRANSFER" } : {}) }) : null]);
  if (result.kind === "not-found") notFound();
  if (result.kind === "error") return <NewsShell section="league"><h1 className="sr-only">Giải đấu chưa khả dụng</h1><NewsState kind="error" /></NewsShell>;
  const { league, standings, fixtures, upcoming, clubs } = result.data;
  const href = (offset: number) => leagueHref(slug, { tab: query.tab, offset });
  return <NewsShell section="league">
    <LeagueHeader league={league} active={query.tab} from={query.tab === "lich-thi-dau" ? query.from : undefined} />
    <div className="space-y-6">
      {query.tab === "tin-tuc" && feed && <FeedSection result={feed} filters={{ league: slug, offset: query.offset }} now={now} href={href} emptyText={`Chưa có tin ${league.name} trong 7 ngày gần đây.`} />}
      {query.tab === "tong-quan" && <>
        {upcoming && <UpcomingStrip fixtures={upcoming} league={league} />}
        {standings && <StandingsTable data={standings} league={league} limit={10} />}
        {feed && <FeedSection result={feed.kind === "ready" ? { kind: "ready", data: { groups: feed.data.groups.slice(0, 6), nextOffset: null } } : feed} filters={{ league: slug, offset: 0 }} now={now} href={href} />}
      </>}
      {query.tab === "bang-xep-hang" && standings && <StandingsTable data={standings} league={league} />}
      {query.tab === "lich-thi-dau" && fixtures && <FixtureList fixtures={fixtures} league={league} from={query.from} now={now} />}
      {query.tab === "doi-bong" && clubs && <ClubGrid clubs={clubs} />}
      {query.tab === "chuyen-nhuong" && feed && <FeedSection result={feed} filters={{ league: slug, offset: query.offset, storyType: "TRANSFER" }} now={now} href={href} emptyText="Chưa có tin chuyển nhượng được báo chí đưa trong 7 ngày gần đây." />}
    </div>
  </NewsShell>;
}
