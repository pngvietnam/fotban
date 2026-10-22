import Link from "next/link";
import type { FeedCardView, FeedGroupView } from "../../types/feed-card";
import type { FixtureRow } from "../../types/league-hub";
import type { HomeStandings } from "../../services/home-front-data";
import type { RibbonMatch, UpdateTab } from "../../services/home-overview";
import { updateTabs } from "../../services/home-overview";
import type { ArchiveClip } from "../../services/match-timeline";
import { feedCertaintyText, feedTransferText } from "../../lib/feed-card-presentation";
import { leagueHref } from "../../lib/league-presentation";
import { clubPath } from "../../lib/club-presentation";
import { safeCrestUrl } from "../../lib/crest";
import { formatMatchTime, matchDayKey } from "../../lib/match-presentation";
import { dayNumbers, timelineLeague, timelineLeagues } from "../../lib/match-timeline";
import { matchTabHref } from "../../lib/match-tabs";
import { newsAbsoluteTime, newsRelativeTime, storyLabels } from "../../lib/news-presentation";
import type { FanThreadView } from "../../services/fan-threads";
import { FanTalkHome } from "../fan/fan-talk";
import { PlayerPhoto } from "../ui/player-photo";
import { BiteRail, CinemaRail, MatchRibbon, OvPhoto, StandingsLeagueSelect } from "./overview-client";

export type OverviewData = {
  ribbon: RibbonMatch[];
  quick: FeedGroupView[]; cover: FeedGroupView | null; followups: FeedGroupView[];
  updates: FeedGroupView[]; updateTab: UpdateTab;
  deepReads: FeedGroupView[]; bites: FeedGroupView[]; transfers: FeedGroupView[];
  standings: HomeStandings | null; highlights: ArchiveClip[]; fans: { voz: FanThreadView[]; reddit: FanThreadView[] };
  viewer: { signedIn: boolean; clubs: { id: string; name: string }[]; next: FixtureRow | null };
  briefReady: boolean;
};

