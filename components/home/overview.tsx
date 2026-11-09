import Link from "next/link";
import type { FeedCardView, FeedGroupView } from "../../types/feed-card";
import type { FixtureRow } from "../../types/league-hub";
import type { HomeStandings } from "../../services/home-front-data";
import type { DayMode, HotReason, RibbonMatch, UpdateTab, WatchMatch } from "../../services/home-overview";
import type { ArchiveClip } from "../../services/match-timeline";
import { feedCertaintyText, feedTransferText } from "../../lib/feed-card-presentation";
import { leagueHref } from "../../lib/league-presentation";
import { clubPath } from "../../lib/club-presentation";
import { safeCrestUrl } from "../../lib/crest";
import { vnClock, vnShortDate } from "../../lib/home-dates";
import { timelineLeague, timelineLeagues } from "../../lib/match-timeline";
import { matchTabHref } from "../../lib/match-tabs";
import { newsAbsoluteTime, newsRelativeTime, storyLabels } from "../../lib/news-presentation";
import type { FanThreadView } from "../../services/fan-threads";
import { FanTalkHome } from "../fan/fan-talk";
import type { HotNow } from "../../services/hot-now";
import { HotNowStrip, MySpacePanel, TopScorersPanel, type HomeScorers, type MineClub } from "./home-extras";
import type { QuickClub } from "./quick-follow";
import { PlayerPhoto } from "../ui/player-photo";
import { CinemaRail, MatchRibbon, OvPhoto, StandingsLeagueSelect, StickyAside, StoryStream, type StoryRow } from "./overview-client";

export type OverviewData = {
  mode: DayMode; collectedAt: string | null;
  ribbon: RibbonMatch[]; followedClubIds: string[]; watch: WatchMatch | null;
  cover: FeedGroupView | null; stories: FeedGroupView[];
  hot: HotNow; hotReasons: Record<string, HotReason>;
  updates: FeedGroupView[]; updateTab: UpdateTab;
  transfers: FeedGroupView[]; bites: FeedGroupView[]; shortNames: Record<string, string>;
  standings: HomeStandings | null; highlights: ArchiveClip[]; fans: { voz: FanThreadView[]; reddit: FanThreadView[] };
  scorers: HomeScorers | null; mine: MineClub[]; suggest: QuickClub[];
  viewer: { signedIn: boolean; clubs: { id: string; name: string }[]; next: FixtureRow | null };
  briefReady: boolean;
};

