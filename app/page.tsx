import { env } from "@/lib/env";
import { homepageMetadata } from "@/lib/homepage-presentation";
import { readHomepage } from "@/services/homepage-page-data";
import { readFeedList } from "@/services/feed-page-data";
import { readMyTeams } from "@/services/my-teams";
import { readHomeStandings } from "@/services/home-front-data";
import { viewerFollows } from "@/services/viewer-follows";
import { MyTeamsSection } from "@/components/home/my-teams";
import { crestsByName } from "@/services/crest-lookup";
import { MorningHomepage } from "@/components/home/morning-homepage";
import { HomeFront, parseHomeFlowTab } from "@/components/home/home-front";

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
  const tab = parseHomeFlowTab(params.dong);
  const viewer = await viewerFollows(now, { fixtures: false });
  // "Dành cho bạn" follows the viewer's clubs, players and leagues when there are any; otherwise it is the ranked feed.
  const [result, ranked, latest, personal, transfers, standings, mine] = await Promise.all([
    readHomepage(params.preview), readFeedList({ league: "all", offset: 0 }),
    tab === "moi-nhat" ? readFeedList({ league: "all", offset: 0, sort: "latest" }) : null,
    tab === "danh-cho-ban" && viewer.follow ? readFeedList({ league: "all", offset: 0, follow: viewer.follow }) : null,
    readFeedList({ league: "all", offset: 0, sort: "latest", storyType: "TRANSFER" }), readHomeStandings(params.bxh, now), readMyTeams(),
  ]);
  const personalGroups = personal ? groupsOf(personal) : [];
  const flow = latest ? groupsOf(latest) : personalGroups.length ? personalGroups : groupsOf(ranked);
  const names = result.kind === "ready" ? result.view.sections.flatMap((section) => section.items.flatMap((entry) => entry.item.match ? [entry.item.match.home, entry.item.match.away] : [])) : [];
  const crests = await crestsByName(names);
  const front = <HomeFront now={now} data={{ ranked: groupsOf(ranked), flow, transfers: groupsOf(transfers), standings, tab, personal: personalGroups.length > 0, briefReady: result.kind === "ready" }} />;
  return <MorningHomepage result={result} now={now} crests={crests} front={front} before={mine ? <MyTeamsSection data={mine} now={now} /> : null} />;
}
