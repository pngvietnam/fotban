import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { clubHref, clubTabLabels, parseClubQuery } from "@/lib/club-presentation";
import { leagueHref } from "@/lib/league-presentation";
import { countryVi, nationalityVi } from "@/lib/country-vi";
import { playerPath } from "@/lib/player-presentation";
import { clubTabs } from "@/types/club-hub";
import { clubIdFromSlug, positionGroup, positionOrder } from "@/services/club-hub";
import { readClub } from "@/services/club-page-data";
import { readFeedList } from "@/services/feed-page-data";
import { NewsShell } from "@/components/news/news-shell";
import { NewsState } from "@/components/news/news-state";
import { FollowLink } from "@/components/account/follow-link";
import { BackLink } from "@/components/shell/back-link";
import { PlayerPhoto } from "@/components/ui/player-photo";
import { DomainTabs, Empty, EntityHeader, FixturePanel, FormDots, StoryGrid } from "@/components/domain/domain-ui";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
// Only the club's own data tabs are indexable; tabs with publisher text are not.
const indexable = new Set(["lich-thi-dau", "cau-thu"]);
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params; const query = parseClubQuery(await searchParams);
  const result = clubIdFromSlug(slug) && query ? await readClub(slug, query.tab) : null;
  if (result?.kind !== "ready" || !query) return { title: "Không tìm thấy câu lạc bộ | Fotban", robots: { index: false, follow: false } };
  const { club } = result.data;
  return { title: `${club.name} | Fotban`, description: `Tin tức, lịch thi đấu, bảng xếp hạng, chuyển nhượng và cầu thủ ${club.name}.`,
    alternates: { canonical: new URL(clubHref(slug, { tab: query.tab }), env.NEXT_PUBLIC_APP_URL).href }, robots: { index: indexable.has(query.tab), follow: true } };
}
const Strip = ({ items }: { items: { value: React.ReactNode; label: string }[] }) => <div className="dp-stat-strip">{items.map((item) => <div key={item.label}><b>{item.value}</b><span>{item.label}</span></div>)}</div>;

