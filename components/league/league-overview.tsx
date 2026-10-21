import Link from "next/link";
import type { ReactNode } from "react";
import type { FeedListResult } from "../../types/feed-card";
import type { ClubRow, FixtureRow, LeagueInfo, LeagueSlug, StandingsData } from "../../types/league-hub";
import type { LeagueRounds } from "../../services/league-hub";
import type { LeagueLeaders } from "../../services/league-leaders";
import type { PlayerBoards, TeamOfWeekPlayer } from "../../services/league-player-stats";
import { fixtureViews, leagueHref, type FixtureView } from "../../lib/league-presentation";
import { dayNumbers, timelineLeague } from "../../lib/match-timeline";
import { formatMatchDate, formatMatchTime, matchDayKey, matchStatusLabels } from "../../lib/match-presentation";
import { newsAbsoluteTime, newsRelativeTime } from "../../lib/news-presentation";
import { clubPath } from "../../lib/club-presentation";
import { safeCrestUrl } from "../../lib/crest";
import { zoneOf, type TableZone } from "../../lib/league-zones";
import { Crest } from "../domain/domain-ui";
import { NewsImage } from "../ui/news-image";
import { PlayerPhoto } from "../ui/player-photo";
import { ClubPicker } from "./club-picker";

const roundWord = (slug: LeagueSlug) => timelineLeague(slug)?.roundWord ?? "Vòng";
const shortSeason = (name: string | null) => name?.replace(/^(\d{4})\/(\d{4})$/, (_, a: string, b: string) => `${a}/${b.slice(2)}`) ?? null;

/**
 * Compact league header: emblem, name, and one line of what matters now (where, which season, which round),
 * with the follow button.
 */
export function LeagueHeader({ league, leaders, rounds, action }: { league: LeagueInfo; leaders: LeagueLeaders | null; rounds: LeagueRounds; action: ReactNode }) {
  const meta = timelineLeague(league.slug);
  const emblem = safeCrestUrl(leaders?.emblemUrl);
  const current = leaders?.currentMatchday ?? rounds.current;
  const line = [league.country, league.seasonName ? `Mùa ${shortSeason(league.seasonName)}` : null, current ? `${roundWord(league.slug)} ${current}${meta?.rounds ? `/${meta.rounds}` : ""}` : null].filter(Boolean);
  return <header className="lg-head">
    {/* eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data emblem */}
    {emblem ? <img className="lg-emblem" src={emblem} alt="" referrerPolicy="no-referrer" /> : <span className="lg-emblem lg-mark" aria-hidden="true">{meta?.mark}</span>}
    <div className="lg-head-text"><h1>{league.name}</h1><p>{line.join(" · ")}</p></div>
    {action}
  </header>;
}

/** `dated`: also show the day (lists that span several days, such as one club's season). */
function FixtureLine({ fixture, dated = false }: { fixture: FixtureRow; dated?: boolean }) {
  const finished = fixture.status === "FINISHED" && fixture.homeScore !== null && fixture.awayScore !== null;
  const live = ["LIVE", "IN_PLAY", "HALFTIME", "PAUSED"].includes(fixture.status) && fixture.homeScore !== null;
  const off = ["POSTPONED", "CANCELLED", "SUSPENDED"].includes(fixture.status);
  const status = fixture.status in matchStatusLabels ? matchStatusLabels[fixture.status as keyof typeof matchStatusLabels] : "";
  const centre = finished || live ? `${fixture.homeScore} – ${fixture.awayScore}` : off ? "—" : formatMatchTime(fixture.kickoffAt);
  const day = dayNumbers(matchDayKey(fixture.kickoffAt)).slice(0, 5);
  const note = [dated ? day : null, finished ? "KT" : live || off ? status : null].filter(Boolean).join(" · ");
  return <li><Link className={`lg-fx ${finished ? "done" : ""} ${live ? "live" : ""}`} href={`/match/${encodeURIComponent(fixture.slug)}`} aria-label={`${fixture.home.name} gặp ${fixture.away.name}${dated ? `, ngày ${day}` : ""}, ${finished || live ? `${fixture.homeScore} - ${fixture.awayScore}` : off ? status : formatMatchTime(fixture.kickoffAt)}${status && !off ? `, ${status}` : ""}`}>
    <span className="lg-fx-team home"><span>{fixture.home.name}</span><Crest url={fixture.home.crestUrl} name={fixture.home.name} /></span>
    <span className="lg-fx-mid"><b>{centre}</b>{note && <small>{note}</small>}</span>
    <span className="lg-fx-team away"><Crest url={fixture.away.crestUrl} name={fixture.away.name} /><span>{fixture.away.name}</span></span>
  </Link></li>;
}

