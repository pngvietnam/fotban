import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { fixtureWindow, leagueHref, parseLeagueQuery } from "@/lib/league-presentation";
import { clubPath } from "@/lib/club-presentation";
import { timelineLeague } from "@/lib/match-timeline";
import { leagueTabs } from "@/types/league-hub";
import { isLeagueSlug, leagueNames } from "@/services/league-hub";
import { readLeague } from "@/services/league-page-data";
import { readFeedList } from "@/services/feed-page-data";
import { viewerFollows } from "@/services/viewer-follows";
import { NewsShell } from "@/components/news/news-shell";
import { NewsState } from "@/components/news/news-state";
import { FollowLink } from "@/components/account/follow-link";
import { BackLink } from "@/components/shell/back-link";
import { Crest, DomainTabs, Empty, EntityHeader, FixturePanel, StandingsPanel, StoryGrid } from "@/components/domain/domain-ui";
import { leagueTabLabels } from "@/lib/league-presentation";
import { formatMatchDate, matchDayKey } from "@/lib/match-presentation";
import { dayNumbers } from "@/lib/match-timeline";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
// Tabs that show publisher text are not indexed; the standings, fixtures and clubs tabs are Fotban's own data.
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
  const [result, feed, viewer] = await Promise.all([
    readLeague(slug, query, now),
    needsFeed ? readFeedList({ league: slug, offset: query.tab === "tong-quan" ? 0 : query.offset, ...(query.tab === "chuyen-nhuong" ? { storyType: "TRANSFER" } : {}) }) : null,
    viewerFollows(now, { fixtures: false }),
  ]);
  if (result.kind === "not-found") notFound();
  if (result.kind === "error") return <NewsShell section="league"><h1 className="sr-only">Giải đấu chưa khả dụng</h1><NewsState kind="error" /></NewsShell>;
  const { league, standings, fixtures, upcoming, recent, clubs } = result.data;
  const meta = timelineLeague(slug)!;
  const followed = viewer.clubs?.map((club) => club.id) ?? [];
  const href = (offset: number) => leagueHref(slug, { tab: query.tab, offset });
  const window = query.tab === "lich-thi-dau" ? fixtureWindow(query.from, now) : null;
  const days = fixtures ? [...new Map(fixtures.map((fixture) => [matchDayKey(fixture.kickoffAt), fixtures.filter((item) => matchDayKey(item.kickoffAt) === matchDayKey(fixture.kickoffAt))])).entries()] : [];
  return <NewsShell section="league" back={<BackLink fallback="/leagues">Giải đấu</BackLink>}><div className="domain-page">
    <EntityHeader mark={meta.mark} kicker={`GIẢI ĐẤU${league.seasonName ? ` · MÙA ${league.seasonName.replace(/^(\d{4})\/(\d{4})$/, (_, a, b) => `${a}/${b.slice(2)}`)}` : ""}`} title={league.name} subtitle={`${league.country} · Tin tức, lịch đấu và những cuộc đua đáng theo dõi.`}
      action={<FollowLink type="COMPETITION" entityId={league.id} name={league.name} variant="button" />} />
    <DomainTabs label="Mục của giải đấu" active={query.tab} tabs={leagueTabs.map((tab) => ({ key: tab, label: leagueTabLabels[tab], href: leagueHref(slug, { tab, ...(tab === "lich-thi-dau" && query.from ? { from: query.from } : {}) }) }))} />
    {query.tab === "tong-quan" && <>
      <StoryGrid result={feed!} now={now} limit={6} />
      <div className="dp-two-columns">
        <div><FixturePanel title="Lịch đấu & kết quả" fixtures={[...(upcoming ?? []), ...(recent ?? [])]} action={{ href: leagueHref(slug, { tab: "lich-thi-dau" }), label: "Xem tất cả →" }} empty="Chưa có lịch thi đấu hay kết quả gần đây." /></div>
        {standings && <StandingsPanel data={standings} leagueName={league.name} seasonName={league.seasonName} limit={10} highlight={followed} />}
      </div>
    </>}
    {query.tab === "tin-tuc" && <StoryGrid result={feed!} now={now} offset={query.offset} href={href} empty={{ title: `Chưa có tin ${league.name}`, text: "Chưa có tin mới trong 7 ngày gần đây." }} />}
    {query.tab === "bang-xep-hang" && standings && <StandingsPanel data={standings} leagueName={league.name} seasonName={league.seasonName} highlight={followed} />}
    {query.tab === "lich-thi-dau" && fixtures && window && <>
      <nav className="dp-week" aria-label="Chọn tuần">
        {window.prev ? <Link className="dp-secondary" href={leagueHref(slug, { tab: "lich-thi-dau", from: window.prev })}>← Tuần trước</Link> : <span />}
        <b>{dayNumbers(query.from)} – {dayNumbers(window.last)}</b>
        {window.next ? <Link className="dp-secondary" href={leagueHref(slug, { tab: "lich-thi-dau", from: window.next })}>Tuần sau →</Link> : <span />}
      </nav>
      {!days.length && <Empty title="Không có trận nào trong tuần này" text="Chọn tuần trước hoặc tuần sau để xem lịch." />}
      {days.map(([day, items]) => <FixturePanel key={day} title={formatMatchDate(items[0].kickoffAt, true)} fixtures={items} />)}
    </>}
    {query.tab === "doi-bong" && (clubs?.length ? <div className="dp-club-grid">{clubs.map((club) => <Link className="dp-club-tile" key={club.clubId} href={clubPath(club.clubId)}><Crest url={club.crestUrl} name={club.name} /><h3>{club.shortName?.trim() || club.name}</h3><p>{club.position ? `Hạng ${club.position}${club.points !== null ? ` · ${club.points} điểm` : ""}` : league.name}</p><span>Khám phá CLB ↗</span></Link>)}</div> : <Empty title="Chưa có danh sách đội bóng" text="Danh sách sẽ xuất hiện khi dữ liệu mùa giải được đồng bộ." />)}
    {query.tab === "chuyen-nhuong" && <StoryGrid result={feed!} now={now} offset={query.offset} href={href} empty={{ title: "Chưa có tin chuyển nhượng", text: "Chưa có tin chuyển nhượng được báo chí đưa trong 7 ngày gần đây." }} />}
  </div></NewsShell>;
}