export default async function ClubPage({ params, searchParams }: Props) {
  const { slug } = await params;
  if (!clubIdFromSlug(slug)) notFound();
  const query = parseClubQuery(await searchParams);
  if (!query) return <NewsShell section="league"><NewsState kind="invalid" /></NewsShell>;
  const now = new Date();
  const result = await readClub(slug, query.tab, now);
  if (result.kind === "not-found") notFound();
  if (result.kind === "error") return <NewsShell section="league"><h1 className="sr-only">Câu lạc bộ chưa khả dụng</h1><NewsState kind="error" /></NewsShell>;
  const { club, standing, fixtures, squad } = result.data;
  const clubId = club.clubId; const display = club.shortName?.trim() || club.name;
  const href = (offset: number) => clubHref(slug, { tab: query.tab, offset });
  const storyTab = ["tin-tuc", "chuyen-nhuong", "vui"].includes(query.tab);
  const storyType = query.tab === "chuyen-nhuong" ? "TRANSFER" : query.tab === "vui" ? "FUN" : undefined;
  const [feed, transfers] = await Promise.all([
    storyTab || query.tab === "tong-quan" ? readFeedList({ league: "all", offset: storyTab ? query.offset : 0, clubId, ...(storyType ? { storyType } : {}) }) : null,
    query.tab === "tong-quan" ? readFeedList({ league: "all", offset: 0, clubId, storyType: "TRANSFER" }) : null,
  ]);
  // "Cầu thủ đáng chú ý": squad players the club's recent stories are about; nothing is shown when no story names one.
  const bySquad = new Map((squad ?? []).map((player) => [player.playerId, player]));
  const mentioned = feed?.kind === "ready" ? [...new Map(feed.data.groups.flatMap((group) => [group.lead, ...group.others]).flatMap((card) => card.entities).filter((entity) => entity.kind === "player" && entity.id && bySquad.has(entity.id)).map((entity) => [entity.id!, bySquad.get(entity.id!)!])).values()].slice(0, 5) : [];
  const row = standing?.row;
  const emptyTexts: Record<string, string> = { "tin-tuc": `Chưa có tin về ${club.name} trong 7 ngày gần đây.`, "chuyen-nhuong": `Chưa có tin chuyển nhượng về ${club.name} trong 7 ngày gần đây.`, vui: `Chưa có bài vui về ${club.name} trong 7 ngày gần đây.` };
  return <NewsShell section="league" back={<BackLink fallback={club.league ? leagueHref(club.league.slug) : "/leagues"}>Quay lại</BackLink>}><div className="domain-page">
    <EntityHeader crestUrl={club.crestUrl} crestName={club.name} kicker={club.league?.name ?? "HỒ SƠ CLB"} kickerHref={club.league ? leagueHref(club.league.slug) : undefined} title={club.name}
      subtitle={[countryVi(club.country), club.venue].filter(Boolean).join(" · ") || null} action={<FollowLink type="CLUB" entityId={clubId} name={display} variant="button" />} />
    <DomainTabs label="Mục của câu lạc bộ" active={query.tab} tabs={clubTabs.filter((tab) => tab !== "vui" || query.tab === "vui").map((tab) => ({ key: tab, label: clubTabLabels[tab], href: clubHref(slug, { tab }) }))} />
    {query.tab === "tong-quan" && <>
      {row && <Strip items={[{ value: row.position, label: club.league ? `Hạng · ${club.league.name}` : "Hạng" }, { value: row.points ?? "–", label: "Điểm" }, { value: row.played ?? "–", label: "Trận" }, { value: row.goalDifference === null ? "–" : row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference, label: "Hiệu số" }, { value: <FormDots form={row.form} />, label: "Phong độ 5 trận" }]} />}
      <div className="dp-two-columns">
        <div><FixturePanel title="Lịch đấu & kết quả" fixtures={[...fixtures.upcoming.slice(0, 3), ...fixtures.recent.slice(0, 3)]} action={{ href: clubHref(slug, { tab: "lich-thi-dau" }), label: "Xem tất cả →" }} empty="Chưa có lịch đấu hay kết quả đã lưu." /></div>
        {mentioned.length > 0 && <section className="dp-panel" aria-label="Cầu thủ đáng chú ý"><h2>Cầu thủ đáng chú ý</h2>{mentioned.map((player) => <Link className="dp-person-row" key={player.playerId} href={playerPath(player.playerId)}><PlayerPhoto photoUrl={player.photoUrl} size="md" round /><span><b>{player.name}</b><small>{[positionGroup(player.position), nationalityVi(player.nationality)].filter(Boolean).join(" · ")}</small></span><span aria-hidden="true">→</span></Link>)}</section>}
      </div>
      {feed && feed.kind === "ready" && feed.data.groups.length > 0 && <><h2 className="dp-extra-heading">Câu chuyện trên sân cỏ</h2><StoryGrid result={feed} now={now} limit={4} /></>}
      {transfers && transfers.kind === "ready" && transfers.data.groups.length > 0 && <><h2 className="dp-extra-heading">Chuyển nhượng</h2><StoryGrid result={transfers} now={now} limit={3} /></>}
    </>}
    {storyTab && feed && <>
      {query.tab === "vui" && <p className="dp-note">Bài nhẹ nhàng do chính các báo đăng. Chỉ để giải trí, không phải tin đã xác nhận.</p>}
      <StoryGrid result={feed} now={now} offset={query.offset} href={href} empty={{ title: "Chưa có tin phù hợp", text: emptyTexts[query.tab] }} />
    </>}
    {query.tab === "lich-thi-dau" && <><FixturePanel title="Lịch thi đấu sắp tới" fixtures={fixtures.upcoming} empty="Chưa có lịch thi đấu sắp tới." /><FixturePanel title="Kết quả gần đây" fixtures={fixtures.recent} empty="Chưa có kết quả đã lưu." /><p className="dp-note">Giờ Việt Nam (UTC+7). Football data provided by the Football-Data.org API.</p></>}
    {query.tab === "cau-thu" && (squad?.length ? <>
      {positionOrder.map((name) => [name, squad.filter((player) => positionGroup(player.position) === name)] as const).filter(([, items]) => items.length).map(([name, items]) => <section className="dp-panel" key={name} aria-label={name}><h2>{name} ({items.length})</h2>{items.map((player) => <Link className="dp-person-row" key={player.playerId} href={playerPath(player.playerId)}><PlayerPhoto photoUrl={player.photoUrl} size="md" round /><span><b>{player.name}</b><small>{nationalityVi(player.nationality) ?? "Chưa rõ quốc tịch"}</small></span><span aria-hidden="true">→</span></Link>)}</section>)}
      <p className="dp-note">Danh sách theo lần đồng bộ gần nhất của nhà cung cấp dữ liệu; có thể chưa phản ánh chuyển nhượng mới. Ảnh cầu thủ từ Wikimedia Commons, <Link href="/ghi-cong-anh">xem ghi công ảnh</Link>.</p>
    </> : <Empty title="Đội hình đang cập nhật" text="Chưa có danh sách cầu thủ hợp lệ cho đội này." />)}
  </div></NewsShell>;
}