const cardsOf = (group: FeedGroupView) => [group.lead, ...group.others];
const imageOf = (group: FeedGroupView) => cardsOf(group).find((card) => card.image) ?? null;
const clubsOf = (group: FeedGroupView) => [...new Map(cardsOf(group).flatMap((card) => card.entities).filter((entity) => entity.kind === "club" && safeCrestUrl(entity.crestUrl)).map((entity) => [entity.name, entity])).values()];
const leagueOf = (group: FeedGroupView) => timelineLeague(cardsOf(group).flatMap((card) => card.leagueSlugs)[0] ?? "")?.label ?? null;
const typeOf = (card: FeedCardView) => storyLabels[card.storyType] ?? "Bóng đá";
const storyHref = (group: FeedGroupView) => `/news/${group.lead.slug}`;
const leagueLabels = Object.fromEntries(timelineLeagues.map((league) => [league.slug, league.label]));
const vnDate = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", ...options }).format(new Date(value));
const Arrow = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>;
const Play = ({ size = 20 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m9 5 11 7-11 7V5Z" /></svg>;
// eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data crest
const Crest = ({ url }: { url: string | null | undefined }) => { const safe = safeCrestUrl(url); return safe ? <img src={safe} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null; };
function When({ group, now }: { group: FeedGroupView; now: Date }) {
  return <time dateTime={group.lead.publishedAt} title={newsAbsoluteTime(group.lead.publishedAt)}>{newsRelativeTime(group.lead.publishedAt, now)}</time>;
}

function QuickPoints({ groups, briefReady }: { groups: FeedGroupView[]; briefReady: boolean }) {
  if (!groups.length) return null;
  return <section className="ov-quick" aria-label="3 điểm tin để bắt đầu">
    <div className="ov-quick-intro"><span>BẠN CẦN BIẾT</span><h2>{groups.length} điểm tin<br />để bắt đầu</h2><small>{briefReady ? <a href="#ban-tin-sang">Đọc bản tin sáng ↓</a> : "Tin nhiều báo cùng đưa"}</small></div>
    {groups.map((group, index) => <Link className="ov-quick-item" key={group.key} href={storyHref(group)}><div><span>{String(index + 1).padStart(2, "0")}</span><small>{typeOf(group.lead)}</small></div><h3>{group.lead.title}</h3>{group.lead.description && <p>{group.lead.description}</p>}</Link>)}
  </section>;
}

function Focus({ cover, followups, now }: { cover: FeedGroupView | null; followups: FeedGroupView[]; now: Date }) {
  if (!cover) return null;
  const photo = imageOf(cover); const league = leagueOf(cover);
  return <section className="editorial-focus" aria-labelledby="ov-focus">
    <div className="ov-section-heading"><h2 id="ov-focus"><span />Chuyện đáng chú ý</h2><span className="desk-section-tag">ĐÁNG ĐỂ DỪNG LẠI</span><Link href="/news">Khám phá thêm ↗</Link></div>
    <Link className="focus-cover" href={storyHref(cover)}>
      <OvPhoto src={photo?.image ?? null} /><div className="focus-cover-shade" />
      <div className="focus-cover-top"><span>{typeOf(cover.lead).toUpperCase()}</span>{league && <span>{league.toUpperCase()}</span>}</div>
      <div className="focus-cover-copy">
        <span className="focus-kicker">{cover.others.length ? `${cover.others.length + 1} BÁO CÙNG ĐƯA TIN` : cover.lead.publisher.toUpperCase()}</span>
        <h2>{cover.lead.title}</h2>
        {cover.lead.description && <p>{cover.lead.description}</p>}
        <div><span className="focus-brand">{cover.lead.publisher.slice(0, 1)}</span><b>{cover.lead.publisher}</b><span><When group={cover} now={now} />{photo ? ` · Ảnh: ${photo.publisher}` : ""}</span><span className="focus-read">Đọc tin →</span></div>
      </div>
    </Link>
    {followups.length > 0 && <div className="focus-followups">{followups.map((group) => {
      const photo = imageOf(group); const club = clubsOf(group)[0];
      return <Link key={group.key} href={storyHref(group)}>
        <div className="focus-followup-image"><OvPhoto src={photo?.image ?? null} />{club && <span><Crest url={club.crestUrl} /></span>}</div>
        <div><small>{(leagueOf(group) ?? typeOf(group.lead)).toUpperCase()}</small><h3>{group.lead.title}</h3><span>{typeOf(group.lead)} · {group.lead.publisher} <b>↗</b></span></div>
      </Link>;
    })}</div>}
  </section>;
}

function Updates({ groups, tab, now }: { groups: FeedGroupView[]; tab: UpdateTab; now: Date }) {
  return <section className="newsroom-updates" id="vua-cap-nhat" aria-labelledby="ov-updates">
    <div className="ov-section-heading"><h2 id="ov-updates"><span />Vừa cập nhật</h2><span className="desk-section-tag"><i />DÒNG TIN TRONG NGÀY</span></div>
    <nav className="desk-filters" aria-label="Loại tin">{updateTabs.map((item) => <Link key={item.key} href={item.key === "tat-ca" ? "/#vua-cap-nhat" : `/?loai=${item.key}#vua-cap-nhat`} scroll={false} aria-current={item.key === tab ? "true" : undefined} className={item.key === tab ? "active" : ""}>{item.label}</Link>)}</nav>
    {!groups.length && <p className="ov-empty-note">Chưa có tin loại này trong mấy ngày gần đây.</p>}
    {groups.map((group, index) => {
      const photo = imageOf(group); const fresh = index === 0 && now.getTime() - Date.parse(group.latestAt) < 3600000;
      return <article className="desk-update" key={group.key}>
        <div className="desk-update-time"><b>{formatMatchTime(group.lead.publishedAt)}</b><span /></div>
        <div className="desk-update-body">
          <div className="desk-update-label"><span>{(leagueOf(group) ?? typeOf(group.lead)).toUpperCase()}</span>{fresh && <small>MỚI</small>}</div>
          <Link className="desk-update-title" href={storyHref(group)}>{group.lead.title}</Link>
          {group.lead.description && <p>{group.lead.description}</p>}
          <div className="desk-update-footer"><span className="desk-team-tags">{clubsOf(group).slice(0, 2).map((club) => <Crest key={club.name} url={club.crestUrl} />)}</span><span>{typeOf(group.lead)} · {group.lead.publisher}{group.others.length ? ` · +${group.others.length} báo` : ""}</span></div>
        </div>
        {photo && <Link className="desk-update-image" href={storyHref(group)} aria-label={`Đọc: ${group.lead.title}`}><OvPhoto src={photo.image} /></Link>}
      </article>;
    })}
    <Link className="desk-more-news" href="/news?tab=moi-nhat">Còn nhiều câu chuyện đang chờ bạn <span>Mở feed Tin tức →</span></Link>
  </section>;
}

function MySpace({ viewer }: { viewer: OverviewData["viewer"] }) {
  const next = viewer.next;
  return <section className="fb-card followed-summary" aria-labelledby="ov-mine">
    <div className="followed-summary-title"><h2 id="ov-mine" className="fb-text fb-text-title">Không gian của tôi</h2><Link className="fb-button fb-button-ghost" href={viewer.signedIn ? "/following" : "/login"}>Quản lý</Link></div>
    {viewer.clubs.length ? <>
      <p className="fb-text fb-text-meta">Đang theo dõi {viewer.clubs.map((club) => club.name).join(", ")}.</p>
      {next && <div className="followed-next"><span className="fb-text fb-text-caption">TRẬN TIẾP THEO</span><Link className="fb-text fb-text-title" href={matchTabHref(next.slug, "du-kien")}>{next.home.name} – {next.away.name}</Link><span className="fb-text fb-text-meta">{dayNumbers(matchDayKey(next.kickoffAt))} · {formatMatchTime(next.kickoffAt)} UTC+7</span></div>}
      <Link className="fb-button fb-button-primary" href="/following">Mở Bảng tin của tôi →</Link>
    </> : <>
      <p className="fb-text fb-text-meta">Theo dõi một màu áo để bắt đầu nhận tin và lịch phù hợp.</p>
      <Link className="fb-button fb-button-primary" href={viewer.signedIn ? "/following" : "/login"}>Chọn đội yêu thích</Link>
    </>}
  </section>;
}

function StandingsRace({ standings }: { standings: HomeStandings }) {
  return <section className="ov-panel ov-table" id="bxh" aria-labelledby="ov-table">
    <div className="ov-section-heading"><h2 id="ov-table">Cuộc đua trên BXH</h2></div>
    <StandingsLeagueSelect value={standings.league.slug} options={timelineLeagues.map((league) => ({ slug: league.slug, label: league.label }))} />
    <div className="ov-standing ov-standing-head"><span>#</span><span>Đội bóng</span><span>Trận</span><span>Điểm</span></div>
    {standings.rows.slice(0, 4).map((row) => <Link key={row.clubId} className="ov-standing" href={clubPath(row.clubId)}><span>{row.position}</span><span><Crest url={row.crestUrl} />{row.shortName ?? row.name}</span><span>{row.played ?? "–"}</span><b>{row.points ?? "–"}</b></Link>)}
    <Link className="text-link" href={leagueHref(standings.league.slug, { tab: "bang-xep-hang" })}>Xem bảng xếp hạng <Arrow /></Link>
  </section>;
}

function DeepReads({ groups }: { groups: FeedGroupView[] }) {
  if (!groups.length) return null;
  return <section className="ov-panel ov-read" aria-labelledby="ov-read">
    <div className="ov-section-heading"><h2 id="ov-read">Đọc sâu hơn</h2><span className="ov-caption">PHÂN TÍCH & PHỎNG VẤN</span></div>
    {groups.map((group, index) => <Link key={group.key} href={storyHref(group)}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{group.lead.title}</h3><p>{typeOf(group.lead)} · {group.lead.publisher}</p></div></Link>)}
  </section>;
}

function Cinema({ clips }: { clips: ArchiveClip[] }) {
  if (!clips.length) return null;
  return <section className="discovery-cinema" aria-label="Video highlight bóng đá">
    <CinemaRail count={clips.length} note="Highlight từ kênh có bản quyền tại Việt Nam" title={<div><div className="cinema-eyebrow"><span className="youtube-mini"><Play size={10} /></span> FOTBAN PLAY</div><h2>Highlight mới nhất<span>.</span></h2><p>Bình luận tiếng Việt, từ kênh giữ bản quyền phát sóng tại Việt Nam.</p></div>}>
      {clips.map((clip, index) => <Link key={clip.videoId} className="cinema-card" href={`${matchTabHref(clip.matchSlug, "du-kien")}#match-highlight`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail, hotlinked */}
        <img src={`https://i.ytimg.com/vi/${clip.videoId}/hqdefault.jpg`} alt="" loading={index === 0 ? "eager" : "lazy"} />
        <div className="cinema-gradient" /><div className="cinema-topline"><span>{(leagueLabels[clip.leagueSlug] ?? "").toUpperCase()}</span><small>{vnDate(clip.kickoffAt, { day: "2-digit", month: "2-digit" })}</small></div><span className="cinema-play"><Play size={24} /></span>
        <div className="cinema-copy"><small>{leagueLabels[clip.leagueSlug]} · {vnDate(clip.kickoffAt, { day: "2-digit", month: "2-digit", year: "numeric" })}</small><h3>{clip.home} – {clip.away}</h3><p>{clip.title}</p><div><span className="cinema-source"><span className="youtube-mini"><Play size={8} /></span>{clip.channelName} · YouTube</span><span>Xem highlight →</span></div></div>
      </Link>)}
    </CinemaRail>
  </section>;
}

const biteColors = ["coral", "blue", "sand", "purple", "lime"] as const;
function Bites({ groups, now }: { groups: FeedGroupView[]; now: Date }) {
  if (!groups.length) return null;
  return <section className="bite-section" aria-label="Tin ngắn vuốt ngang">
    <BiteRail count={groups.length} title={<h2><span />Lướt một chút, biết thêm nhiều</h2>}>
      {groups.map((group, index) => <Link key={group.key} className={`bite-card bite-${biteColors[index % biteColors.length]}`} href={storyHref(group)}>
        <div className="bite-top"><span>{typeOf(group.lead).toUpperCase()}</span><small>{String(index + 1).padStart(2, "0")}</small></div>
        <Crest url={clubsOf(group)[0]?.crestUrl} />
        <h3>{group.lead.title}</h3>{group.lead.description && <p>{group.lead.description}</p>}
        <div className="bite-bottom"><span>{group.lead.publisher} · <When group={group} now={now} /></span><span aria-hidden="true">→</span></div>
      </Link>)}
    </BiteRail>
  </section>;
}

const stageClass = { NEGOTIATION: "status-talks", INTEREST: "status-rumor", RUMOR: "status-rumor" } as const;
function TransferBoard({ groups, now }: { groups: FeedGroupView[]; now: Date }) {
  if (!groups.length) return null;
  return <section className="transfer-center" aria-labelledby="ov-transfers">
    <div className="ov-section-heading"><h2 id="ov-transfers"><span />Chuyển động thị trường</h2><Link href="/transfers">Toàn cảnh thị trường ↗</Link></div>
    <div className="transfer-board no-fee">
      <div className="transfer-board-heading"><span className="transfer-board-icon" aria-hidden="true">⇄</span><div><span>FOTBAN TRANSFER CENTER</span><h3>Mỗi thương vụ, một câu chuyện.</h3></div></div>
      <div className="transfer-column-head" aria-hidden="true"><span>Cầu thủ</span><span>CLB được nhắc tới</span><span>Trạng thái</span></div>
      <div className="transfer-list">{groups.slice(0, 6).map((group) => {
        const lead = group.lead; const player = cardsOf(group).flatMap((card) => card.entities).find((entity) => entity.kind === "player");
        const clubs = [...new Map(cardsOf(group).flatMap((card) => card.entities).filter((entity) => entity.kind === "club").map((entity) => [entity.name, entity])).values()].slice(0, 2);
        const status = lead.transferStage ? feedTransferText[lead.transferStage] : feedCertaintyText[lead.certainty];
        return <article className="transfer-entry" key={group.key}><Link className="transfer-entry-main" href={storyHref(group)}>
          <span className="transfer-player">{player?.photoUrl ? <PlayerPhoto photoUrl={player.photoUrl} size="md" round /> : <span className="transfer-player-avatar">{player?.initials ?? "⇄"}</span>}<span><b>{player?.name ?? lead.title}</b><small>{player ? lead.title : lead.publisher}</small></span></span>
          <span className="transfer-clubs">{clubs.length ? clubs.map((club) => <span key={club.name}><Crest url={club.crestUrl} /><span>{club.name}</span></span>) : <span><span>Chưa rõ CLB</span></span>}</span>
          <span className="transfer-state"><span className={`transfer-status ${lead.transferStage ? stageClass[lead.transferStage] : "status-rumor"}`}><i />{status}</span><small><When group={group} now={now} /> <span>· Chi tiết</span></small></span>
        </Link></article>;
      })}</div>
      <div className="transfer-board-footer"><span>{Math.min(groups.length, 6)} tin chuyển nhượng mới nhất</span><Link href="/transfers">Xem tất cả →</Link></div>
    </div>
    <p className="transfer-disclaimer">Trạng thái ghi theo cách báo đưa tin; Fotban chưa đối chiếu với thông báo chính thức của câu lạc bộ.</p>
  </section>;
}

/** The homepage of prototype v2 with real data only; blocks without stories are left out. */
export function Overview({ data, now }: { data: OverviewData; now: Date }) {
  return <div className="overview overview-energized">
    <h1 className="sr-only">Fotban – Bảng tin bóng đá</h1>
    <MatchRibbon matches={data.ribbon} leagueLabels={leagueLabels} />
    <QuickPoints groups={data.quick} briefReady={data.briefReady} />
    <div className="ov-columns"><div className="ov-main">
      <Focus cover={data.cover} followups={data.followups} now={now} />
      <Updates groups={data.updates} tab={data.updateTab} now={now} />
    </div><aside className="ov-right" aria-label="Không gian của tôi và bảng xếp hạng">
      <MySpace viewer={data.viewer} />
      {data.standings && <StandingsRace standings={data.standings} />}
      <DeepReads groups={data.deepReads} />
    </aside></div>
    <FanTalkHome voz={data.fans.voz} reddit={data.fans.reddit} now={now} />
    <Cinema clips={data.highlights} />
    <Bites groups={data.bites} now={now} />
    <div className="overview-discovery"><TransferBoard groups={data.transfers} now={now} /></div>
  </div>;
}
