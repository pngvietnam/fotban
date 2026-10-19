import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { clubHref, funNotice, parseClubQuery } from "@/lib/club-presentation";
import { clubIdFromSlug } from "@/services/club-hub";
import { readClub } from "@/services/club-page-data";
import { readFeedList } from "@/services/feed-page-data";
import { NewsShell } from "@/components/news/news-shell";
import { NewsState } from "@/components/news/news-state";
import { FeedSection } from "@/components/news/feed-section";
import { ClubFixtureLists, ClubHeader, Squad } from "@/components/club/club-hub";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
// Only the club's own data tabs are indexable; tabs with publisher text are not.
const indexable = new Set(["lich-thi-dau", "cau-thu"]);
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params; const query = parseClubQuery(await searchParams);
  const result = clubIdFromSlug(slug) && query ? await readClub(slug, query.tab) : null;
  if (result?.kind !== "ready" || !query) return { title: "Không tìm thấy câu lạc bộ | Football Morning Brief", robots: { index: false, follow: false } };
  const { club } = result.data;
  return { title: `${club.name} | Football Morning Brief`, description: `Tin tức, lịch thi đấu, bảng xếp hạng, chuyển nhượng và cầu thủ ${club.name}.`,
    alternates: { canonical: new URL(clubHref(slug, { tab: query.tab }), env.NEXT_PUBLIC_APP_URL).href }, robots: { index: indexable.has(query.tab), follow: true } };
}
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
  const clubId = club.clubId;
  const href = (offset: number) => clubHref(slug, { tab: query.tab, offset });
  const feedTabs: Record<string, { storyType?: string; empty: string }> = {
    "tin-tuc": { empty: `Chưa có tin về ${club.name} trong 7 ngày gần đây.` },
    "chuyen-nhuong": { storyType: "TRANSFER", empty: `Chưa có tin chuyển nhượng về ${club.name} trong 7 ngày gần đây.` },
    vui: { storyType: "FUN", empty: `Chưa có bài vui về ${club.name} trong 7 ngày gần đây.` },
  };
  const feedTab = feedTabs[query.tab];
  const feed = feedTab ? await readFeedList({ league: "all", offset: query.offset, clubId, ...(feedTab.storyType ? { storyType: feedTab.storyType } : {}) }) : null;
  const overview = query.tab === "tong-quan" ? await Promise.all([readFeedList({ league: "all", offset: 0, clubId }), readFeedList({ league: "all", offset: 0, clubId, storyType: "TRANSFER" })]) : null;
  const slice = (list: NonNullable<typeof feed>, n: number) => list.kind === "ready" ? { kind: "ready" as const, data: { groups: list.data.groups.slice(0, n), nextOffset: null } } : list;
  return <NewsShell section="league">
    <ClubHeader club={club} standing={standing} next={fixtures.upcoming[0] ?? null} active={query.tab} />
    <div className="space-y-6">
      {query.tab === "tong-quan" && overview && <>
        <ClubFixtureLists fixtures={{ upcoming: fixtures.upcoming.slice(0, 3), recent: fixtures.recent.slice(0, 3) }} />
        <FeedSection result={slice(overview[0], 4)} filters={{ league: "all", offset: 0 }} now={now} href={href} emptyText={`Chưa có tin về ${club.name} trong 7 ngày gần đây.`} />
        {overview[1].kind === "ready" && overview[1].data.groups.length > 0 && <div><h2 className="mb-3 text-lg font-bold tracking-tight">Chuyển nhượng</h2><FeedSection result={slice(overview[1], 3)} filters={{ league: "all", offset: 0 }} now={now} href={href} /></div>}
      </>}
      {feedTab && feed && <>
        {query.tab === "vui" && <p className="text-xs leading-6 text-slate-500">{funNotice}</p>}
        <FeedSection result={feed} filters={{ league: "all", offset: query.offset, ...(feedTab.storyType ? { storyType: feedTab.storyType } : {}), clubId }} now={now} href={href} emptyText={feedTab.empty} />
      </>}
      {query.tab === "lich-thi-dau" && <ClubFixtureLists fixtures={fixtures} />}
      {query.tab === "cau-thu" && <Squad players={squad ?? []} />}
    </div>
  </NewsShell>;
}
