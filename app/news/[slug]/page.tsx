import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { newsMetadata } from "@/lib/news-presentation";
import { feedArticleIdFromSlug, feedMetadata } from "@/lib/feed-card-presentation";
import { readNewsPage } from "@/services/news-page-data";
import { readFeedPage } from "@/services/feed-page-data";
import { NewsShell } from "@/components/news/news-shell";
import { NewsDetailView } from "@/components/news/news-detail";
import { FeedDetailView } from "@/components/news/feed-detail";
import { NewsState } from "@/components/news/news-state";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const feedId = feedArticleIdFromSlug(slug);
  if (feedId) { const result = await readFeedPage(feedId); return feedMetadata(result.kind === "ready" ? result.card : null); }
  const result = await readNewsPage(slug);
  return newsMetadata(result.kind === "ready" ? result.story : null, env.NEXT_PUBLIC_APP_URL);
}
export default async function NewsDetailPage({ params }: Props) {
  const { slug } = await params;
  const feedId = feedArticleIdFromSlug(slug);
  if (feedId) {
    const result = await readFeedPage(feedId);
    if (result.kind === "not-found") notFound();
    return <NewsShell>{result.kind === "ready" ? <FeedDetailView card={result.card} others={result.others} now={new Date()} /> : <><h1 className="sr-only">Tin tức chưa khả dụng</h1><NewsState kind="error" /></>}</NewsShell>;
  }
  const result = await readNewsPage(slug);
  if (result.kind === "not-found") notFound();
  return <NewsShell>{result.kind === "ready" ? <NewsDetailView story={result.story} now={new Date()} /> : <><h1 className="sr-only">Tin tức chưa khả dụng</h1><NewsState kind="error" /></>}</NewsShell>;
}