/**
 * One round, FotMob-style: the round with previous/next, its matches grouped by day (score once played, kickoff
 * time before). `tab` keeps the round switch on the tab the reader is on.
 */
export function RoundCard({ slug, rounds, round, tab, more }: { slug: LeagueSlug; rounds: LeagueRounds; round: { number: number; fixtures: FixtureRow[] } | null | undefined; tab: "tong-quan" | "lich-thi-dau"; more?: { href: string; label: string } }) {
  if (!round) return <section className="dp-panel lg-card" aria-labelledby="lg-round"><div className="lg-card-head"><h2 id="lg-round">Lịch thi đấu</h2></div><p className="dp-muted">Chưa có lịch thi đấu của mùa này.</p></section>;
  const index = rounds.rounds.indexOf(round.number);
  const prev = index > 0 ? rounds.rounds[index - 1] : null; const next = index >= 0 && index < rounds.rounds.length - 1 ? rounds.rounds[index + 1] : null;
  const href = (number: number) => leagueHref(slug, { tab, round: number });
  const days = [...new Map(round.fixtures.map((fixture) => [matchDayKey(fixture.kickoffAt), round.fixtures.filter((item) => matchDayKey(item.kickoffAt) === matchDayKey(fixture.kickoffAt))])).values()];
  const title = `${roundWord(slug)} ${round.number}`;
  return <section className="dp-panel lg-card" aria-labelledby="lg-round">
    <div className="lg-card-head">
      <h2 id="lg-round">{title}</h2>
      <nav className="lg-round-nav" aria-label="Chuyển lượt">
        {prev ? <Link href={href(prev)} aria-label={`${roundWord(slug)} ${prev}`}>‹</Link> : <span aria-hidden="true">‹</span>}
        {next ? <Link href={href(next)} aria-label={`${roundWord(slug)} ${next}`}>›</Link> : <span aria-hidden="true">›</span>}
      </nav>
    </div>
    {tab === "lich-thi-dau" && rounds.rounds.length > 1 && <nav className="lg-round-chips" aria-label={`Chọn ${roundWord(slug).toLowerCase()}`}>{rounds.rounds.map((number) => <Link key={number} href={href(number)} aria-current={number === round.number ? "page" : undefined} className={number === round.number ? "active" : undefined}>{number}</Link>)}</nav>}
    {!days.length && <p className="dp-muted">Chưa có trận nào trong {title.toLowerCase()}.</p>}
    {days.map((items) => <div key={items[0].kickoffAt} className="lg-day"><h3>{formatMatchDate(items[0].kickoffAt)}</h3><ul>{items.map((fixture) => <FixtureLine key={fixture.slug} fixture={fixture} />)}</ul></div>)}
    {more && <Link className="lg-more" href={more.href}>{more.label}</Link>}
  </section>;
}

/** The three ways to list fixtures, as a segmented control of links. */
export function FixtureViewSwitch({ slug, view }: { slug: LeagueSlug; view: FixtureView }) {
  return <nav className="lg-views" aria-label="Cách xem lịch thi đấu">{fixtureViews.map(([key, label]) => <Link key={key} href={leagueHref(slug, { tab: "lich-thi-dau", view: key })} aria-current={key === view ? "page" : undefined} className={key === view ? "active" : undefined}>{label}</Link>)}</nav>;
}

