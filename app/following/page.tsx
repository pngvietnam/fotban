import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { activeUser } from "../../lib/auth";
import { getDatabase } from "../../lib/db";
import { logger } from "../../lib/logger";
import { prismaSyncDatabase } from "../../lib/sync-database";
import { parseFeedOffset } from "../../lib/feed-card-presentation";
import { FollowingService, type ActiveUser, type FollowedEntity } from "../../services/following";
import { followFixtures, summarizeFollows } from "../../services/following-feed";
import { guestFollowCookie, parseGuestFollowCookie, resolveGuestFollows } from "../../services/guest-follows";
import { leagueUpcoming } from "../../services/league-hub";
import { readFeedList } from "../../services/feed-page-data";
import type { FixtureRow } from "../../types/league-hub";
import { SportsShell } from "../../components/sports-shell";
import { Empty, FixturePanel, StoryGrid } from "../../components/domain/domain-ui";

// Personal page: never indexed, never shared-cached, always evaluated per request.
export const metadata: Metadata = { title: "Bảng tin của tôi | Fotban", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
type Feeds = Awaited<ReturnType<typeof readFeedList>>;
type Loaded = { kind: "unavailable" } | { kind: "ready"; focus: FollowedEntity | null; news: Feeds; fixtures: FixtureRow[] };
const Unavailable = () => <SportsShell section="following"><div className="domain-page"><Empty title="Bảng tin tạm thời chưa khả dụng" text="Vui lòng thử lại sau. Bạn vẫn có thể đọc nội dung công khai." href="/news" label="Đọc tin chung →" /></div></SportsShell>;
const href = (focus: string | null, offset = 0) => { const query = [focus ? `theo=${focus}` : "", offset ? `bao=${offset}` : ""].filter(Boolean).join("&"); return `/following${query ? `?${query}` : ""}`; };

async function load(follows: FollowedEntity[], focusId: string | null, offset: number, now: Date): Promise<Loaded> {
  const db = getDatabase();
  if (!db) return { kind: "unavailable" };
  try {
    const database = prismaSyncDatabase(db);
    const focus = follows.find((item) => item.entityId === focusId) ?? null;
    const summary = await summarizeFollows(database, focus ? [focus] : follows);
    const follow = { entityIds: summary.entityIds, leagueSlugs: summary.leagueSlugs };
    const [news, clubFixtures, leagueFixtures] = await Promise.all([
      readFeedList({ league: "all", offset, follow }),
      followFixtures(database, summary.clubs.map((club) => club.id), now),
      Promise.all(summary.leagues.map((league) => leagueUpcoming(database, league.slug, now, 3))),
    ]);
    const fixtures = [...new Map([...clubFixtures.upcoming, ...leagueFixtures.flat()].sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt)).map((fixture) => [fixture.slug, fixture])).values()].slice(0, 5);
    return { kind: "ready", focus, news, fixtures };
  } catch { logger.warn({ event: "following_read_unavailable" }); return { kind: "unavailable" }; }
}

export default async function FollowingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const offset = parseFeedOffset(params.bao);
  const focusId = typeof params.theo === "string" ? params.theo : null;
  const now = new Date();
  let user: ActiveUser | null = null;
  try { user = await activeUser(await headers()); } catch { logger.warn({ event: "following_session_unavailable" }); }
  const db = getDatabase();
  if (!db) return <Unavailable />;
  let follows: FollowedEntity[];
  try {
    const database = prismaSyncDatabase(db);
    const signedIn = user;
    follows = signedIn ? await new FollowingService(database, async () => signedIn).list() : await resolveGuestFollows(database, parseGuestFollowCookie((await cookies()).get(guestFollowCookie)?.value));
  } catch { logger.warn({ event: "following_follows_unavailable" }); return <Unavailable />; }
  const heading = <div className="personal-board-heading"><div><span className="dp-kicker">KHÁN ĐÀI RIÊNG CỦA BẠN</span><h1 className="dp-page-title">Theo đội mình. Không lạc nhịp.</h1><p className="dp-muted">Tin và lịch được lọc theo những gì bạn theo dõi.</p></div><Link className="dp-secondary" href="/following/manage">Quản lý theo dõi →</Link></div>;
  if (!follows.length) return <SportsShell section="following"><div className="domain-page personal-board">{heading}<div className="dp-panel context-empty"><h2>Khán đài của bạn đang chờ một màu áo</h2><p className="dp-muted">Chọn CLB, giải đấu hoặc cầu thủ. Bạn không cần đăng nhập để lưu lựa chọn trên thiết bị này.</p><div className="personal-actions"><Link className="dp-primary" href="/following/manage">Chọn mục yêu thích</Link><Link className="dp-secondary" href="/news">Tiếp tục đọc tin chung</Link></div></div></div></SportsShell>;
  const data = await load(follows, focusId, offset ?? 0, now);
  if (data.kind === "unavailable") return <Unavailable />;
  const { focus, news, fixtures } = data;
  const entities = focus ? [focus] : follows;
  return <SportsShell section="following"><div className="domain-page personal-board">
    {heading}
    <nav className="personal-filters" aria-label="Lọc mục đang theo dõi"><Link className={focus ? "dp-secondary" : "dp-primary"} aria-current={focus ? undefined : "true"} href="/following">Tất cả</Link>{follows.map((item) => <Link key={`${item.type}:${item.entityId}`} className={focus?.entityId === item.entityId ? "dp-primary" : "dp-secondary"} aria-current={focus?.entityId === item.entityId ? "true" : undefined} href={href(item.entityId)}>{item.name}</Link>)}</nav>
    <div className="personal-reason"><p>Vì bạn theo dõi {entities.map((item) => item.name).join(", ")}.</p><small>Không có thuật toán xếp hạng máy chủ · {user ? "Lựa chọn được lưu trong tài khoản của bạn." : "Lựa chọn được lưu tại trình duyệt, đăng nhập để giữ trên mọi thiết bị."}</small></div>
    <div className="personal-content-columns">
      <div><h2 className="dp-section-title">Câu chuyện dành cho bạn</h2><StoryGrid result={news} now={now} offset={offset ?? 0} href={(next) => href(focus?.entityId ?? null, next)} limit={10} empty={{ title: "Chưa có tin mới", text: "Chưa có tin về những gì bạn theo dõi trong 7 ngày gần đây." }} /></div>
      <FixturePanel title="Cuộc hẹn tiếp theo" fixtures={fixtures} action={{ href: "/matches", label: "Mở lịch toàn bộ →" }} empty="Chưa có trận sắp tới của các mục bạn theo dõi." />
    </div>
  </div></SportsShell>;
}
