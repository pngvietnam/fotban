import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { clubHref, clubTabLabels, parseClubQuery } from "@/lib/club-presentation";
import { leagueHref } from "@/lib/league-presentation";
import { leagueZones } from "@/lib/league-zones";
import { nationalityVi } from "@/lib/country-vi";
import { playerPath } from "@/lib/player-presentation";
import { clubTabs } from "@/types/club-hub";
import { clubIdFromSlug, positionGroup, positionOrder } from "@/services/club-hub";
import { clubExtraHonours, clubHonours } from "@/services/club-honours";
import { clubCoaches } from "@/services/club-coaches";
import { readClub, readClubFans } from "@/services/club-page-data";
import { FanTalkPanel } from "@/components/fan/fan-talk";
import { readFeedList } from "@/services/feed-page-data";
import { NewsShell } from "@/components/news/news-shell";
import { NewsState } from "@/components/news/news-state";
import { FollowLink } from "@/components/account/follow-link";
import { BackLink } from "@/components/shell/back-link";
import { Mark } from "@/components/ui/crest-mark";
import { DomainTabs, Empty, StandingsPanel, StoryGrid } from "@/components/domain/domain-ui";
import { ClubFixtureList, ClubHistory, ClubScorers, FormAndDifficulty, HonoursSummary, MiniTable, StoryRows } from "@/components/club/club-overview";
import { ClubHero, ClubStatStrip, NextMatchCard } from "@/components/club/club-hero";
import { clubTheme } from "@/lib/club-colors";
import { SquadGrid, type SquadCard } from "@/components/club/squad-grid";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
// Only the club's own data tabs are indexable; tabs with publisher text are not.
const indexable = new Set(["bang-xep-hang", "lich-thi-dau", "cau-thu", "lich-su"]);
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params; const query = parseClubQuery(await searchParams);
  const result = clubIdFromSlug(slug) && query ? await readClub(slug, query.tab) : null;
  if (result?.kind !== "ready" || !query) return { title: "Không tìm thấy câu lạc bộ | Fotban", robots: { index: false, follow: false } };
  const { club } = result.data;
  return { title: `${club.name} | Fotban`, description: `Lịch thi đấu, kết quả, bảng xếp hạng, đội hình, chuyển nhượng và lịch sử danh hiệu ${club.name}.`,
    alternates: { canonical: new URL(clubHref(slug, { tab: query.tab }), env.NEXT_PUBLIC_APP_URL).href }, robots: { index: indexable.has(query.tab), follow: true } };
}
const ageOf = (birthDate: string | null, now: Date) => {
  const born = birthDate ? new Date(birthDate) : null;
  if (!born || !Number.isFinite(born.getTime())) return null;
  const age = now.getUTCFullYear() - born.getUTCFullYear() - (now.getUTCMonth() < born.getUTCMonth() || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate()) ? 1 : 0);
  return age >= 14 && age <= 50 ? age : null;
};

