import Link from "next/link";
import type { ClubFixtures, ClubProfile, ClubScorer, ClubTable } from "../../types/club-hub";
import type { FeedListResult } from "../../types/feed-card";
import type { FixtureRow, StandingRow } from "../../types/league-hub";
import { clubHref } from "../../lib/club-presentation";
import { countryVi } from "../../lib/country-vi";
import { leagueHref } from "../../lib/league-presentation";
import { matchTimeZone, formatMatchTime, matchStatusLabels } from "../../lib/match-presentation";
import { newsAbsoluteTime, newsRelativeTime } from "../../lib/news-presentation";
import type { ClubHonour } from "../../services/club-honours";
import { Mark } from "../ui/crest-mark";
import { FormDots } from "../domain/domain-ui";

type Outcome = "W" | "D" | "L";
const outcomeWord = { W: "Thắng", D: "Hòa", L: "Thua" } as const;
const outcomeLetter = { W: "T", D: "H", L: "B" } as const;
const isHome = (fixture: FixtureRow, clubName: string) => fixture.home.name === clubName;
const opponent = (fixture: FixtureRow, clubName: string) => isHome(fixture, clubName) ? fixture.away : fixture.home;
const finished = (fixture: FixtureRow) => fixture.status === "FINISHED" && fixture.homeScore !== null && fixture.awayScore !== null;
function outcome(fixture: FixtureRow, clubName: string): Outcome | null {
  if (!finished(fixture)) return null;
  const mine = isHome(fixture, clubName) ? fixture.homeScore! : fixture.awayScore!; const theirs = isHome(fixture, clubName) ? fixture.awayScore! : fixture.homeScore!;
  return mine > theirs ? "W" : mine < theirs ? "L" : "D";
}
const matchHref = (slug: string, tab?: string) => `/match/${encodeURIComponent(slug)}${tab ? `?tab=${tab}` : ""}`;
const dayLabel = (iso: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: matchTimeZone, weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(iso));
const pointsWord = (value: number | null) => value === null ? "–" : String(value);

/** The club's own header: crest, name, league, venue, the next match and the ways to follow it. */
export function ClubHero({ club, next, followAction, calendarHref }: { club: ClubProfile; next: FixtureRow | null; followAction: React.ReactNode; calendarHref: string | null }) {
  const subtitle = [countryVi(club.country), club.venue].filter(Boolean).join(" · ");
  return <header className="cb-hero">
    <div className="cb-hero-main">
      <Mark url={club.crestUrl} name={club.name} size="lg" />
      <div className="cb-hero-title">
        {club.league ? <Link className="dp-kicker" href={leagueHref(club.league.slug)}>{club.league.name}</Link> : <span className="dp-kicker">Hồ sơ CLB</span>}
        <h1>{club.name}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="cb-hero-actions">
        {calendarHref && <a className="dp-secondary cb-calendar" href={calendarHref} download><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>Thêm vào lịch</a>}
        {followAction}
      </div>
    </div>
    {next && <p className="cb-hero-next"><b>Trận tới</b> <Link href={matchHref(next.slug)}>{next.home.name} – {next.away.name}</Link> · {dayLabel(next.kickoffAt)} {formatMatchTime(next.kickoffAt)}{next.competition ? ` · ${next.competition.name}` : ""}</p>}
  </header>;
}