const cardsOf = (group: FeedGroupView) => [group.lead, ...group.others];
const imageOf = (group: FeedGroupView) => cardsOf(group).find((card) => card.image) ?? null;
const clubsOf = (group: FeedGroupView) => [...new Map(cardsOf(group).flatMap((card) => card.entities).filter((entity) => entity.kind === "club").map((entity) => [entity.id ?? entity.name, entity])).values()];
const leagueOf = (group: FeedGroupView) => timelineLeague(cardsOf(group).flatMap((card) => card.leagueSlugs)[0] ?? "")?.label ?? null;
const typeOf = (card: FeedCardView) => storyLabels[card.storyType] ?? "Bóng đá";
const storyHref = (group: FeedGroupView) => `/news/${group.lead.slug}`;
const papers = (group: FeedGroupView) => new Set(cardsOf(group).map((card) => card.publisher)).size;
const leagueLabels = Object.fromEntries(timelineLeagues.map((league) => [league.slug, league.label]));
const Arrow = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>;
const Play = ({ size = 20 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m9 5 11 7-11 7V5Z" /></svg>;
// eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data crest
const Crest = ({ url }: { url: string | null | undefined }) => { const safe = safeCrestUrl(url); return safe ? <img src={safe} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null; };
function When({ value, now }: { value: string; now: Date }) {
  return <time dateTime={value} title={newsAbsoluteTime(value)}>{newsRelativeTime(value, now)}</time>;
}

/** The line above everything: what kind of day it is and when news was last collected. The only place the page names the time zone. */
function StatusLine({ mode, collectedAt }: { mode: DayMode; collectedAt: string | null }) {
  return <p className={`ov-status ov-status-${mode.kind}`} role="status">
    <span className="ov-status-mode"><i aria-hidden="true" />{mode.text}</span>
    <span className="ov-status-time">{collectedAt ? <>Cập nhật lúc <time dateTime={collectedAt}>{vnClock(collectedAt)}</time> · </> : null}Giờ Việt Nam</span>
  </p>;
}

/** "Hôm nay": one large cover with its picture and four numbered stories, the day's most-covered first. */
function Today({ cover, stories, briefReady, now }: { cover: FeedGroupView | null; stories: FeedGroupView[]; briefReady: boolean; now: Date }) {
  if (!cover) return null;
  const photo = imageOf(cover); const league = leagueOf(cover);
  return <section className="ov-today" aria-labelledby="ov-today">
    <div className="ov-section-heading"><h2 id="ov-today"><span />Hôm nay</h2>{briefReady ? <a href="#ban-tin-sang">Đọc bản tin sáng ↓</a> : <Link href="/news">Tất cả tin <Arrow /></Link>}</div>
    <div className="ov-today-grid">
      <Link className="ov-cover" href={storyHref(cover)}>
        <div className="ov-cover-media"><OvPhoto src={photo?.image ?? null} alt={cover.lead.title} priority /></div>
        <div className="ov-cover-copy">
          <span className="ov-kicker">{typeOf(cover.lead)}{league ? ` · ${league}` : ""}{papers(cover) > 1 ? ` · ${papers(cover)} báo cùng đưa` : ""}</span>
          <h3>{cover.lead.title}</h3>
          {cover.lead.description && <p>{cover.lead.description}</p>}
          <span className="ov-meta"><b>{cover.lead.publisher}</b> · <When value={cover.lead.publishedAt} now={now} />{photo ? ` · Ảnh: ${photo.publisher}` : ""}</span>
        </div>
      </Link>
      {stories.length > 0 && <ol className="ov-today-list">{stories.map((group, index) => <li key={group.key}><Link href={storyHref(group)}>
        <span className="ov-num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <span className="ov-today-copy"><span className="ov-kicker">{typeOf(group.lead)}{leagueOf(group) ? ` · ${leagueOf(group)}` : ""}</span><b>{group.lead.title}</b><span className="ov-meta">{group.lead.publisher} · <When value={group.lead.publishedAt} now={now} />{group.others.length ? ` · +${group.others.length} báo` : ""}</span></span>
      </Link></li>)}</ol>}
    </div>
  </section>;
}

function StandingsRace({ standings }: { standings: HomeStandings }) {
  return <section className="ov-panel ov-table" id="bxh" aria-labelledby="ov-table">
    <div className="ov-section-heading"><h2 id="ov-table">Bảng xếp hạng</h2></div>
    <StandingsLeagueSelect value={standings.league.slug} options={timelineLeagues.map((league) => ({ slug: league.slug, label: league.label }))} />
    <div className="ov-standing ov-standing-head"><span>#</span><span>Đội bóng</span><span>Trận</span><span>HS</span><span title="Điểm">Đ</span></div>
    {standings.rows.slice(0, 8).map((row) => <Link key={row.clubId} className="ov-standing" href={clubPath(row.clubId)}><span>{row.position}</span><span><Crest url={row.crestUrl} />{row.shortName ?? row.name}</span><span>{row.played ?? "–"}</span><span>{row.goalDifference === null ? "–" : row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</span><b>{row.points ?? "–"}</b></Link>)}
    <Link className="text-link" href={leagueHref(standings.league.slug, { tab: "bang-xep-hang" })}>Xem bảng xếp hạng đầy đủ <Arrow /></Link>
  </section>;
}

/** "FOTBAN PLAY": the picture on top and the title on a solid band below it, so the words printed on a thumbnail never clash with ours. */
function Cinema({ clips }: { clips: ArchiveClip[] }) {
  if (!clips.length) return null;
  return <section className="discovery-cinema" aria-labelledby="ov-play">
    <CinemaRail count={clips.length} title={<div><div className="cinema-eyebrow"><span className="youtube-mini"><Play size={10} /></span> FOTBAN PLAY</div><h2 id="ov-play">Highlight mới nhất</h2><p>Bình luận tiếng Việt, từ kênh giữ bản quyền phát sóng tại Việt Nam.</p></div>}>
      {clips.map((clip) => <Link key={clip.videoId} className="cinema-card" href={`${matchTabHref(clip.matchSlug, "du-kien")}#match-highlight`}>
        <span className="cinema-thumb">
          {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail, hotlinked */}
          <img src={`https://i.ytimg.com/vi/${clip.videoId}/mqdefault.jpg`} alt="" loading="lazy" />
          <span className="cinema-play"><Play size={22} /></span>
        </span>
        <span className="cinema-copy"><small>{leagueLabels[clip.leagueSlug] ?? ""} · {vnShortDate(clip.kickoffAt)}</small><b>{clip.home} – {clip.away}</b><span className="cinema-source"><span className="youtube-mini"><Play size={8} /></span>{clip.channelName} · YouTube</span></span>
      </Link>)}
    </CinemaRail>
  </section>;
}

const stageClass = { NEGOTIATION: "status-talks", INTEREST: "status-rumor", RUMOR: "status-rumor" } as const;
const biteColors = ["coral", "blue", "sand", "purple"] as const;
/** "Khám phá": the transfer talk of the day (origin and clubs as the press names them) and short off-the-pitch stories. */
function Explore({ transfers, bites, shortNames, now }: { transfers: FeedGroupView[]; bites: FeedGroupView[]; shortNames: Record<string, string>; now: Date }) {
  if (!transfers.length && !bites.length) return null;
  return <section className="ov-explore" aria-labelledby="ov-explore">
    <div className="ov-section-heading"><h2 id="ov-explore"><span />Khám phá</h2><Link href="/transfers">Toàn cảnh chuyển nhượng <Arrow /></Link></div>
    <div className="ov-explore-grid">
      {transfers.length > 0 && <div className="xp-transfers">
        <h3 className="xp-title">Chuyển động thị trường</h3>
        <ul>{transfers.slice(0, 5).map((group) => {
          const lead = group.lead; const player = cardsOf(group).flatMap((card) => card.entities).find((entity) => entity.kind === "player");
          const clubs = clubsOf(group).slice(0, 2);
          const origin = cardsOf(group).find((card) => card.originHint)?.originHint;
          const status = lead.transferStage ? feedTransferText[lead.transferStage] : feedCertaintyText[lead.certainty];
          return <li key={group.key}><Link className="xp-transfer" href={storyHref(group)}>
            {player?.photoUrl ? <PlayerPhoto photoUrl={player.photoUrl} size="md" round /> : <span className="xp-avatar" aria-hidden="true">{player?.initials ?? "⇄"}</span>}
            <span className="xp-body">
              <b>{player?.name ?? lead.title}</b>
              {player && <span className="xp-headline">{lead.title}</span>}
              <span className="xp-chips">
                <span className={`transfer-status ${lead.transferStage ? stageClass[lead.transferStage] : "status-rumor"}`}><i />{status}</span>
                {clubs.map((club) => <span key={club.id ?? club.name} className="xp-club"><Crest url={club.crestUrl} />{(club.id && shortNames[club.id]) || club.name}</span>)}
                {origin && <span className="xp-origin">theo {origin}</span>}
              </span>
              <span className="ov-meta">{lead.publisher} · <When value={lead.publishedAt} now={now} /></span>
            </span>
          </Link></li>;
        })}</ul>
        <p className="transfer-disclaimer">Trạng thái ghi theo cách báo đưa tin; Fotban chưa đối chiếu với thông báo chính thức của câu lạc bộ.</p>
      </div>}
      {bites.length > 0 && <div className="xp-bites">
        <h3 className="xp-title">Ngoài sân cỏ</h3>
        <div className="bite-rail" tabIndex={0} aria-label="Tin ngắn ngoài sân cỏ, có thể cuộn ngang">{bites.slice(0, 4).map((group, index) => <Link key={group.key} className={`xp-bite bite-${biteColors[index % biteColors.length]}`} href={storyHref(group)}>
          <span className="ov-kicker">{typeOf(group.lead)}</span><b>{group.lead.title}</b><span className="ov-meta">{group.lead.publisher} · <When value={group.lead.publishedAt} now={now} /></span>
        </Link>)}</div>
      </div>}
    </div>
  </section>;
}

/** Lean rows for the client-side "Dòng tin" filter: only what a row shows. */
function storyRows(groups: FeedGroupView[], now: Date): StoryRow[] {
  return groups.map((group, index) => ({
    key: group.key, href: storyHref(group), title: group.lead.title, types: [...new Set(cardsOf(group).map((card) => card.storyType))],
    label: leagueOf(group) ?? typeOf(group.lead), kind: typeOf(group.lead), publisher: group.lead.publisher, papers: group.others.length,
    time: vnClock(group.lead.publishedAt), ago: newsRelativeTime(group.lead.publishedAt, now), publishedAt: group.lead.publishedAt,
    image: imageOf(group)?.image ?? null, fresh: index === 0 && now.getTime() - Date.parse(group.latestAt) < 3_600_000,
    crests: clubsOf(group).flatMap((club) => safeCrestUrl(club.crestUrl) ? [safeCrestUrl(club.crestUrl)!] : []).slice(0, 2),
  }));
}

/**
 * The homepage with real data only; blocks without data are left out. Desktop: status, matches, "Hôm nay", then the story
 * stream beside the reader's clubs, table and scorers, then fans, highlights and "Khám phá". Phones reorder the same
 * blocks with CSS `order` (my clubs right after the matches, the table after the highlights).
 */
export function Overview({ data, now }: { data: OverviewData; now: Date }) {
  const nothing = !data.cover && !data.updates.length && !data.ribbon.length && !data.watch;
  return <div className="overview">
    <h1 className="sr-only">Fotban – Bảng tin bóng đá</h1>
    <StatusLine mode={data.mode} collectedAt={data.collectedAt} />
    <MatchRibbon matches={data.ribbon} watch={data.watch} followed={data.followedClubIds} leagueLabels={leagueLabels} now={now.getTime()} />
    {nothing && <section className="ov-empty" aria-label="Chưa có nội dung mới">
      <h2>Chưa có tin hay trận đấu mới trong tuần này</h2>
      <p>{data.standings || data.scorers ? "Bảng xếp hạng và vua phá lưới vẫn ở bên dưới. " : ""}Bạn có thể xem toàn bộ lịch thi đấu của các giải.</p>
      <Link className="fb-button fb-button-secondary" href="/matches">Lịch thi đấu <Arrow /></Link>
    </section>}
    <Today cover={data.cover} stories={data.stories} briefReady={data.briefReady} now={now} />
    <HotNowStrip hot={data.hot} reasons={data.hotReasons} />
    <div className={`ov-columns${data.updates.length ? "" : " ov-columns-solo"}`}>
      {data.updates.length > 0 && <div className="ov-main"><StoryStream rows={storyRows(data.updates, now)} initialTab={data.updateTab} /></div>}
      <StickyAside label="Đội của tôi, bảng xếp hạng và vua phá lưới">
        <MySpacePanel signedIn={data.viewer.signedIn} mine={data.mine} suggest={data.suggest} now={now} />
        {data.standings && <StandingsRace standings={data.standings} />}
        {data.scorers && <TopScorersPanel scorers={data.scorers} />}
      </StickyAside>
    </div>
    <div className="ov-fans"><FanTalkHome voz={data.fans.voz} reddit={data.fans.reddit} now={now} /></div>
    <Cinema clips={data.highlights} />
    <Explore transfers={data.transfers} bites={data.bites} shortNames={data.shortNames} now={now} />
  </div>;
}
