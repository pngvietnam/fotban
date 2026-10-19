import type { Metadata } from "next";
import { env } from "@/lib/env";
import { parseNewsFilters } from "@/lib/news-presentation";
import { parseFeedOffset } from "@/lib/feed-card-presentation";
import { readNewsList } from "@/services/news-page-data";
import { readFeedList } from "@/services/feed-page-data";
import { NewsShell } from "@/components/news/news-shell";
import { NewsFiltersView } from "@/components/news/news-filters";
import { NewsList } from "@/components/news/news-list";
import { NewsState } from "@/components/news/news-state";
import { FeedSection } from "@/components/news/feed-section";

export const dynamic = "force-dynamic";
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const params = await searchParams;
  return { title: "Tin bóng đá | Football Morning Brief", description: "Tin bóng đá tiếng Việt, nguồn minh bạch, phân biệt rõ tin đã xác nhận và tin đồn.", alternates: { canonical: new URL("/news", env.NEXT_PUBLIC_APP_URL).href }, robots: { index: Object.keys(params).length === 0, follow: true } };
}
export default async function NewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const filters = parseNewsFilters(params); const feedOffset = parseFeedOffset(params.bao);
  const [result, feed] = filters && feedOffset !== null ? await Promise.all([readNewsList(filters), readFeedList({ league: filters.league, offset: feedOffset })]) : [null, null];
  const hasFeed = feed?.kind === "ready" && feed.data.groups.length > 0;
  return <NewsShell>
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#516c21]">Góc nhìn có căn cứ</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Bóng đá, rõ nguồn.</h1><p className="mt-3 max-w-xl text-sm leading-7 text-slate-600">Nắm câu chuyện. Hiểu mức độ chắc chắn. Đọc nguồn trước khi tin.</p></div><span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">Giờ Việt Nam · UTC+7</span></header>
    <NewsFiltersView filters={filters ?? { league: "all", offset: 0 }} />
    {result && filters && feed && feedOffset !== null ? <>
      <NewsList result={result} filters={filters} now={new Date()} hideEmpty={hasFeed} />
      <FeedSection result={feed} filters={{ league: filters.league, offset: feedOffset }} now={new Date()} />
    </> : <NewsState kind="invalid" />}
  </NewsShell>;
}
