import type { Metadata } from "next";
import { env } from "@/lib/env";
import { getDatabase } from "@/lib/db";
import { prismaSyncDatabase } from "@/lib/sync-database";
import { newsKinds, parseNewsView } from "@/lib/news-tabs";
import type { FeedFilters } from "@/types/feed-card";
import { viewerFollows } from "@/services/viewer-follows";
import { viewerStoryLikes } from "@/services/viewer-likes";
import { readFeedList } from "@/services/feed-page-data";
import { readRibbon } from "@/services/home-overview";
import { NewsShell } from "@/components/news/news-shell";
import { NewsState } from "@/components/news/news-state";
import { SocialFeed } from "@/components/news/social-feed";

export const dynamic = "force-dynamic";
type Params = Record<string, string | string[] | undefined>;
export async function generateMetadata({ searchParams }: { searchParams: Promise<Params> }): Promise<Metadata> {
  const params = await searchParams;
  return { title: "Tin bóng đá | Fotban", description: "Tin bóng đá tiếng Việt từ các báo, gộp theo câu chuyện, lọc theo loại tin và giải đấu.", alternates: { canonical: new URL("/news", env.NEXT_PUBLIC_APP_URL).href }, robots: { index: Object.keys(params).length === 0, follow: true } };
}
const groupsOf = (result: Awaited<ReturnType<typeof readFeedList>>) => result.kind === "ready" ? result.data.groups : [];

export default async function NewsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const view = parseNewsView(await searchParams);
  if (!view) return <NewsShell><h1 className="sr-only">Tin bóng đá</h1><NewsState kind="invalid" /></NewsShell>;
  const now = new Date();
  const types = newsKinds.find((kind) => kind.key === view.kind)?.types;
  const filters: FeedFilters = { league: view.league, offset: view.offset, ...(types ? { storyTypes: [...types] } : {}), ...(view.tab === "moi-nhat" ? { sort: "latest" as const } : view.tab === "soi-noi" ? { sort: "buzz" as const } : {}) };
  // "Dành cho bạn" keeps to what the reader follows; with nothing new there, the first page falls back to the general feed.
  const viewer = view.tab === "danh-cho-ban" ? await viewerFollows(now, { fixtures: false }) : null;
  let feed = await readFeedList(viewer?.follow ? { ...filters, follow: viewer.follow } : filters);
  const fallback = Boolean(viewer?.follow) && feed.kind === "ready" && !feed.data.groups.length && view.offset === 0;
  if (fallback) feed = await readFeedList(filters);
  const db = getDatabase();
  const [buzz, fixtures, likes] = await Promise.all([
    readFeedList({ league: "all", offset: 0, sort: "buzz" }),
    db ? readRibbon(prismaSyncDatabase(db), now, 0, 2).catch(() => []) : [],
    viewerStoryLikes(groupsOf(feed)),
  ]);
  return <NewsShell><SocialFeed now={now} data={{
    view, groups: groupsOf(feed), nextOffset: feed.kind === "ready" ? feed.data.nextOffset : null, failed: feed.kind === "error", likes,
    personal: viewer ? { names: viewer.clubs?.map((club) => club.name) ?? [], fallback, signedIn: viewer.signedIn } : null,
    buzz: groupsOf(buzz).slice(0, 3), fixtures: fixtures.filter((match) => match.status !== "FINISHED"),
  }} /></NewsShell>;
}
