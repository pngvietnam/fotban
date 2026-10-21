import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { leagueHref, leagueTabLabels, parseLeagueQuery, tabsFor } from "@/lib/league-presentation";
import { leagueZones } from "@/lib/league-zones";
import { clubPath } from "@/lib/club-presentation";
import { isLeagueSlug, leagueNames } from "@/services/league-hub";
import { readLeague } from "@/services/league-page-data";
import { readFeedList } from "@/services/feed-page-data";
import { viewerFollows } from "@/services/viewer-follows";
import { NewsShell } from "@/components/news/news-shell";
import { NewsState } from "@/components/news/news-state";
import { FollowLink } from "@/components/account/follow-link";
import { BackLink } from "@/components/shell/back-link";
import { Crest, DomainTabs, Empty, StandingsPanel, StoryGrid } from "@/components/domain/domain-ui";
import { KnockoutBracket } from "@/components/league/knockout-bracket";
import { timelineLeague } from "@/lib/match-timeline";
import { clubTallies, honoursSource, seasonHonours } from "@/services/league-honours";
import { SeasonsTab, ClubSeasonCard, DayCard, FixtureViewSwitch, LeagueHeader, NewsList, RoundCard, ScorersTable, StandingsMini, TopScorers } from "@/components/league/league-overview";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
// Tabs that show publisher text are not indexed; the standings, fixtures, statistics and clubs tabs are data pages.
const indexable = new Set(["bang-xep-hang", "lich-thi-dau", "loai-truc-tiep", "thong-ke", "mua-giai", "doi-bong"]);
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!isLeagueSlug(slug)) return { title: "Không tìm thấy giải đấu | Fotban", robots: { index: false } };
  const query = parseLeagueQuery(await searchParams, new Date());
  return { title: `${leagueNames[slug].name} | Fotban`, description: `Lịch thi đấu, bảng xếp hạng, vua phá lưới và tin tức ${leagueNames[slug].name}.`,
    alternates: { canonical: new URL(leagueHref(slug, query ? { tab: query.tab } : {}), env.NEXT_PUBLIC_APP_URL).href }, robots: { index: Boolean(query && indexable.has(query.tab)), follow: true } };
}

/**
 * A league page. Tổng quan answers "what is happening in this competition now": the current round's matches
 * first, the table and top scorers beside them, the latest stories after. Each block links to its full tab.
 */
export default async function LeaguePage({ params, searchParams }: Props) {
  const { slug } = await params;
  if (!isLeagueSlug(slug)) notFound();
  const now = new Date();
  const query = parseLeagueQuery(await searchParams, now);
  if (!query || !tabsFor(slug).includes(query.tab)) return <NewsShell section="league"><NewsState kind="invalid" /></NewsShell>;
  const needsFeed = ["tin-tuc", "tong-quan", "chuyen-nhuong"].includes(query.tab);
  const [result, feed, viewer] = await Promise.all([
    readLeague(slug, query, now),
    needsFeed ? readFeedList({ league: slug, offset: query.tab === "tong-quan" ? 0 : query.offset, ...(query.tab === "chuyen-nhuong" ? { storyType: "TRANSFER" } : {}) }) : null,
    viewerFollows(now, { fixtures: false }),
  ]);
  if (result.kind === "not-found") notFound();
  if (result.kind === "error") return <NewsShell section="league"><h1 className="sr-only">Giải đấu chưa khả dụng</h1><NewsState kind="error" /></NewsShell>;
  const { league, leaders, rounds, round, standings, clubs } = result.data;
  const zones = leagueZones[slug];
  const followed = viewer.clubs?.map((club) => club.id) ?? [];
  const href = (offset: number) => leagueHref(slug, { tab: query.tab, offset });
  return <NewsShell section="league" back={<BackLink fallback="/leagues">Giải đấu</BackLink>}><div className="domain-page lg-page">
    <LeagueHeader league={league} leaders={leaders} rounds={rounds} action={<FollowLink type="COMPETITION" entityId={league.id} name={league.name} variant="button" />} />
    <DomainTabs label="Mục của giải đấu" active={query.tab} tabs={tabsFor(slug).map((tab) => ({ key: tab, label: leagueTabLabels[tab], href: leagueHref(slug, { tab }) }))} />
    {query.tab === "tong-quan" && <div className="lg-overview">
      <div className="lg-round-area"><RoundCard slug={slug} rounds={rounds} round={round} tab="tong-quan" more={{ href: leagueHref(slug, { tab: "lich-thi-dau", round: round?.number }), label: "Toàn bộ lịch thi đấu →" }} /></div>
      <aside className="lg-side" aria-label="Bảng xếp hạng và vua phá lưới">
        <StandingsMini slug={slug} data={standings} zones={zones} highlight={followed} />
        <TopScorers slug={slug} leaders={leaders} />
      </aside>
      <div className="lg-news-area"><NewsList result={feed} now={now} href={leagueHref(slug, { tab: "tin-tuc" })} /></div>
    </div>}
    {query.tab === "bang-xep-hang" && standings && <StandingsPanel data={standings} leagueName={league.name} seasonName={league.seasonName} highlight={followed} zones={zones} />}
    {query.tab === "lich-thi-dau" && <div className="lg-fixtures">
      <FixtureViewSwitch slug={slug} view={query.view} />
      {query.view === "vong" && <RoundCard slug={slug} rounds={rounds} round={round} tab="lich-thi-dau" />}
      {query.view === "ngay" && <DayCard slug={slug} days={result.data.days} />}
      {query.view === "doi" && <ClubSeasonCard slug={slug} clubs={clubs ?? []} club={result.data.club} />}
    </div>}
    {query.tab === "loai-truc-tiep" && <KnockoutBracket standings={standings} currentRound={leaders?.currentMatchday ?? rounds.current} totalRounds={timelineLeague(slug)?.rounds ?? 8} />}
    {query.tab === "mua-giai" && <SeasonsTab slug={slug} honours={seasonHonours(slug).slice(0, 40)} tallies={clubTallies(seasonHonours(slug))} source={honoursSource(slug)} finals={slug === "champions-league"} />}
    {query.tab === "thong-ke" && <ScorersTable leaders={leaders} />}
    {query.tab === "tin-tuc" && <StoryGrid result={feed!} now={now} offset={query.offset} href={href} empty={{ title: `Chưa có tin ${league.name}`, text: "Chưa có tin mới trong 7 ngày gần đây." }} />}
    {query.tab === "doi-bong" && (clubs?.length ? <div className="dp-club-grid">{clubs.map((club) => <Link className="dp-club-tile" key={club.clubId} href={clubPath(club.clubId)}><Crest url={club.crestUrl} name={club.name} /><h3>{club.shortName?.trim() || club.name}</h3><p>{club.position ? `Hạng ${club.position}${club.points !== null ? ` · ${club.points} điểm` : ""}` : league.name}</p><span>Khám phá CLB ↗</span></Link>)}</div> : <Empty title="Chưa có danh sách đội bóng" text="Danh sách sẽ xuất hiện khi dữ liệu mùa giải được đồng bộ." />)}
    {query.tab === "chuyen-nhuong" && <StoryGrid result={feed!} now={now} offset={query.offset} href={href} empty={{ title: "Chưa có tin chuyển nhượng", text: "Chưa có tin chuyển nhượng được báo chí đưa trong 7 ngày gần đây." }} />}
  </div></NewsShell>;
}