/** The next fixture, big: who, when, where (home or away) and which competition. */
export function NextMatchCard({ fixture, clubName }: { fixture: FixtureRow; clubName: string }) {
  const live = fixture.status === "LIVE" || fixture.status === "HALFTIME";
  const label = fixture.status in matchStatusLabels ? matchStatusLabels[fixture.status as keyof typeof matchStatusLabels] : "";
  return <section className="cb-next" aria-label="Trận kế tiếp">
    <div className="cb-next-head"><span className="dp-kicker">{live ? "Đang diễn ra" : "Trận kế tiếp"}</span>{fixture.competition && <span>{fixture.competition.name}</span>}</div>
    <Link className="cb-next-main" href={matchHref(fixture.slug)} aria-label={`${fixture.home.name} gặp ${fixture.away.name}, ${dayLabel(fixture.kickoffAt)} ${formatMatchTime(fixture.kickoffAt)}`}>
      <span className="cb-next-team home"><span>{fixture.home.name}</span><Mark url={fixture.home.crestUrl} name={fixture.home.name} size="lg" /></span>
      <span className="cb-next-when">{live && fixture.homeScore !== null ? <b>{fixture.homeScore} – {fixture.awayScore}</b> : <b>{formatMatchTime(fixture.kickoffAt)}</b>}<small>{live ? label : dayLabel(fixture.kickoffAt)}</small></span>
      <span className="cb-next-team away"><Mark url={fixture.away.crestUrl} name={fixture.away.name} size="lg" /><span>{fixture.away.name}</span></span>
    </Link>
    <p className="cb-next-foot">{isHome(fixture, clubName) ? "Sân nhà" : "Sân khách"} · giờ Việt Nam (UTC+7)<Link href={matchHref(fixture.slug, "doi-dau")}>Đối đầu →</Link></p>
  </section>;
}

/** Position, points, record and form in an even grid, with the way to the full table. */
export function ClubStatStrip({ row, table, tableHref }: { row: StandingRow; table: ClubTable; tableHref: string }) {
  const items: { value: React.ReactNode; label: string }[] = [
    { value: row.position, label: "Hạng" }, { value: pointsWord(row.points), label: "Điểm" }, { value: pointsWord(row.played), label: "Trận" },
    { value: row.won !== null && row.drawn !== null && row.lost !== null ? `${row.won}-${row.drawn}-${row.lost}` : "–", label: "Thắng-Hòa-Thua" },
    { value: row.goalsFor !== null && row.goalsAgainst !== null ? `${row.goalsFor}:${row.goalsAgainst}` : "–", label: "Bàn thắng:thua" },
    { value: row.goalDifference === null ? "–" : row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference, label: "Hiệu số" },
  ];
  return <section className="cb-strip" aria-label={`Thành tích ${table.name}`}>
    <div className="cb-strip-head"><h2>{table.name}</h2><Link href={tableHref}>Bảng xếp hạng đầy đủ →</Link></div>
    <dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}<div><dt>Phong độ</dt><dd><FormDots form={row.form} /></dd></div></dl>
  </section>;
}

/** One fixture row from the club's point of view: the opponent, home or away, the competition, the result or kick-off. */
function ClubFixtureItem({ fixture, clubName }: { fixture: FixtureRow; clubName: string }) {
  const rival = opponent(fixture, clubName); const result = outcome(fixture, clubName);
  const postponed = ["POSTPONED", "CANCELLED", "SUSPENDED"].includes(fixture.status);
  const text = result ? `${outcomeWord[result]} ${fixture.homeScore} – ${fixture.awayScore}` : postponed ? "Hoãn" : formatMatchTime(fixture.kickoffAt);
  return <Link className="cb-fx" href={matchHref(fixture.slug)} aria-label={`${fixture.home.name} gặp ${fixture.away.name}, ${dayLabel(fixture.kickoffAt)}, ${text}`}>
    <span className="cb-fx-date">{dayLabel(fixture.kickoffAt)}<small>{fixture.competition?.name ?? ""}</small></span>
    <span className="cb-fx-rival"><Mark url={rival.crestUrl} name={rival.name} size="md" /><span>{rival.name}<small>{isHome(fixture, clubName) ? "Sân nhà" : "Sân khách"}</small></span></span>
    <span className="cb-fx-result">{result ? <><i className={`form-${result}`} aria-hidden="true">{outcomeLetter[result]}</i><b>{fixture.homeScore} – {fixture.awayScore}</b></> : <b>{postponed ? "Hoãn" : formatMatchTime(fixture.kickoffAt)}</b>}</span>
  </Link>;
}
export function ClubFixtureList({ title, fixtures, clubName, action, empty }: { title: string; fixtures: FixtureRow[]; clubName: string; action?: { href: string; label: string }; empty: string }) {
  return <section className="dp-panel cb-panel" aria-label={title}>
    <div className="dp-section-heading"><h2>{title}</h2>{action && <Link href={action.href}>{action.label}</Link>}</div>
    {fixtures.length ? fixtures.map((fixture) => <ClubFixtureItem key={fixture.slug} fixture={fixture} clubName={clubName} />) : <p className="dp-muted">{empty}</p>}
  </section>;
}

