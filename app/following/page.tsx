import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { activeUser } from "../../lib/auth";
import { getDatabase } from "../../lib/db";
import { logger } from "../../lib/logger";
import { prismaSyncDatabase } from "../../lib/sync-database";
import { parseFeedOffset } from "../../lib/feed-card-presentation";
import { FollowingService, type ActiveUser } from "../../services/following";
import { followFixtures, summarizeFollows, type FollowFixtures, type FollowSummary } from "../../services/following-feed";
import { readFeedList } from "../../services/feed-page-data";
import { SportsShell } from "../../components/sports-shell";
import { FeedSection } from "../../components/news/feed-section";
import { ClubFixtureLists } from "../../components/club/club-hub";
import { FollowingEmpty, FollowSummaryView } from "../../components/account/following-feed";

// Personal page: never indexed, never shared-cached, always evaluated per request.
export const metadata: Metadata = { title: "Bảng tin của tôi | Football Morning Brief", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
type Feeds = Awaited<ReturnType<typeof readFeedList>>;
type Loaded = { kind: "unavailable" } | { kind: "empty" } | { kind: "ready"; summary: FollowSummary; fixtures: FollowFixtures; news: Feeds; transfers: Feeds; fun: Feeds };
const Unavailable = () => <SportsShell section="account"><h1 className="text-2xl font-bold">Bảng tin tạm thời chưa khả dụng</h1><p className="mt-4 text-sm text-slate-600">Vui lòng thử lại sau. Bạn vẫn có thể đọc nội dung công khai.</p></SportsShell>;

async function load(user: ActiveUser, offset: number, now: Date): Promise<Loaded> {
  const db = getDatabase();
  if (!db) return { kind: "unavailable" };
  try {
    const database = prismaSyncDatabase(db);
    const follows = await new FollowingService(database, async () => user).list();
    if (!follows.length) return { kind: "empty" };
    const summary = await summarizeFollows(database, follows);
    const follow = { entityIds: summary.entityIds, leagueSlugs: summary.leagueSlugs };
    const [fixtures, news, transfers, fun] = await Promise.all([
      followFixtures(database, summary.clubs.map((club) => club.id), now),
      readFeedList({ league: "all", offset, follow }),
      readFeedList({ league: "all", offset: 0, follow, storyType: "TRANSFER" }),
      readFeedList({ league: "all", offset: 0, follow, storyType: "FUN" }),
    ]);
    return { kind: "ready", summary, fixtures, news, transfers, fun };
  } catch { logger.warn({ event: "following_read_unavailable" }); return { kind: "unavailable" }; }
}
const top = (result: Feeds, n: number): Feeds => result.kind === "ready" ? { kind: "ready", data: { groups: result.data.groups.slice(0, n), nextOffset: null } } : result;
const hasGroups = (result: Feeds) => result.kind === "ready" && result.data.groups.length > 0;
const href = (next: number) => `/following${next ? `?bao=${next}` : ""}`;

export default async function FollowingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const offset = parseFeedOffset((await searchParams).bao);
  let user: ActiveUser | null;
  try { user = await activeUser(await headers()); } catch { logger.warn({ event: "following_session_unavailable" }); return <Unavailable />; }
  if (!user) redirect(`/login?returnTo=${encodeURIComponent("/following")}`);
  const now = new Date();
  const data = await load(user, offset ?? 0, now);
  if (data.kind === "unavailable") return <Unavailable />;
  if (data.kind === "empty") return <SportsShell section="account"><h1 className="mb-6 text-3xl font-bold tracking-tight">Bảng tin của tôi</h1><FollowingEmpty /></SportsShell>;
  const { summary, fixtures, news, transfers, fun } = data;
  return <SportsShell section="account">
    <header className="mb-6"><h1 className="text-3xl font-bold tracking-tight">Bảng tin của tôi</h1><p className="mt-2 text-sm leading-7 text-slate-600">Tin, lịch và kết quả của những đội, cầu thủ và giải bạn theo dõi, gom về một chỗ.</p></header>
    <FollowSummaryView summary={summary} />
    <div className="space-y-6">
      {(fixtures.upcoming.length > 0 || fixtures.recent.length > 0) && <ClubFixtureLists fixtures={fixtures} />}
      {offset === null ? <p role="status" className="text-sm text-slate-600">Trang không hợp lệ.</p> : <FeedSection result={news} filters={{ league: "all", offset }} now={now} href={href} emptyText="Chưa có tin mới về những gì bạn theo dõi trong 7 ngày gần đây." />}
      {hasGroups(transfers) && <div><h2 className="mb-3 text-lg font-bold tracking-tight">Chuyển nhượng bạn quan tâm</h2><FeedSection result={top(transfers, 4)} filters={{ league: "all", offset: 0 }} now={now} href={href} /></div>}
      {hasGroups(fun) && <div><h2 className="mb-3 text-lg font-bold tracking-tight">Vui</h2><FeedSection result={top(fun, 3)} filters={{ league: "all", offset: 0 }} now={now} href={href} /></div>}
    </div>
  </SportsShell>;
}
