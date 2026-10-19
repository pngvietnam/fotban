import { env } from "@/lib/env";
import { homepageMetadata } from "@/lib/homepage-presentation";
import { readHomepage } from "@/services/homepage-page-data";
import { readFeedList } from "@/services/feed-page-data";
import { FeedHomeSection } from "@/components/news/feed-section";
import { MorningHomepage } from "@/components/home/morning-homepage";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ searchParams }: Props) {
  const params = await searchParams;
  return homepageMetadata(env.NEXT_PUBLIC_APP_URL, params.preview !== undefined);
}
export default async function Home({ searchParams }: Props) {
  const params = await searchParams;
  const [result, feed] = await Promise.all([readHomepage(params.preview), readFeedList({ league: "all", offset: 0 })]);
  const now = new Date();
  return <MorningHomepage result={result} now={now} extra={<FeedHomeSection result={feed} now={now} />} />;
}
