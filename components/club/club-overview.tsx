import Link from "next/link";
import type { ClubFixtures, ClubScorer, ClubTable } from "../../types/club-hub";
import type { FeedListResult } from "../../types/feed-card";
import type { FixtureRow } from "../../types/league-hub";
import { clubHref } from "../../lib/club-presentation";
import { leagueHref } from "../../lib/league-presentation";
import { matchTimeZone, formatMatchTime } from "../../lib/match-presentation";
import { newsAbsoluteTime, newsRelativeTime } from "../../lib/news-presentation";
import type { ClubExtraHonour, ClubHonour } from "../../services/club-honours";
import type { ClubCoaches, CoachStint } from "../../services/club-coaches";
import { Mark } from "../ui/crest-mark";

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

/** The club's honours in a few lines (league titles and other trophies together), with the way to the full history. */
export function HonoursSummary({ honours, extras = [], historyHref }: { honours: ClubHonour[]; extras?: ClubExtraHonour[]; historyHref: string }) {
  const rows = [...honours.filter((item) => item.titles > 0).map((item) => ({ key: item.slug, label: item.label, titles: item.titles, lastTitle: item.lastTitle })), ...extras.map((item) => ({ key: item.key, label: item.label, titles: item.titles, lastTitle: item.lastTitle }))].sort((x, y) => y.titles - x.titles);
  if (!rows.length) return null;
  return <section className="dp-panel cb-panel" aria-label="Danh hiệu">
    <div className="dp-section-heading"><h2>Danh hiệu</h2><Link href={historyHref}>Lịch sử →</Link></div>
    <ul className="cb-honours">{rows.slice(0, 4).map((item) => <li key={item.key}><b>{item.titles}</b><span>{item.label}<small>Vô địch{item.lastTitle ? ` · gần nhất ${item.lastTitle}` : ""}</small></span></li>)}</ul>
  </section>;
}


const rate = (value: number | null) => value === null ? "–" : `${Math.round(value * 100)}%`;
const perMatch = (value: number | null) => value === null ? "–" : value.toLocaleString("vi-VN", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const tenure = (coach: CoachStint) => coach.from ? `${coach.from.slice(0, 4)} – ${coach.to ? coach.to.slice(0, 4) : "nay"}` : "Hiện tại";
const dayText = (value: string | null) => { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value ?? ""); return m ? (m[3] ? `${Number(m[3])}/${Number(m[2])}/${m[1]}` : `${Number(m[2])}/${m[1]}`) : value; };
const shortName = (name: string) => name.split(" ").slice(-1)[0];

/** Head coaches: the current one, a win-rate bar per recent coach (newest on the right) and the whole list with records. */
export function ClubCoachesPanel({ data }: { data: ClubCoaches }) {
  const { coaches } = data;
  const current = coaches.find((coach) => coach.current) ?? null;
  const measured = coaches.filter((coach) => coach.winRate !== null && (coach.played ?? 0) >= 5).slice(0, 8).reverse();
  const shown = coaches.slice(0, 10); const rest = coaches.slice(10);
  const row = (coach: CoachStint) => <li key={`${coach.name}-${coach.from}`}>
    <span><b>{coach.name}</b><small>{[coach.nationality, coach.honours].filter(Boolean).join(" · ")}</small></span>
    <span>{tenure(coach)}</span>
    <span>{coach.played ? `${coach.played} trận · ${coach.won}T ${coach.drawn}H ${coach.lost}B` : "Chưa có số liệu trận"}</span>
    <span className="num">{rate(coach.winRate)}</span>
  </li>;
  return <section className="dp-panel cb-coaches" aria-labelledby="club-coaches">
    <div className="dp-section-heading"><h2 id="club-coaches">Huấn luyện viên</h2><span className="cb-sources">Nguồn: {data.sources.map((source, index) => <span key={source.url}>{index > 0 ? " · " : ""}<a href={source.url} target="_blank" rel="noopener noreferrer">{source.label.replace(" (danh sách HLV)", "").replace(" (bài về CLB)", "")}</a></span>)}</span></div>
    {current && <p className="cb-coach-now"><Mark name={current.name} size="md" round /><span><b>{current.name}</b><small>Đang dẫn dắt{current.from ? ` từ ${dayText(current.from)}` : ""}{current.nationality ? ` · ${current.nationality}` : ""}{current.played ? ` · ${current.played} trận, thắng ${rate(current.winRate)}` : ""}</small></span></p>}
    {measured.length > 1 && <><h3 className="cb-subhead">Tỷ lệ thắng theo huấn luyện viên</h3>
      <ul className="cb-bars" aria-label="Tỷ lệ thắng và điểm mỗi trận của các huấn luyện viên gần đây">{measured.map((coach) => <li key={`${coach.name}-${coach.from}`} className={coach.winRate! < 0.4 ? "low" : ""} aria-label={`${coach.name}, ${tenure(coach)}: thắng ${rate(coach.winRate)}, ${perMatch(coach.pointsPerMatch)} điểm mỗi trận`}>
        <div className="cb-bar-track" aria-hidden="true"><div className="cb-bar" style={{ height: `${Math.max(coach.winRate! * 100, 18)}%` }}>{rate(coach.winRate)}</div></div>
        <span className="cb-bar-ppg" aria-hidden="true">{perMatch(coach.pointsPerMatch)} Đ</span>
        <span className="cb-bar-name" aria-hidden="true"><b>{shortName(coach.name)}</b><small>{tenure(coach)}</small></span></li>)}</ul>
      <p className="dp-muted cb-note">Thắng % và điểm mỗi trận (Đ) tính trên mọi giải đấu trong thời gian dẫn dắt, theo số liệu Wikipedia; chỉ tính huấn luyện viên đã dẫn dắt từ 5 trận.</p></>}
    {measured.length <= 1 && coaches.length > 0 && <p className="dp-muted cb-note">Nguồn dữ liệu của CLB này chỉ có thời gian dẫn dắt, chưa có số trận thắng/hòa/thua của từng huấn luyện viên.</p>}
    <h3 className="cb-subhead">Tất cả huấn luyện viên</h3>
    <ul className="cb-coach-list">{shown.map(row)}</ul>
    {rest.length > 0 && <details className="cb-coach-more"><summary>Xem thêm {rest.length} huấn luyện viên trước đó</summary><ul className="cb-coach-list">{rest.map(row)}</ul></details>}
  </section>;
}