export default async function ClubPage({ params, searchParams }: Props) {
  const { slug } = await params;
  if (!clubIdFromSlug(slug)) notFound();
  const query = parseClubQuery(await searchParams);
  if (!query) return <NewsShell section="league"><NewsState kind="invalid" /></NewsShell>;
  const now = new Date();
  const result = await readClub(slug, query.tab, now);
  if (result.kind === "not-found") notFound();
  if (result.kind === "error") return <NewsShell section="league"><h1 className="sr-only">Câu lạc bộ chưa khả dụng</h1><NewsState kind="error" /></NewsShell>;
  const { club, fixtures, squad, tables, scorers } = result.data;
  const clubId = club.clubId; const display = club.shortName?.trim() || club.name;
  const href = (offset: number) => clubHref(slug, { tab: query.tab, offset });
  const storyTab = ["tin-tuc", "chuyen-nhuong", "vui"].includes(query.tab);
  const storyType = query.tab === "chuyen-nhuong" ? "TRANSFER" : query.tab === "vui" ? "FUN" : undefined;
  const [feed, transfers] = await Promise.all([
    storyTab || query.tab === "tong-quan" ? readFeedList({ league: "all", offset: storyTab ? query.offset : 0, clubId, ...(storyType ? { storyType } : {}) }) : null,
    query.tab === "tong-quan" ? readFeedList({ league: "all", offset: 0, clubId, storyType: "TRANSFER" }) : null,
  ]);
  const fans = query.tab === "tong-quan" ? await readClubFans(clubId, now) : [];
  const active = tables.find((table) => table.slug === query.giai) ?? tables.find((table) => table.row) ?? tables[0] ?? null;
  const scheduled = fixtures.upcoming.filter((fixture) => !["POSTPONED", "CANCELLED", "SUSPENDED"].includes(fixture.status));
  const next = scheduled[0] ?? null;
  // "Cầu thủ được nhắc nhiều": squad players the club's recent stories are about; shown only when the top-scorer lists have none of the club's players.
  const bySquad = new Map((squad ?? []).map((player) => [player.playerId, player]));
  const mentioned = feed?.kind === "ready" ? [...new Map(feed.data.groups.flatMap((group) => [group.lead, ...group.others]).flatMap((card) => card.entities).filter((entity) => entity.kind === "player" && entity.id && bySquad.has(entity.id)).map((entity) => [entity.id!, bySquad.get(entity.id!)!])).values()].slice(0, 5) : [];
  const honours = query.tab === "tong-quan" || query.tab === "lich-su" ? clubHonours(club.name) : [];
  const extras = query.tab === "tong-quan" || query.tab === "lich-su" ? clubExtraHonours(club.name) : [];
  const coaches = clubCoaches(club.name);
  const theme = clubTheme(club.name);
  const currentCoach = coaches?.coaches.find((coach) => coach.current)?.name ?? null;
  const squadCards: SquadCard[] = (squad ?? []).map((player) => ({ playerId: player.playerId, name: player.name, group: positionGroup(player.position), nationality: nationalityVi(player.nationality), age: ageOf(player.birthDate, now), photoUrl: player.photoUrl, href: playerPath(player.playerId) }));
  const squadGroups = positionOrder.filter((name) => squadCards.some((player) => player.group === name));
  const emptyTexts: Record<string, string> = { "tin-tuc": `Chưa có tin về ${club.name} trong 7 ngày gần đây.`, "chuyen-nhuong": `Chưa có tin chuyển nhượng về ${club.name} trong 7 ngày gần đây.`, vui: `Chưa có bài vui về ${club.name} trong 7 ngày gần đây.` };
  return <NewsShell section="league" back={<BackLink fallback={club.league ? leagueHref(club.league.slug) : "/leagues"}>Quay lại</BackLink>}><div className="domain-page cb-page" style={{ "--club": theme.color, "--club-on": theme.on, "--club-ink": theme.ink } as React.CSSProperties}>
    <ClubHero club={club} table={active} recent={fixtures.recent} coach={currentCoach} calendarHref={scheduled.length ? `/club/${slug}/calendar` : null} followAction={<FollowLink type="CLUB" entityId={clubId} name={display} variant="button" />} />
    <DomainTabs label="Mục của câu lạc bộ" active={query.tab} tabs={clubTabs.filter((tab) => tab !== "vui" || query.tab === "vui").map((tab) => ({ key: tab, label: clubTabLabels[tab], href: clubHref(slug, { tab }) }))} />
    {query.tab === "tong-quan" && <>
      {(next || active?.row) && <div className="cb-top">
        {next && <NextMatchCard fixture={next} clubName={club.name} now={now.getTime()} />}
        {active?.row && <ClubStatStrip row={active.row} table={active} tableHref={clubHref(slug, { tab: "bang-xep-hang" })} />}
      </div>}
      <div className="cb-grid">
        <div className="cb-main">
          <ClubFixtureList title="Kết quả gần đây" fixtures={fixtures.recent} clubName={club.name} action={{ href: clubHref(slug, { tab: "lich-thi-dau" }), label: "Tất cả →" }} empty="Chưa có kết quả đã lưu." />
          {scheduled.length > 1 && <ClubFixtureList title="Các trận tiếp theo" fixtures={scheduled.slice(1)} clubName={club.name} action={{ href: clubHref(slug, { tab: "lich-thi-dau" }), label: "Tất cả →" }} empty="" />}
          <FormAndDifficulty fixtures={fixtures} clubName={club.name} tables={tables} />
        </div>
        <aside className="cb-side" aria-label="Bảng xếp hạng, ghi bàn và danh hiệu">
          {active && <MiniTable tables={tables} active={active} clubId={clubId} clubSlug={slug} />}
          <ClubScorers scorers={scorers} />
          <FanTalkPanel title="Fan nói gì" threads={fans} now={now} />
          {!scorers.length && mentioned.length > 0 && <section className="dp-panel cb-panel" aria-label="Cầu thủ được nhắc nhiều"><div className="dp-section-heading"><h2>Cầu thủ được nhắc nhiều</h2></div>{mentioned.map((player) => <Link className="cb-scorer" key={player.playerId} href={playerPath(player.playerId)}><Mark url={player.photoUrl} name={player.name} size="md" round photo /><span><b>{player.name}</b><small>{[positionGroup(player.position), nationalityVi(player.nationality)].filter(Boolean).join(" · ")}</small></span></Link>)}<p className="dp-muted cb-note">Theo các tin báo chí trong 7 ngày qua.</p></section>}
          <HonoursSummary honours={honours} extras={extras} historyHref={clubHref(slug, { tab: "lich-su" })} />
        </aside>
      </div>
      <StoryRows result={feed} now={now} limit={5} title="Tin mới về đội" more={{ href: clubHref(slug, { tab: "tin-tuc" }), label: "Tất cả tin →" }} />
      <StoryRows result={transfers} now={now} limit={4} title="Chuyển nhượng" more={{ href: clubHref(slug, { tab: "chuyen-nhuong" }), label: "Tất cả →" }} />
    </>}
    {query.tab === "bang-xep-hang" && (tables.some((table) => table.data.rows.length) ? <>
      {tables.filter((table) => table.data.rows.length).map((table) => <StandingsPanel key={table.slug} data={table.data} leagueName={table.name} seasonName={table.slug === club.league?.slug ? club.league.seasonName : null} highlight={[clubId]} zones={leagueZones[table.slug]} />)}
    </> : <Empty title="Chưa có bảng xếp hạng" text="Bảng xếp hạng sẽ xuất hiện khi dữ liệu mùa giải được đồng bộ." />)}
    {storyTab && feed && <>
      {query.tab === "vui" && <p className="dp-note">Bài nhẹ nhàng do chính các báo đăng. Chỉ để giải trí, không phải tin đã xác nhận.</p>}
      <StoryGrid result={feed} now={now} offset={query.offset} href={href} empty={{ title: "Chưa có tin phù hợp", text: emptyTexts[query.tab] }} />
    </>}
    {query.tab === "lich-thi-dau" && <><ClubFixtureList title="Lịch thi đấu sắp tới" fixtures={fixtures.upcoming} clubName={club.name} empty="Chưa có lịch thi đấu sắp tới." /><ClubFixtureList title="Kết quả gần đây" fixtures={fixtures.recent} clubName={club.name} empty="Chưa có kết quả đã lưu." /><p className="dp-note">Giờ Việt Nam (UTC+7). Football data provided by the Football-Data.org API.</p></>}
    {query.tab === "cau-thu" && (squad?.length ? <>
      <SquadGrid players={squadCards} groups={squadGroups} />
      <p className="dp-note">Danh sách theo lần đồng bộ gần nhất của nhà cung cấp dữ liệu; có thể chưa phản ánh chuyển nhượng mới. Ảnh cầu thủ từ Wikimedia Commons, <Link href="/ghi-cong-anh">xem ghi công ảnh</Link>.</p>
    </> : <Empty title="Đội hình đang cập nhật" text="Chưa có danh sách cầu thủ hợp lệ cho đội này." />)}
    {query.tab === "lich-su" && <ClubHistory honours={honours} extras={extras} coaches={coaches} clubName={club.name} />}
  </div></NewsShell>;
}