/** One match day, with the neighbouring match days a step away and the days around it as chips. */
export function DayCard({ slug, days }: { slug: LeagueSlug; days: { days: string[]; day: string | null; fixtures: FixtureRow[] } | undefined }) {
  if (!days?.day) return <section className="dp-panel lg-card"><p className="dp-muted">Chưa có lịch thi đấu của mùa này.</p></section>;
  const index = days.days.indexOf(days.day);
  const href = (day: string) => leagueHref(slug, { tab: "lich-thi-dau", view: "ngay", day });
  const prev = index > 0 ? days.days[index - 1] : null; const next = index < days.days.length - 1 ? days.days[index + 1] : null;
  const near = days.days.slice(Math.max(0, index - 3), index + 4);
  const label = (day: string) => formatMatchDate(new Date(`${day}T12:00:00+07:00`));
  return <section className="dp-panel lg-card" aria-labelledby="lg-day">
    <div className="lg-card-head">
      <h2 id="lg-day">{label(days.day)}</h2>
      <nav className="lg-round-nav" aria-label="Chuyển ngày thi đấu">
        {prev ? <Link href={href(prev)} aria-label={`Ngày thi đấu trước: ${label(prev)}`}>‹</Link> : <span aria-hidden="true">‹</span>}
        {next ? <Link href={href(next)} aria-label={`Ngày thi đấu sau: ${label(next)}`}>›</Link> : <span aria-hidden="true">›</span>}
      </nav>
    </div>
    <nav className="lg-round-chips" aria-label="Các ngày thi đấu gần đó">{near.map((day) => <Link key={day} href={href(day)} aria-current={day === days.day ? "page" : undefined} className={day === days.day ? "active" : undefined}>{day.slice(8, 10)}/{day.slice(5, 7)}</Link>)}</nav>
    {days.fixtures.length ? <ul className="lg-list">{days.fixtures.map((fixture) => <FixtureLine key={fixture.slug} fixture={fixture} />)}</ul> : <p className="dp-muted">Không có trận nào trong ngày này.</p>}
  </section>;
}

/** One club's season in this competition: results so far, then the matches to come. */
export function ClubSeasonCard({ slug, clubs, club }: { slug: LeagueSlug; clubs: ClubRow[]; club: { clubId: string | null; fixtures: FixtureRow[] } | undefined }) {
  const picked = clubs.find((item) => item.clubId === club?.clubId);
  const played = club?.fixtures.filter((fixture) => fixture.status === "FINISHED") ?? [];
  const coming = club?.fixtures.filter((fixture) => fixture.status !== "FINISHED") ?? [];
  return <section className="dp-panel lg-card" aria-labelledby="lg-club">
    <div className="lg-card-head"><h2 id="lg-club">{picked ? picked.shortName?.trim() || picked.name : "Lịch thi đấu theo đội"}</h2>{picked && <Link href={clubPath(picked.clubId)}>Trang CLB →</Link>}</div>
    <ClubPicker slug={slug} clubs={clubs} selected={club?.clubId ?? null} />
    {!picked && <p className="dp-muted">Chọn một đội để xem toàn bộ lịch và kết quả của đội trong mùa này.</p>}
    {picked && coming.length > 0 && <div className="lg-day"><h3>Sắp tới</h3><ul>{coming.map((fixture) => <FixtureLine key={fixture.slug} fixture={fixture} dated />)}</ul></div>}
    {picked && played.length > 0 && <div className="lg-day"><h3>Đã đá</h3><ul>{[...played].reverse().map((fixture) => <FixtureLine key={fixture.slug} fixture={fixture} dated />)}</ul></div>}
    {picked && !club?.fixtures.length && <p className="dp-muted">Chưa có trận nào của đội này trong mùa.</p>}
  </section>;
}

/** The latest stories as a compact list (headline, publisher, time, picture when the publisher allows it). */
export function NewsList({ result, now, href, limit = 5 }: { result: FeedListResult | null; now: Date; href: string; limit?: number }) {
  if (!result || result.kind !== "ready" || !result.data.groups.length) return null;
  return <section className="dp-panel lg-card" aria-labelledby="lg-news">
    <div className="lg-card-head"><h2 id="lg-news">Tin mới</h2><Link href={href}>Xem tất cả →</Link></div>
    <ul className="lg-news">{result.data.groups.slice(0, limit).map((group) => <li key={group.key}><Link href={`/news/${group.lead.slug}`}>
      <span className="lg-news-text"><b>{group.lead.title}</b><small>{group.lead.publisher} · <time dateTime={group.lead.publishedAt} title={newsAbsoluteTime(group.lead.publishedAt)}>{newsRelativeTime(group.lead.publishedAt, now)}</time>{group.others.length ? ` · +${group.others.length} báo` : ""}</small></span>
      <NewsImage src={group.lead.image} className="lg-news-image" />
    </Link></li>)}</ul>
  </section>;
}

