import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { ageOn, parsePlayerQuery, playerHref, playerTabLabels, playerTabs } from "@/lib/player-presentation";
import { clubPath } from "@/lib/club-presentation";
import { nationalityVi } from "@/lib/country-vi";
import { safePhotoUrl } from "@/lib/player-photo";
import { formatMatchDate, formatMatchTime, formatUpdated } from "@/lib/match-presentation";
import { matchTabHref } from "@/lib/match-tabs";
import { playerIdFromSlug } from "@/services/player-hub";
import { positionGroup } from "@/services/club-hub";
import { readPlayer } from "@/services/player-page-data";
import { readFeedList } from "@/services/feed-page-data";
import { NewsShell } from "@/components/news/news-shell";
import { NewsState } from "@/components/news/news-state";
import { FollowLink } from "@/components/account/follow-link";
import { BackLink } from "@/components/shell/back-link";
import { PlayerPhoto } from "@/components/ui/player-photo";
import { DomainTabs, Facts, StoryGrid } from "@/components/domain/domain-ui";

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
  const age = ageOn(player.birthDate, now); const next = fixtures.upcoming[0];
  const position = positionGroup(player.position);
  return <NewsShell section="league" back={<BackLink fallback={clubPath(player.club.clubId)}>Quay lại</BackLink>}><div className="domain-page">
    <div className="dp-player-hero">
      <div className="dp-player-who"><PlayerPhoto photoUrl={player.photo?.url} size="lg" round />
        <div><span className="dp-kicker">HỒ SƠ CẦU THỦ</span><h1>{player.name}</h1><p>{[position === "Khác" ? null : position, nationalityVi(player.nationality)].filter(Boolean).join(" · ") || "Thông tin đang cập nhật"}</p><Link className="dp-hero-link" href={clubPath(player.club.clubId)}>{player.club.name} ↗</Link></div></div>
      <FollowLink type="PLAYER" entityId={player.playerId} name={player.name} variant="button" />
    </div>
    <DomainTabs label="Mục của cầu thủ" active={query.tab} tabs={playerTabs.map((tab) => ({ key: tab, label: playerTabLabels[tab], href: playerHref(slug, { tab }) }))} />
    {query.tab === "tong-quan" && <section className="dp-panel" aria-label="Hồ sơ và dữ liệu">
      <h2>Hồ sơ & dữ liệu</h2>
      <Facts items={[["Vị trí", position === "Khác" ? null : position], ["Quốc tịch", nationalityVi(player.nationality)], ["Tuổi", age === null ? null : String(age)], ["CLB hiện tại", player.club.name], ["Giải đấu", player.club.leagueName], ["Trận tới", next ? `${next.home.name} – ${next.away.name} · ${formatMatchDate(next.kickoffAt)} · ${formatMatchTime(next.kickoffAt)}` : null]]} />
      <p className="dp-note">Thông tin theo dữ liệu football-data.org, cập nhật {formatUpdated(player.dataAsOf) ?? "chưa rõ"}. Chưa có số phút thi đấu, bàn thắng hay thống kê mùa giải; thông tin thiếu được bỏ trống, không thay bằng số 0.{next && <> <Link href={matchTabHref(next.slug, "du-kien")}>Xem trận tới →</Link></>}</p>
      {player.photo && safePhotoUrl(player.photo.url) && <p className="dp-note">Ảnh: <a href={player.photo.descriptionUrl} target="_blank" rel="noopener noreferrer">{player.photo.author}</a> · {player.photo.licenseName} · Wikimedia Commons. <Link href="/ghi-cong-anh">Ghi công ảnh</Link></p>}
    </section>}
    <StoryGrid result={feed} now={now} limit={query.tab === "tong-quan" ? 6 : undefined} offset={query.tab === "tong-quan" ? 0 : query.offset} href={href}
      empty={query.tab === "tong-quan" ? undefined : { title: "Chưa có tin phù hợp", text: transfers ? `Chưa có tin chuyển nhượng về ${player.name} trong 7 ngày gần đây.` : `Chưa có tin về ${player.name} trong 7 ngày gần đây.` }} />
  </div></NewsShell>;
}
