import { env } from "@/lib/env";
import { homepageMetadata } from "@/lib/homepage-presentation";
import { readHomepage } from "@/services/homepage-page-data";
import { readFeedList } from "@/services/feed-page-data";
import { readHomeFans, readHomeMatches, readHomeStandings } from "@/services/home-front-data";
import { biteTypes, deepReadTypes, parseUpdateTab, splitFront, updateTabs } from "@/services/home-overview";
import { viewerFollows } from "@/services/viewer-follows";
import { crestsByName } from "@/services/crest-lookup";
import { MorningHomepage } from "@/components/home/morning-homepage";
import { Overview } from "@/components/home/overview";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ searchParams }: Props) {
  const params = await searchParams;
  return homepageMetadata(env.NEXT_PUBLIC_APP_URL, params.preview !== undefined);
}
const groupsOf = (result: Awaited<ReturnType<typeof readFeedList>>) => result.kind === "ready" ? result.data.groups : [];

export default async function Home({ searchParams }: Props) {
  const params = await searchParams;
  const now = new Date();
  const updateTab = parseUpdateTab(params.loai);
  const types = updateTabs.find((tab) => tab.key === updateTab)?.types;
  const [result, ranked, latest, deep, bites, transfers, standings, matches, viewer, fans] = await Promise.all([
    readHomepage(params.preview), readFeedList({ league: "all", offset: 0 }),
    readFeedList({ league: "all", offset: 0, sort: "latest", ...(types ? { storyTypes: [...types] } : {}) }),
    readFeedList({ league: "all", offset: 0, sort: "latest", storyTypes: deepReadTypes }),
    readFeedList({ league: "all", offset: 0, sort: "latest", storyTypes: biteTypes }),
    readFeedList({ league: "all", offset: 0, sort: "latest", storyType: "TRANSFER" }),
    readHomeStandings(params.bxh, now), readHomeMatches(now), viewerFollows(now), readHomeFans(now),
  ]);
  // Each story appears once on the page: quick points and the cover first, then the type-based blocks.
  const front = splitFront(groupsOf(ranked));
  const taken = new Set(front.used);
  const pick = (groups: ReturnType<typeof groupsOf>, limit: number) => groups.filter((group) => !taken.has(group.key)).slice(0, limit).map((group) => { taken.add(group.key); return group; });
  const updates = pick(groupsOf(latest), 5);
  const deepReads = pick(groupsOf(deep), 3);
  const biteGroups = pick(groupsOf(bites), 5);
  const overview = <Overview now={now} data={{
    ribbon: matches.ribbon, quick: front.quick, cover: front.cover, followups: front.followups,
    updates, updateTab, deepReads, bites: biteGroups, transfers: groupsOf(transfers),
    standings, highlights: matches.highlights, fans,
    viewer: { signedIn: viewer.signedIn, clubs: viewer.clubs ?? [], next: viewer.fixtures?.upcoming[0] ?? null },
    briefReady: result.kind === "ready",
  }} />;
  // Crests for the morning brief match cards below the front.
  const crests = await crestsByName(result.kind === "ready" ? result.view.sections.flatMap((section) => section.items.flatMap((entry) => entry.item.match ? [entry.item.match.home, entry.item.match.away] : [])) : []);
  return <MorningHomepage result={result} now={now} crests={crests} front={overview} />;
}
