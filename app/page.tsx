import { preload } from "react-dom";
import { env } from "@/lib/env";
import { homepageMetadata } from "@/lib/homepage-presentation";
import { readHomepage } from "@/services/homepage-page-data";
import { readFeedList } from "@/services/feed-page-data";
import { readClubShortNames, readHomeFans, readHomeHot, readHomeMatches, readHomeScorers, readHomeStandings } from "@/services/home-front-data";
import { biteTypes, dayMode, hotReasons, orderRibbon, parseUpdateTab, splitToday, storyWindow } from "@/services/home-overview";
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
  const [result, ranked, latest, bites, transfers, standings, matches, viewer, fans, hot, scorers] = await Promise.all([
    readHomepage(params.preview), readFeedList({ league: "all", offset: 0 }),
    readFeedList({ league: "all", offset: 0, sort: "latest" }),
    readFeedList({ league: "all", offset: 0, sort: "latest", storyTypes: biteTypes }),
    readFeedList({ league: "all", offset: 0, sort: "latest", storyType: "TRANSFER" }),
    readHomeStandings(params.bxh, now, 8), readHomeMatches(now), viewerFollows(now), readHomeFans(now), readHomeHot(now), readHomeScorers(params.bxh),
  ]);
  // Stories of the last 72 hours, or the whole week when that leaves fewer than five. Each story appears once on the page:
  // "Hôm nay" first, then the stream (the client filters it by type), then the explore blocks.
  const today = splitToday(storyWindow(groupsOf(ranked), now));
  const taken = new Set(today.used);
  const pick = (groups: ReturnType<typeof groupsOf>, limit: number) => groups.filter((group) => !taken.has(group.key)).slice(0, limit).map((group) => { taken.add(group.key); return group; });
  const updates = storyWindow(groupsOf(latest), now).filter((group) => !taken.has(group.key));
  // The stream shows at most ten per filter; the explore blocks skip what "Tất cả" shows.
  for (const group of updates.slice(0, 10)) taken.add(group.key);
  const transferGroups = pick(groupsOf(transfers), 5);
  const biteGroups = pick(groupsOf(bites), 4);
  // For each club the reader follows: its next match and the newest story that names it.
  const storyGroups = [...groupsOf(ranked), ...groupsOf(latest)];
  const followed = viewer.clubs ?? [];
  const mine = followed.map((club) => {
    const group = storyGroups.find((item) => [item.lead, ...item.others].some((card) => card.entities.some((entity) => entity.kind === "club" && entity.id === club.id)));
    const next = viewer.fixtures?.upcoming.find((fixture) => fixture.home.name === club.name || fixture.away.name === club.name) ?? null;
    return { id: club.id, name: club.name, story: group ? { title: group.lead.title, href: `/news/${group.lead.slug}` } : null, next };
  });
  // A reader with no team gets six to choose from: the clubs the day is about, then the table's leaders.
  const known = new Set<string>();
  const suggest = [...hot.topics.filter((topic) => topic.kind === "club").map((topic) => ({ id: topic.id, name: topic.name, crestUrl: topic.crestUrl })), ...(standings?.rows ?? []).map((row) => ({ id: row.clubId, name: row.shortName?.trim() || row.name, crestUrl: row.crestUrl }))]
    .filter((club) => !known.has(club.id) && known.add(club.id)).slice(0, 6);
  // The cover picture is the page's largest paint: start fetching it with the HTML.
  const coverImage = today.cover && [today.cover.lead, ...today.cover.others].find((card) => card.image)?.image;
  if (coverImage?.startsWith("https://")) preload(coverImage, { as: "image", fetchPriority: "high", referrerPolicy: "no-referrer" });
  const transferClubIds = transferGroups.flatMap((group) => [group.lead, ...group.others].flatMap((card) => card.entities.flatMap((entity) => entity.kind === "club" && entity.id ? [entity.id] : [])));
  // Crests for the morning brief match cards below the front, and short club names for the transfer rows.
  const [crests, shortNames] = await Promise.all([
    crestsByName(result.kind === "ready" ? result.view.sections.flatMap((section) => section.items.flatMap((entry) => entry.item.match ? [entry.item.match.home, entry.item.match.away] : [])) : []),
    readClubShortNames(transferClubIds),
  ]);
  const overview = <Overview now={now} data={{
    mode: dayMode(matches.ribbon, now), collectedAt: matches.collectedAt,
    ribbon: orderRibbon(matches.ribbon, followed.map((club) => club.id)), followedClubIds: followed.map((club) => club.id), watch: matches.watch,
    cover: today.cover, stories: today.stories, hot, hotReasons: hotReasons(hot.topics, storyGroups),
    updates, updateTab: parseUpdateTab(params.loai), transfers: transferGroups, bites: biteGroups, shortNames,
    standings, highlights: matches.highlights, fans, scorers, mine, suggest,
    viewer: { signedIn: viewer.signedIn, clubs: followed, next: viewer.fixtures?.upcoming[0] ?? null },
    briefReady: result.kind === "ready",
  }} />;
  return <MorningHomepage result={result} now={now} crests={crests} front={overview} />;
}
