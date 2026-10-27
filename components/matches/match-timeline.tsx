import Link from "next/link";
import { formatMatchTime, formatRound, isMatchStale, matchStatusLabels, teamMonogram, teamName } from "../../lib/match-presentation";
import { compareRounds, dayNumbers, dayShort, fixtureState, shiftDayKey, shortSeason, shortWeekday, sideScores, timelineHref, timelineLeague, timelineLeagues, timelineStatuses, timelineStatusValues, weekdayLabel, type TimelineView } from "../../lib/match-timeline";
import { longDay } from "../../lib/match-filters";
import { leagueHref } from "../../lib/league-presentation";
import { safeCrestUrl } from "../../lib/crest";
import { matchTabHref } from "../../lib/match-tabs";
import type { MatchSummary, MatchTeam } from "../../types/match-ui";
import type { LeagueSlug } from "../../types/league-hub";
import type { TimelineData, TimelineSidebar } from "../../services/match-timeline";
import { MatchAttribution } from "./match-attribution";
import { FixturePin, RememberSchedule, TimelineDatePicker } from "./timeline-client";

const paths: Record<string, string> = { calendar: "M4 5h16v16H4z M8 3v4m8-4v4M4 10h16", arrow: "M5 12h14m-5-5 5 5-5 5", star: "m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z", ball: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M8 9l4-3 4 3-2 5h-4z", cup: "M7 3h10v6a5 5 0 0 1-10 0z M7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 2v7m-4 0h8", play: "m9 5 11 7-11 7z" };
function MI({ name, size = 18 }: { name: keyof typeof paths; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
function Crest({ url: raw, team }: { url: string | null | undefined; team: MatchTeam | null }) {
  const url = safeCrestUrl(raw);
  // eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data crest
  return url ? <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="md-crest-fallback" aria-hidden="true">{teamMonogram(team)}</span>;
}
const dayMonth = (value: string | Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" }).format(new Date(value));
const formLetter = { W: ["T", ""], D: ["H", "draw"], L: ["B", "loss"] } as const;

function Fixture({ match, highlighted, now }: { match: MatchSummary; highlighted: boolean; now: Date }) {
  const state = fixtureState(match.status);
  const scores = state === "upcoming" || state === "postponed" ? null : sideScores(match);
  const home = teamName(match.homeClub, "home"); const away = teamName(match.awayClub, "away");
  const when = state === "finished" ? "FT" : state === "upcoming" ? formatMatchTime(match.kickoffAt) : state === "postponed" ? matchStatusLabels[match.status as "POSTPONED" | "CANCELLED"] : match.status === "HALFTIME" ? "HT" : "Live";
  const label = state === "finished" ? "Đã kết thúc" : state === "upcoming" ? "Sắp diễn ra" : match.status === "POSTPONED" ? "Chờ lịch mới" : match.status === "CANCELLED" ? "Đã hủy" : `${matchStatusLabels[match.status]}${isMatchStale(match, now) ? " · Có thể đã cũ" : ""}`;
  const homeWon = Boolean(scores && scores.home > scores.away);
  const awayWon = Boolean(scores && scores.away > scores.home);

  return <article className={`md-fixture-card fixture-${state}`}>
    <Link className="md-fixture-main" href={matchTabHref(match.slug, "du-kien")} aria-label={`${home} ${scores ? `${scores.home} – ${scores.away}` : "gặp"} ${away}, ${label}`}>
      <span className="md-fixture-when">
        <b>{when}</b>
        <small>{shortWeekday(match.kickoffAt)}</small>
        <span className="md-fixture-label">{label}</span>
      </span>
      <span className="md-fixture-matchup">
        <span className={`md-fixture-team md-home-team ${homeWon ? "is-winner" : awayWon ? "is-loser" : ""}`}>
          <b>{home}</b>
          <Crest url={match.homeClub?.externalCrestUrl} team={match.homeClub} />
        </span>
        <span className="md-fixture-score">
          {scores ? <>
            <strong className={homeWon ? "is-winner" : ""}>{scores.home}</strong>
            <span className="md-score-sep">-</span>
            <strong className={awayWon ? "is-winner" : ""}>{scores.away}</strong>
          </> : <span className="md-score-vs">–</span>}
        </span>
        <span className={`md-fixture-team md-away-team ${awayWon ? "is-winner" : homeWon ? "is-loser" : ""}`}>
          <Crest url={match.awayClub?.externalCrestUrl} team={match.awayClub} />
          <b>{away}</b>
        </span>
      </span>
    </Link>
    <div className="md-fixture-aside">
      {state === "finished" && <div className="md-fixture-extras">
        <Link href={matchTabHref(match.slug, "su-kien")} className="md-extra-btn" title="Diễn biến trận"><MI name="ball" size={12} /><span className="md-extra-text">Diễn biến →</span></Link>
        {highlighted ? <Link href={`${matchTabHref(match.slug, "du-kien")}#match-highlight`} className="md-extra-btn md-highlight-btn" title="Xem highlight"><MI name="play" size={11} /><span className="md-extra-text">Xem highlight</span></Link> : <span className="md-no-highlight-badge" title="Chờ highlight hợp lệ"><MI name="play" size={11} /><span className="md-extra-text">Chờ highlight hợp lệ</span></span>}
      </div>}
      <FixturePin id={match.id} label={`${home} – ${away}`} />
    </div>
  </article>;
}

function LeagueGroup({ slug, matches, highlighted, now }: { slug: string; matches: MatchSummary[]; highlighted: Set<string>; now: Date }) {
  const league = timelineLeague(slug)!;
  const season = shortSeason(matches[0].season.name);
  const rounds = [...new Set(matches.map((match) => match.round ?? ""))].sort(compareRounds);
  return <details className="md-league-group md-schedule-group" open>
    <summary className="md-group-heading"><span className={`md-league-emblem emblem-${league.emblem}`}>{league.mark}</span><span><b>{league.label}</b><small>{league.slug === "champions-league" ? `${league.country} · Giai đoạn giải đấu${season ? ` · Mùa ${season}` : ""}` : `${league.country} · ${league.rounds} vòng${season ? ` · Mùa ${season}` : ""}`}</small></span><span className="md-group-count">{matches.length} trận</span><span className="md-collapse" aria-hidden="true" /></summary>
    {rounds.map((round) => {
      const items = matches.filter((match) => (match.round ?? "") === round);
      const numeric = /^\d+$/.test(round);
      return <div className="md-round-section" key={round || "none"}>
        <div className="md-round-title"><b>{numeric ? `${league.roundWord} ${round}` : formatRound(round) ?? "Chưa rõ vòng"}{numeric && <span> / {league.rounds}</span>}</b><span>{dayMonth(items[0].kickoffAt)} – {dayMonth(items[items.length - 1].kickoffAt)} · {items.length} trận</span></div>
        <div className="md-round-grid">{items.map((match) => <Fixture key={match.id} match={match} highlighted={highlighted.has(match.id)} now={now} />)}</div>
      </div>;
    })}
  </details>;
}

function Sidebar({ sidebar, followed }: { sidebar: TimelineSidebar; followed: Set<string> }) {
  const league = timelineLeague(sidebar.leagueSlug)!;
  const spot = sidebar.spotlight;
  const form = (letters: ("W" | "D" | "L")[]) => <span>{letters.map((letter, index) => <i key={index} className={formLetter[letter][1] || undefined}>{formLetter[letter][0]}</i>)}</span>;
  return <aside className="md-right" aria-label="Tâm điểm và bảng xếp hạng">
    {spot && <section className="md-spotlight">
      <div className="md-spotlight-label"><span />TRẬN TÂM ĐIỂM<small>SẮP DIỄN RA</small></div>
      <p className="md-spotlight-league">{league.label}{spot.round ? ` · ${/^\d+$/.test(spot.round) ? `${league.roundWord} ${spot.round}` : formatRound(spot.round)}` : ""}</p>
      <div className="md-feature-teams">
        <div><Crest url={spot.home.crestUrl} team={{ name: spot.home.name }} /><b>{spot.home.name}</b></div><span>vs</span><div><Crest url={spot.away.crestUrl} team={{ name: spot.away.name }} /><b>{spot.away.name}</b></div>
      </div>
      <div className="md-feature-time"><strong>{formatMatchTime(spot.kickoffAt)}</strong><span>{dayMonth(spot.kickoffAt)} · Giờ Việt Nam</span></div>
      {spot.home.position && spot.away.position && <p className="md-feature-context">Hạng {spot.home.position} gặp hạng {spot.away.position} trên bảng xếp hạng {league.label}.</p>}
      {spot.home.form.length > 0 && spot.away.form.length > 0 && <div className="md-form-guide">{form(spot.home.form)}<small>5 trận gần nhất</small>{form(spot.away.form)}</div>}
      <Link href={matchTabHref(spot.slug, "du-kien")}>Xem trước trận <MI name="arrow" size={15} /></Link>
    </section>}
    {sidebar.standings.length > 0 && <section className="md-side-table">
      <div className="md-widget-title"><h2>Cuộc đua trên BXH</h2><MI name="cup" size={17} /></div>
      <div className="md-table-caption"><b>{league.label}</b></div>
      <div className="md-standings-head"><span>#</span><span>Đội bóng</span><span>Trận</span><span>Điểm</span></div>
      {sidebar.standings.slice(0, 5).map((row) => <div className={`md-standing ${followed.has(row.clubId) ? "followed" : ""}`} key={row.clubId}><span>{row.position}</span><span><Crest url={row.crestUrl} team={{ name: row.name, tla: row.tla }} />{row.shortName ?? row.name}{followed.has(row.clubId) && <i aria-label="Đang theo dõi" />}</span><span>{row.played ?? "–"}</span><b>{row.points ?? "–"}</b></div>)}
      {sidebar.standingsFetchedAt && <p className="md-table-update">Cập nhật {formatMatchTime(sidebar.standingsFetchedAt)} · {dayMonth(sidebar.standingsFetchedAt)}</p>}
      <Link href={leagueHref(sidebar.leagueSlug as LeagueSlug, { tab: "bang-xep-hang" })}>Xem BXH đầy đủ <MI name="arrow" size={14} /></Link>
    </section>}
    <section className="md-highlights">
      <div className="md-widget-title"><h2>Bỏ lỡ trận? Xem lại.</h2><MI name="play" size={17} /></div>
      <p>Highlight từ kênh có bản quyền tại Việt Nam</p>
      {sidebar.archive.length ? sidebar.archive.map((clip) => <Link className="md-archive" key={clip.videoId} href={`${matchTabHref(clip.matchSlug, "du-kien")}#match-highlight`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail, hotlinked */}
        <span className="md-archive-image"><img src={`https://i.ytimg.com/vi/${clip.videoId}/hqdefault.jpg`} alt="" loading="lazy" /><i><MI name="play" size={14} /></i></span>
        <span><b>{clip.home} – {clip.away}</b><small>{clip.channelName} · YouTube</small><small>{dayNumbers(new Date(clip.kickoffAt).toISOString().slice(0, 10))}</small></span>
      </Link>) : <div className="md-no-highlight"><MI name="play" size={23} /><p>Chưa có highlight hợp lệ. Video sẽ xuất hiện khi kênh bản quyền đăng tải.</p></div>}
    </section>
    <div className="md-sidebar-footer">T–H–B: Thắng · Hòa · Bại<br />Mọi màu áo. Chung một đam mê.</div>
  </aside>;
}

export type TimelineFollow = { signedIn: boolean; clubs: { id: string; name: string }[] };

/** The matches page of prototype v2: competition tabs, filters, day-by-day timeline and the right column. */
export function MatchTimeline({ view, data, sidebar, follow, now }: { view: TimelineView; data: TimelineData | null; sidebar: TimelineSidebar | null; follow: TimelineFollow; now: Date }) {
  const href = (overrides: Partial<TimelineView>, hash = "") => timelineHref(view, { truoc: 0, sau: 0, ...overrides }, hash);
  const statusOf = (match: MatchSummary, status: TimelineView["status"]) => status === "all" || (timelineStatusValues[status] as string[]).includes(match.status);
  const shown = data?.matches.filter((match) => statusOf(match, view.status)) ?? [];
  const highlighted = new Set(data?.highlighted ?? []);
  const followed = new Set(follow.clubs.map((club) => club.id));
  const dayOf = (match: MatchSummary) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(match.kickoffAt));
  return <div className="matchday">
    <RememberSchedule />
    <div className="md-heading"><div><span className="md-eyebrow">FOTBAN MATCHDAY</span><h1>Trận đấu<span>.</span></h1></div><span className="md-zone"><MI name="calendar" size={14} />Giờ Việt Nam · UTC+7</span></div>
    <nav className="md-competition-tabs" aria-label="Chọn giải đấu">
      <Link href={href({ league: "all" })} aria-current={view.league === "all" ? "page" : undefined} className={view.league === "all" ? "active" : ""}><span className="md-tab-mark tab-mark-0">f.</span>Tất cả</Link>
      {timelineLeagues.map((league) => <Link key={league.slug} href={href({ league: league.slug })} aria-current={view.league === league.slug ? "page" : undefined} className={view.league === league.slug ? "active" : ""}><span className={`md-tab-mark tab-mark-${league.tab}`}>{league.mark}</span>{league.label}</Link>)}
    </nav>
    <div className="md-layout"><div className="md-list-column">
      <div className="md-date-strip" role="navigation" aria-label="Lịch theo ngày">
        {[-3, -2, -1, 0, 1, 2, 3].map((offset) => {
          const iso = shiftDayKey(view.ngay, offset);
          const weekday = weekdayLabel(iso);
          const shortDate = dayShort(iso);
          const isSelected = iso === view.ngay;
          const isToday = iso === view.today;
          return <Link key={iso} href={href({ ngay: iso, truoc: 0, sau: 0 })} className={`md-date-chip ${isSelected ? "selected" : ""} ${isToday ? "is-today" : ""}`} aria-current={isSelected ? "date" : undefined}>
            <span className="md-date-chip-weekday">{isToday ? "Hôm nay" : weekday}</span>
            <strong className="md-date-chip-num">{shortDate}</strong>
            {isToday && <span className="md-date-chip-dot" aria-hidden="true" />}
          </Link>;
        })}
      </div>
      <div className="md-timeline-toolbar">
        <div><MI name="calendar" size={16} /><b>{view.ngay === view.today ? "Hôm nay" : "Ngày đang xem"}</b><span>{dayNumbers(view.ngay)}</span></div>
        <div>
          <Link className={`md-follow-filter ${view.doi ? "active" : ""}`} aria-pressed={view.doi} href={href({ doi: !view.doi })}><MI name="star" size={14} />Đội theo dõi</Link>
          <label className="md-timeline-date"><MI name="calendar" size={14} /><TimelineDatePicker value={view.ngay} base={href({})} /></label>
          {(view.ngay !== view.today || view.truoc > 0 || view.sau > 0) && <Link className="md-return-today" href={href({ ngay: view.today })}>Về hôm nay</Link>}
        </div>
      </div>
      <nav className="md-statusbar" aria-label="Trạng thái trận">{timelineStatuses.map(([value, label]) => <Link key={value} href={href({ status: value })} aria-current={view.status === value ? "true" : undefined} className={view.status === value ? "selected" : ""}>{value === "live" && <i />}{label}<small>{data?.matches.filter((match) => statusOf(match, value)).length ?? 0}</small></Link>)}</nav>
      <div className="md-list-caption"><span>Lướt theo ngày · Giờ Việt Nam</span><small>{shown.length} trận · {data?.days.length ?? 1} ngày đã mở</small></div>
      {view.doi && <div className="md-follow-note">{follow.clubs.length ? <>Đang lọc theo {follow.clubs.map((club) => club.name).join(", ")}.</> : follow.signedIn ? <>Bạn chưa theo dõi đội bóng nào. <Link href="/following">Chọn đội</Link></> : <>Đăng nhập và chọn đội bóng để lọc lịch theo đội của bạn. <Link href="/login">Đăng nhập</Link></>}<Link href={href({ doi: false })}>Bỏ lọc</Link></div>}
      {!data ? <div className="md-timeline-empty" role="alert"><MI name="ball" size={24} /><div><b>Chưa thể tải dữ liệu trận đấu</b><p>Vui lòng thử lại sau ít phút.</p></div></div> : <>
        <div className="md-load-direction md-load-earlier">{data.earlierDays > 0
          ? <Link href={timelineHref(view, { truoc: view.truoc + 2 }, `#md-date-${data.days[0]}`)}><span>↑</span><b>Xem các trận trước đó</b><small>{data.earlierDays} ngày có lịch trước ngày đang xem</small></Link>
          : <p>Đã hiển thị hết các trận trước đó.</p>}</div>
        {data.days.map((day) => {
          const daily = shown.filter((match) => dayOf(match) === day);
          return <section className={`md-date-section ${day === view.today ? "is-today" : ""}`} key={day} id={`md-date-${day}`} aria-labelledby={`md-date-title-${day}`}>
            <div className="md-date-section-heading"><div><span className="md-date-icon"><MI name="calendar" size={15} /></span><h2 id={`md-date-title-${day}`}>{day === view.today ? <>Hôm nay<span>{dayNumbers(day)}</span></> : longDay(day)}</h2></div><small>{daily.length} trận đấu</small></div>
            {!daily.length && <div className="md-timeline-empty"><MI name="ball" size={24} /><div><b>Chưa có trận phù hợp trong ngày này</b><p>Chọn xem các trận trước hoặc sau để tiếp tục khám phá lịch đấu.</p></div></div>}
            {timelineLeagues.filter((league) => daily.some((match) => match.league.slug === league.slug)).map((league) => <LeagueGroup key={league.slug} slug={league.slug} matches={daily.filter((match) => match.league.slug === league.slug)} highlighted={highlighted} now={now} />)}
          </section>;
        })}
        <div className="md-load-direction md-load-later md-upcoming-more">{data.nextUpcoming
          ? <Link scroll={false} href={timelineHref(view, { status: "all", sau: view.sau + 2 })}><span><MI name="calendar" size={21} /></span><b>Xem thêm trận sắp tới</b><small>Từ {dayNumbers(data.nextUpcoming)} · Nhấn để mở thêm lịch thi đấu</small><span className="md-upcoming-chevron">↓</span></Link>
          : <p role="status">Đã hiển thị hết các trận sắp tới đã có lịch.</p>}</div>
        <MatchAttribution matches={data.matches} />
      </>}
      <div className="md-bottom-note"><MI name="ball" size={15} /><p>Không chỉ tỷ số. Cả câu chuyện.<span>Chọn một trận để xem diễn biến, đội hình, thống kê và highlight.</span></p></div>
    </div>
    {sidebar && <Sidebar sidebar={sidebar} followed={followed} />}
    </div>
  </div>;
}