/** The top of the table with zone colours; the full table is a tab away. */
export function StandingsMini({ slug, data, zones, highlight, limit = 8 }: { slug: LeagueSlug; data: StandingsData | undefined; zones: TableZone[]; highlight: string[]; limit?: number }) {
  if (!data?.rows.length) return null;
  const top = data.rows.slice(0, limit);
  const extra = data.rows.filter((row) => row.position > limit && highlight.includes(row.clubId));
  const rows = [...top, ...extra];
  const shown = zones.filter((zone) => rows.some((row) => row.position >= zone.from && row.position <= zone.to));
  return <section className="dp-panel lg-card" aria-labelledby="lg-table">
    <div className="lg-card-head"><h2 id="lg-table">Bảng xếp hạng</h2><Link href={leagueHref(slug, { tab: "bang-xep-hang" })}>Đầy đủ →</Link></div>
    <table className="lg-table"><caption className="sr-only">{limit} đội đầu bảng{extra.length ? " và đội bạn theo dõi" : ""}</caption>
      <thead><tr><th scope="col">#</th><th scope="col">Đội</th><th scope="col"><abbr title="Số trận">Tr</abbr></th><th scope="col"><abbr title="Hiệu số">HS</abbr></th><th scope="col"><abbr title="Điểm">Đ</abbr></th></tr></thead>
      <tbody>{rows.map((row) => { const zone = zoneOf(zones, row.position); return <tr key={row.clubId} className={`${zone ? `zone-${zone.tone}` : ""} ${highlight.includes(row.clubId) ? "followed" : ""}`}>
        <td>{row.position}{zone && <span className="sr-only"> ({zone.label})</span>}</td>
        <th scope="row"><Link href={clubPath(row.clubId)}><Crest url={row.crestUrl} name={row.name} />{row.shortName?.trim() || row.name}</Link></th>
        <td>{row.played ?? "–"}</td><td>{row.goalDifference === null ? "–" : row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td><td><b>{row.points ?? "–"}</b></td>
      </tr>; })}</tbody>
    </table>
    {shown.length > 0 && <ul className="lg-zone-legend" aria-label="Chú thích vị trí">{shown.map((zone) => <li key={zone.label} className={`zone-${zone.tone}`}><i aria-hidden="true" />{zone.label}</li>)}</ul>}
  </section>;
}

/** Top scorers in brief: photo, name, club and goals, from the competition's provider. */
export function TopScorers({ slug, leaders, limit = 5 }: { slug: LeagueSlug; leaders: LeagueLeaders | null; limit?: number }) {
  if (!leaders?.scorers.length) return null;
  return <section className="dp-panel lg-card" aria-labelledby="lg-scorers">
    <div className="lg-card-head"><h2 id="lg-scorers">Vua phá lưới</h2><Link href={leagueHref(slug, { tab: "thong-ke" })}>Xem thêm →</Link></div>
    <ol className="lg-scorers">{leaders.scorers.slice(0, limit).map((scorer) => <li key={scorer.playerId}>
      <span className="lg-rank">{scorer.rank}</span>
      <PlayerPhoto photoUrl={scorer.photoUrl} size="sm" round />
      <span className="lg-scorer-text">{scorer.playerPath ? <Link href={scorer.playerPath}>{scorer.name}</Link> : <b>{scorer.name}</b>}<small><Crest url={scorer.crestUrl} name={scorer.teamName} />{scorer.teamName}</small></span>
      <span className="lg-goals"><b>{scorer.goals}</b><small>bàn</small></span>
    </li>)}</ol>
  </section>;
}

/** The statistics tab: the provider's top scorers with goals, assists, penalties and matches played. */
export function ScorersTable({ leaders }: { leaders: LeagueLeaders | null }) {
  if (!leaders?.scorers.length) return <section className="dp-panel"><h2>Thống kê cầu thủ</h2><p className="dp-muted">Chưa có thống kê ghi bàn của mùa này.</p></section>;
  return <section className="dp-panel lg-card" aria-labelledby="lg-stats">
    <div className="lg-card-head"><h2 id="lg-stats">Vua phá lưới</h2><span>{leaders.scorers.length} cầu thủ ghi nhiều bàn nhất</span></div>
    <div className="lg-scroll"><table className="lg-table lg-stats-table"><caption className="sr-only">Cầu thủ ghi nhiều bàn nhất</caption>
      <thead><tr><th scope="col">#</th><th scope="col">Cầu thủ</th><th scope="col"><abbr title="Số trận">Trận</abbr></th><th scope="col">Bàn</th><th scope="col"><abbr title="Kiến tạo">KT</abbr></th><th scope="col"><abbr title="Phạt đền">PĐ</abbr></th></tr></thead>
      <tbody>{leaders.scorers.map((scorer) => <tr key={scorer.playerId}>
        <td>{scorer.rank}</td>
        <th scope="row"><span className="lg-stat-player"><PlayerPhoto photoUrl={scorer.photoUrl} size="sm" round /><span>{scorer.playerPath ? <Link href={scorer.playerPath}>{scorer.name}</Link> : scorer.name}<small>{scorer.clubId ? <Link href={clubPath(scorer.clubId)}>{scorer.teamName}</Link> : scorer.teamName}</small></span></span></th>
        <td>{scorer.played ?? "–"}</td><td><b>{scorer.goals}</b></td><td>{scorer.assists ?? "–"}</td><td>{scorer.penalties ?? "–"}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="dp-note">Theo football-data.org, cập nhật vài giờ một lần. Dấu – là nhà cung cấp chưa có số liệu. Football data provided by the Football-Data.org API.</p>
  </section>;
}

const positionRows = [["FW", "Tiền đạo"], ["MF", "Tiền vệ"], ["DF", "Hậu vệ"], ["GK", "Thủ môn"]] as const;
/**
 * "Đội hình tiêu biểu": the best 4-3-3 of the round, picked by the provider's match ratings (see
 * teamOfTheWeek). Says how many of the round's matches it is based on and is left out below four players.
 */
export function TeamOfTheWeek({ team, title }: { team: { players: TeamOfWeekPlayer[]; coverage: { matches: number; finished: number }; complete: boolean } | undefined; title: string }) {
  if (!team || team.players.length < 4) return null;
  return <section className="dp-panel lg-card" aria-labelledby="lg-totw">
    <div className="lg-card-head"><h2 id="lg-totw">Đội hình tiêu biểu</h2><span>{title}</span></div>
    <div className="lg-pitch" role="list" aria-label="Đội hình 4-3-3">
      {positionRows.map(([key, label]) => { const players = team.players.filter((player) => player.position === key); return players.length ? <div className="lg-pitch-row" key={key} role="presentation">{players.map((player) => <div className="lg-pitch-player" role="listitem" key={player.key} aria-label={`${label}: ${player.name}, ${player.clubName}, điểm ${player.rating.toFixed(1)}`}>
        <span className="lg-pitch-photo"><PlayerPhoto photoUrl={player.photoUrl} size="md" round /><b className={`lg-rating ${player.rating >= 9 ? "r9" : player.rating >= 7 ? "r7" : "r6"}`}>{player.rating.toFixed(1)}</b></span>
        {player.playerPath ? <Link href={player.playerPath}>{player.name}</Link> : <span>{player.name}</span>}
        <small>{player.clubName}{player.goals || player.assists ? ` · ${[player.goals ? `${player.goals} bàn` : null, player.assists ? `${player.assists} KT` : null].filter(Boolean).join(", ")}` : ""}</small>
      </div>)}</div> : null; })}
    </div>
    <p className="dp-note">Chọn theo điểm của Highlightly (ít nhất 60 phút, tối đa 3 cầu thủ mỗi CLB), dựa trên {team.coverage.matches}/{team.coverage.finished} trận đã đá trong giai đoạn này có điểm số.{team.complete ? "" : " Chưa đủ 11 vị trí."}</p>
  </section>;
}

/** Several leaderboards from the stored box scores, one panel each, with the coverage said plainly. */
export function PlayerBoardsPanel({ boards }: { boards: PlayerBoards | undefined }) {
  if (!boards?.boards.length) return null;
  return <div className="lg-boards">
    <p className="dp-note lg-coverage">Các bảng dưới đây tính từ điểm số và chỉ số từng cầu thủ của Highlightly cho {boards.coverage.matches}/{boards.coverage.finished} trận đã đá của mùa này, nên số liệu tăng dần theo từng vòng.</p>
    {boards.boards.map((board) => <section className="dp-panel lg-card" key={board.key} aria-labelledby={`lg-b-${board.key}`}>
      <div className="lg-card-head"><h2 id={`lg-b-${board.key}`}>{board.title}</h2><span>{board.unit}</span></div>
      <ol className="lg-scorers">{board.leaders.map((leader, index) => <li key={leader.key}>
        <span className="lg-rank">{index + 1}</span><PlayerPhoto photoUrl={leader.photoUrl} size="sm" round />
        <span className="lg-scorer-text">{leader.playerPath ? <Link href={leader.playerPath}>{leader.name}</Link> : <b>{leader.name}</b>}<small><Crest url={leader.crestUrl} name={leader.clubName} />{leader.clubName} · {leader.sub}</small></span>
        <span className="lg-goals"><b>{leader.value}</b></span>
      </li>)}</ol>
    </section>)}
  </div>;
}