/** How hard the next opponents are, by where they sit in the table today. Never a rating; the position is shown beside the word. */
function difficulty(fixture: FixtureRow, clubName: string, tables: ClubTable[]) {
  const rival = opponent(fixture, clubName);
  const preferred = fixture.competition ? tables.find((table) => table.slug === fixture.competition!.slug) : null;
  for (const table of preferred ? [preferred] : tables) {
    const row = table.data.rows.find((item) => item.name === rival.name);
    if (!row) continue;
    const size = table.data.rows.length;
    return { position: row.position, label: row.position <= size / 3 ? "Khó" : row.position <= (size * 2) / 3 ? "Vừa" : "Dễ", tone: row.position <= size / 3 ? "hard" : row.position <= (size * 2) / 3 ? "mid" : "easy" } as const;
  }
  return null;
}
/** Last five results (oldest to newest) and the next three opponents with their table positions. */
export function FormAndDifficulty({ fixtures, clubName, tables }: { fixtures: ClubFixtures; clubName: string; tables: ClubTable[] }) {
  const recent = [...fixtures.recent].reverse(); const next = fixtures.upcoming.filter((fixture) => !["POSTPONED", "CANCELLED"].includes(fixture.status)).slice(0, 3);
  if (!recent.length && !next.length) return null;
  return <section className="dp-panel cb-panel" aria-label="Phong độ và lịch sắp tới">
    {recent.length > 0 && <><div className="dp-section-heading"><h2>Phong độ</h2><span>Cũ → mới</span></div>
      <ul className="cb-form">{recent.map((fixture) => { const result = outcome(fixture, clubName)!; const rival = opponent(fixture, clubName);
        return <li key={fixture.slug}><Link href={matchHref(fixture.slug)} aria-label={`${outcomeWord[result]} ${fixture.homeScore} – ${fixture.awayScore} trước ${rival.name}`}><i className={`form-${result}`} aria-hidden="true">{outcomeLetter[result]}</i><Mark url={rival.crestUrl} name={rival.name} size="sm" /><b>{fixture.homeScore}–{fixture.awayScore}</b></Link></li>; })}</ul></>}
    {next.length > 0 && <><div className="dp-section-heading cb-sub"><h2>Độ khó 3 trận tới</h2><span>Theo hạng hiện tại của đối thủ</span></div>
      <ul className="cb-hard">{next.map((fixture) => { const rival = opponent(fixture, clubName); const level = difficulty(fixture, clubName, tables);
        return <li key={fixture.slug}><Link href={matchHref(fixture.slug)}><Mark url={rival.crestUrl} name={rival.name} size="md" /><span>{rival.name}<small>{dayLabel(fixture.kickoffAt)} · {isHome(fixture, clubName) ? "Sân nhà" : "Sân khách"}</small></span>
          {level ? <em className={`hard-${level.tone}`}>{level.label}<small>Hạng {level.position}</small></em> : <em className="hard-none">–</em>}</Link></li>; })}</ul></>}
  </section>;
}

