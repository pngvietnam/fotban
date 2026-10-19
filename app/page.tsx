import { env } from "@/lib/env";
import { homepageMetadata } from "@/lib/homepage-presentation";
import { readHomepage } from "@/services/homepage-page-data";
import { readFeedList } from "@/services/feed-page-data";
import { FeedHomeSection } from "@/components/news/feed-section";
import { readMyTeams } from "@/services/my-teams";
import { MyTeamsSection } from "@/components/home/my-teams";
import { crestsByName } from "@/services/crest-lookup";
import { MorningHomepage } from "@/components/home/morning-homepage";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ searchParams }: Props) {
  const params = await searchParams;
  return homepageMetadata(env.NEXT_PUBLIC_APP_URL, params.preview !== undefined);
}
export default async function Home({ searchParams }: Props) {
  const params = await searchParams;
  const [result, feed, mine] = await Promise.all([readHomepage(params.preview), readFeedList({ league: "all", offset: 0 }), readMyTeams()]);
  const now = new Date();
  const names = result.kind === "ready" ? result.view.sections.flatMap((section) => section.items.flatMap((entry) => entry.item.match ? [entry.item.match.home, entry.item.match.away] : [])) : [];
  const crests = await crestsByName(names);
  return <MorningHomepage result={result} now={now} crests={crests} extra={<FeedHomeSection result={feed} now={now} />} before={mine ? <MyTeamsSection data={mine} now={now} /> : null} />;
}