/** The history tab: every competition the club has won or finished second in, with the seasons. */
export function ClubHistory({ honours, extras, coaches, clubName }: { honours: ClubHonour[]; extras: ClubExtraHonour[]; coaches: ClubCoaches | null; clubName: string }) {
  const total = honours.reduce((sum, item) => sum + item.titles, 0) + extras.reduce((sum, item) => sum + item.titles, 0);
  if (!honours.length && !extras.length && !coaches) return <div className="dp-empty" role="status"><span aria-hidden="true">f.</span><h3>Chưa có dữ liệu danh hiệu</h3><p>Fotban lưu bảng vàng của Ngoại hạng Anh, La Liga, Ligue 1 và Champions League; {clubName} chưa có mùa vô địch hay á quân nào trong các danh sách đó.</p></div>;
  return <div className="cb-history">
  {total > 0 && <p className="cb-total"><b>{total}</b>danh hiệu trong các giải Fotban lưu số liệu (giải quốc nội, cúp quốc gia và cúp châu Âu)</p>}
  {honours.map((item) => <section className="dp-panel" key={item.slug} aria-labelledby={`honour-${item.slug}`}>
    <div className="dp-section-heading"><h2 id={`honour-${item.slug}`}>{item.label}</h2><Link href={`${leagueHref(item.slug, { tab: "mua-giai" })}&clb=${encodeURIComponent(clubName)}`}>Xem trong tab Mùa giải →</Link></div>
    <dl className="cb-facts">
      <div><dt>Vô địch</dt><dd>{item.titles}</dd></div><div><dt>Á quân</dt><dd>{item.runnerUps}</dd></div>
      {item.firstTitle && <div><dt>Lần đầu</dt><dd>{item.firstTitle}</dd></div>}{item.lastTitle && <div><dt>Gần nhất</dt><dd>{item.lastTitle}</dd></div>}
      {item.longestStreak && <div><dt>Chuỗi dài nhất</dt><dd>{item.longestStreak.years} năm liên tiếp<small>{item.longestStreak.from} → {item.longestStreak.to}</small></dd></div>}
      {item.bestSeason && <div><dt>Nhiều điểm nhất</dt><dd>{item.bestSeason.points} điểm<small>{item.bestSeason.season}</small></dd></div>}
    </dl>
    {item.seasons.length > 0 && <><h3>Các mùa vô địch</h3><ul className="cb-years">{item.seasons.map((season) => <li key={season.season}><b>{season.season}</b><span>{season.points != null ? `${season.points} điểm` : season.score ? `thắng ${season.runnerUp ?? ""} ${season.score}` : "vô địch"}{season.points != null && season.runnerUp ? ` · á quân ${season.runnerUp}` : ""}</span></li>)}</ul></>}
  </section>)}
  {extras.length > 0 && <section className="dp-panel" aria-labelledby="honour-extra"><div className="dp-section-heading"><h2 id="honour-extra">Các giải khác</h2><span>Số lần vô địch</span></div>
    <div className="cb-extra">{extras.map((item) => <div key={item.key}><b>{item.titles}</b><span>{item.label}</span><small>{item.country ? `${item.country} · ` : ""}gần nhất {item.lastTitle}{item.titles > 1 && item.firstTitle ? ` · lần đầu ${item.firstTitle}` : ""}</small></div>)}</div></section>}
  {coaches && <ClubCoachesPanel data={coaches} />}
  <p className="dp-note">Tổng hợp từ các trang Wikipedia, đối chiếu Wikidata; điểm số có từ mùa 1995/96. Ngoại hạng Anh tính cả giải hạng nhất nước Anh từ 1888, Champions League tính cả Cúp C1 từ 1955.</p></div>;
}

/** Story rows (publisher, headline, time) for the overview: compact on purpose, the full cards live on the news tab. */
export function StoryRows({ result, now, limit, title, more }: { result: FeedListResult | null; now: Date; limit: number; title: string; more?: { href: string; label: string } }) {
  if (!result || result.kind !== "ready" || !result.data.groups.length) return null;
  return <section aria-label={title} className="cb-stories"><div className="dp-section-heading"><h2>{title}</h2>{more && <Link href={more.href}>{more.label}</Link>}</div>
    <ol className="fd-sources">{result.data.groups.slice(0, limit).map((group) => <li key={group.lead.articleId}><Link href={`/news/${group.lead.slug}`}><b>{group.lead.publisher}</b><span>{group.lead.title}{group.others.length > 0 ? <small> +{group.others.length} báo</small> : null}</span><time dateTime={group.lead.publishedAt} title={newsAbsoluteTime(group.lead.publishedAt)}>{newsRelativeTime(group.lead.publishedAt, now)}</time></Link></li>)}</ol></section>;
}