/** A few rows of the table around the club, with a switch between its competitions. */
export function MiniTable({ tables, active, clubId, clubSlug }: { tables: ClubTable[]; active: ClubTable; clubId: string; clubSlug: string }) {
  const rows = active.data.rows; const index = rows.findIndex((row) => row.clubId === clubId);
  if (index < 0) return null;
  const start = Math.max(0, Math.min(index - 2, rows.length - 5)); const shown = rows.slice(start, start + 5);
  return <section className="dp-panel cb-panel" aria-label={`Bảng xếp hạng ${active.name}`}>
    <div className="dp-section-heading"><h2>Bảng xếp hạng</h2><Link href={clubHref(clubSlug, { tab: "bang-xep-hang" })}>Đầy đủ →</Link></div>
    {tables.length > 1 && <nav className="cb-switch" aria-label="Giải đấu">{tables.map((table) => <Link key={table.slug} href={clubHref(clubSlug, { giai: table.slug })} aria-current={table.slug === active.slug ? "true" : undefined} className={table.slug === active.slug ? "active" : ""}>{table.name}</Link>)}</nav>}
    <table className="cb-table"><caption className="sr-only">{active.name}: các đội quanh vị trí của {active.row?.name}</caption>
      <thead><tr><th scope="col">#</th><th scope="col">Đội</th><th scope="col">Tr</th><th scope="col">HS</th><th scope="col">Đ</th></tr></thead>
      <tbody>{shown.map((row) => <tr key={row.clubId} className={row.clubId === clubId ? "me" : ""} aria-current={row.clubId === clubId ? "true" : undefined}><td>{row.position}</td>
        <td><Link href={`/club/club-${row.clubId}`}><Mark url={row.crestUrl} name={row.name} size="sm" />{row.shortName?.trim() || row.name}</Link></td><td>{pointsWord(row.played)}</td>
        <td>{row.goalDifference === null ? "–" : row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td><td><b>{pointsWord(row.points)}</b></td></tr>)}</tbody></table>
  </section>;
}

/** The club's players among the stored top scorers of its competitions. */
export function ClubScorers({ scorers }: { scorers: ClubScorer[] }) {
  if (!scorers.length) return null;
  // One row per player: a player in the league and the Champions League lists is shown once, goals added up.
  const byPlayer = new Map<string, ClubScorer[]>();
  for (const scorer of scorers) byPlayer.set(scorer.playerPath ?? scorer.name, [...(byPlayer.get(scorer.playerPath ?? scorer.name) ?? []), scorer]);
  const merged: ClubScorer[] = [...byPlayer.values()].map((rows) => ({ ...rows[0], goals: rows.reduce((sum, row) => sum + row.goals, 0), assists: rows.every((row) => row.assists === null) ? null : rows.reduce((sum, row) => sum + (row.assists ?? 0), 0),
    competition: rows.length > 1 ? rows.map((row) => `${row.competition} ${row.goals}`).join(" · ") : rows[0].competition })).sort((x, y) => y.goals - x.goals);
  return <section className="dp-panel cb-panel" aria-label="Ghi bàn nhiều nhất">
    <div className="dp-section-heading"><h2>Ghi bàn nhiều nhất</h2></div>
    {merged.slice(0, 5).map((scorer) => {
      const body = <><Mark url={scorer.photoUrl} name={scorer.name} size="md" round photo /><span><b>{scorer.name}</b><small>{scorer.competition}{scorer.assists !== null ? ` · ${scorer.assists} kiến tạo` : ""}</small></span><strong>{scorer.goals}<small>bàn</small></strong></>;
      return scorer.playerPath ? <Link className="cb-scorer" key={`${scorer.name}-${scorer.competition}`} href={scorer.playerPath}>{body}</Link> : <div className="cb-scorer" key={`${scorer.name}-${scorer.competition}`}>{body}</div>;
    })}
    <p className="dp-muted cb-note">Theo danh sách vua phá lưới của từng giải; chỉ các cầu thủ của đội nằm trong danh sách đó.</p>
  </section>;
}

/** The club's honours in a few lines, with the way to the full history. */
export function HonoursSummary({ honours, historyHref }: { honours: ClubHonour[]; historyHref: string }) {
  const won = honours.filter((item) => item.titles > 0);
  if (!won.length) return null;
  return <section className="dp-panel cb-panel" aria-label="Danh hiệu">
    <div className="dp-section-heading"><h2>Danh hiệu</h2><Link href={historyHref}>Lịch sử →</Link></div>
    <ul className="cb-honours">{won.slice(0, 3).map((item) => <li key={item.slug}><b>{item.titles}</b><span>{item.label}<small>Vô địch{item.lastTitle ? ` · gần nhất ${item.lastTitle}` : ""}</small></span></li>)}</ul>
  </section>;
}

/** The history tab: every competition the club has won or finished second in, with the seasons. */
export function ClubHistory({ honours, clubName }: { honours: ClubHonour[]; clubName: string }) {
  if (!honours.length) return <div className="dp-empty" role="status"><span aria-hidden="true">f.</span><h3>Chưa có dữ liệu danh hiệu</h3><p>Fotban lưu bảng vàng của Ngoại hạng Anh, La Liga, Ligue 1 và Champions League; {clubName} chưa có mùa vô địch hay á quân nào trong các danh sách đó.</p></div>;
  return <div className="cb-history">{honours.map((item) => <section className="dp-panel" key={item.slug} aria-labelledby={`honour-${item.slug}`}>
    <div className="dp-section-heading"><h2 id={`honour-${item.slug}`}>{item.label}</h2><Link href={`${leagueHref(item.slug, { tab: "mua-giai" })}&clb=${encodeURIComponent(clubName)}`}>Xem trong tab Mùa giải →</Link></div>
    <dl className="cb-facts">
      <div><dt>Vô địch</dt><dd>{item.titles}</dd></div><div><dt>Á quân</dt><dd>{item.runnerUps}</dd></div>
      {item.firstTitle && <div><dt>Lần đầu</dt><dd>{item.firstTitle}</dd></div>}{item.lastTitle && <div><dt>Gần nhất</dt><dd>{item.lastTitle}</dd></div>}
      {item.longestStreak && <div><dt>Chuỗi dài nhất</dt><dd>{item.longestStreak.years} năm liên tiếp<small>{item.longestStreak.from} → {item.longestStreak.to}</small></dd></div>}
      {item.bestSeason && <div><dt>Nhiều điểm nhất</dt><dd>{item.bestSeason.points} điểm<small>{item.bestSeason.season}</small></dd></div>}
    </dl>
    {item.seasons.length > 0 && <><h3>Các mùa vô địch</h3><ul className="cb-years">{item.seasons.map((season) => <li key={season.season}><b>{season.season}</b><span>{season.points != null ? `${season.points} điểm` : season.score ? `thắng ${season.runnerUp ?? ""} ${season.score}` : "vô địch"}{season.points != null && season.runnerUp ? ` · á quân ${season.runnerUp}` : ""}</span></li>)}</ul></>}
  </section>)}
  <p className="dp-note">Tổng hợp từ các trang Wikipedia, đối chiếu Wikidata; điểm số có từ mùa 1995/96. Ngoại hạng Anh tính cả giải hạng nhất nước Anh từ 1888, Champions League tính cả Cúp C1 từ 1955.</p></div>;
}

/** Story rows (publisher, headline, time) for the overview: compact on purpose, the full cards live on the news tab. */
export function StoryRows({ result, now, limit, title, more }: { result: FeedListResult | null; now: Date; limit: number; title: string; more?: { href: string; label: string } }) {
  if (!result || result.kind !== "ready" || !result.data.groups.length) return null;
  return <section aria-label={title} className="cb-stories"><div className="dp-section-heading"><h2>{title}</h2>{more && <Link href={more.href}>{more.label}</Link>}</div>
    <ol className="fd-sources">{result.data.groups.slice(0, limit).map((group) => <li key={group.lead.articleId}><Link href={`/news/${group.lead.slug}`}><b>{group.lead.publisher}</b><span>{group.lead.title}{group.others.length > 0 ? <small> +{group.others.length} báo</small> : null}</span><time dateTime={group.lead.publishedAt} title={newsAbsoluteTime(group.lead.publishedAt)}>{newsRelativeTime(group.lead.publishedAt, now)}</time></Link></li>)}</ol></section>;
}
