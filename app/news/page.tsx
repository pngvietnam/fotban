import type { Metadata } from "next";
import { env } from "@/lib/env";
import { parseNewsFilters } from "@/lib/news-presentation";
import { parseFeedOffset } from "@/lib/feed-card-presentation";
import { newsTabHref, parseNewsTab, type NewsTab } from "@/lib/news-tabs";
import type { FeedFilters } from "@/types/feed-card";
import { viewerFollows, type ViewerFollows } from "@/services/viewer-follows";
import { readNewsList } from "@/services/news-page-data";
import { readFeedList } from "@/services/feed-page-data";
import { NewsShell } from "@/components/news/news-shell";
import { NewsTabsView } from "@/components/news/news-tabs";
import { NewsFiltersView } from "@/components/news/news-filters";
import { NewsList } from "@/components/news/news-list";
import { NewsState } from "@/components/news/news-state";
import { FeedSection } from "@/components/news/feed-section";
import { ForYouPrompt } from "@/components/news/for-you-prompt";
import { ClubFixtureLists } from "@/components/club/club-hub";

export const dynamic = "force-dynamic";
type Params = Record<string, string | string[] | undefined>;
export async function generateMetadata({ searchParams }: { searchParams: Promise<Params> }): Promise<Metadata> {
  const params = await searchParams;
  return { title: "Tin bóng đá | Fotban", description: "Tin bóng đá tiếng Việt từ các báo, gộp theo câu chuyện và phân loại theo đội, giải, chuyển nhượng.", alternates: { canonical: new URL("/news", env.NEXT_PUBLIC_APP_URL).href }, robots: { index: Object.keys(params).length === 0, follow: true } };
}

const hasGroups = (result: Awaited<ReturnType<typeof readFeedList>>) => result.kind === "ready" && result.data.groups.length > 0;

export default async function NewsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const tab = parseNewsTab(params.tab); const league = parseNewsFilters({ league: params.league }); const offset = parseFeedOffset(params.bao);
  if (!tab || !league || offset === null) return <NewsShell><NewsTabsView active="danh-cho-ban" /><NewsState kind="invalid" /></NewsShell>;
  const now = new Date();
  const href = (next: number) => newsTabHref(tab, { league: league.league, offset: next });
  const feedFilters: Record<NewsTab, FeedFilters> = {
    "danh-cho-ban": { league: "all", offset }, "moi-nhat": { league: "all", offset, sort: "latest" },
    "chuyen-nhuong": { league: "all", offset, sort: "latest", storyType: "TRANSFER" }, "giai-dau": { league: league.league, offset },
  };
  let filters = feedFilters[tab]; let personal: ViewerFollows | null = null;
  if (tab === "danh-cho-ban") { personal = await viewerFollows(now); if (personal.follow) filters = { ...filters, follow: personal.follow }; }
  let feed = await readFeedList(filters);
  // A follower with nothing new in the window still gets the day's top stories.
  const fallback = Boolean(filters.follow) && !hasGroups(feed) && offset === 0;
  if (fallback) feed = await readFeedList({ league: "all", offset: 0 });
  // Verified stories (evidence-gated) lead the "Mới nhất" tab when there are any.
  const verified = tab === "moi-nhat" && offset === 0 ? await readNewsList({ league: "all", offset: 0 }) : null;
  return <NewsShell>
    <h1 className="sr-only">Tin bóng đá</h1>
    <NewsTabsView active={tab} />
    {tab === "giai-dau" && <NewsFiltersView filters={league} tab="giai-dau" />}
    {personal && !personal.follow && <ForYouPrompt signedIn={personal.signedIn} />}
    {personal?.fixtures && (personal.fixtures.upcoming.length > 0 || personal.fixtures.recent.length > 0) && <div className="mb-8"><ClubFixtureLists fixtures={personal.fixtures} /></div>}
    {verified && <NewsList result={verified.kind === "ready" ? { kind: "ready", data: { ...verified.data, nextOffset: null } } : verified} filters={{ league: "all", offset: 0 }} now={now} hideEmpty />}
    <FeedSection result={feed} filters={{ league: filters.league, offset: filters.offset }} now={now} href={href} emptyText={tab === "chuyen-nhuong" ? "Chưa có tin chuyển nhượng mới trong 7 ngày gần đây." : "Chưa có tin mới trong 7 ngày gần đây."} />
  </NewsShell>;
}
