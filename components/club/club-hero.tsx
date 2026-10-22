import Link from "next/link";
import type { ClubProfile, ClubTable } from "../../types/club-hub";
import type { FixtureRow, StandingRow } from "../../types/league-hub";
import { clubHighlights } from "../../lib/club-highlights";
import { countryVi } from "../../lib/country-vi";
import { safeCrestUrl } from "../../lib/crest";
import { leagueHref } from "../../lib/league-presentation";
import { formatMatchTime, matchStatusLabels, matchTimeZone } from "../../lib/match-presentation";
import { FormDots } from "../domain/domain-ui";
import { Mark } from "../ui/crest-mark";
import { Countdown } from "./countdown";

const dayLabel = (iso: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: matchTimeZone, weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(iso));
const matchHref = (slug: string, tab?: string) => `/match/${encodeURIComponent(slug)}${tab ? `?tab=${tab}` : ""}`;
const isHome = (fixture: FixtureRow, clubName: string) => fixture.home.name === clubName;

/**
 * The club's banner: its own colour, a large faded crest, the name, where it plays, the coach, the table position,
 * points and form, and up to three facts worked out from the table and results.
 */
export function ClubHero({ club, table, recent, coach, followAction, calendarHref }: { club: ClubProfile; table: ClubTable | null; recent: FixtureRow[]; coach: string | null; followAction: React.ReactNode; calendarHref: string | null }) {
  const row: StandingRow | null = table?.row ?? null;
  const crest = safeCrestUrl(club.crestUrl);
  const highlights = table && row ? clubHighlights(table.data.rows, club.clubId, recent, club.name, table.name) : [];
  const meta = [countryVi(club.country), club.venue ? `Sân ${club.venue}` : null, coach ? `HLV ${coach}` : null].filter(Boolean) as string[];
  return <header className="cb-hero">
    {crest && (
      // eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data crest, decorative
      <img className="cb-hero-mark" src={crest} alt="" aria-hidden="true" referrerPolicy="no-referrer" />
    )}
    <div className="cb-hero-top">
      <span className="cb-hero-disc"><Mark url={club.crestUrl} name={club.name} size="lg" /></span>
      <div className="cb-hero-title">
        {club.league ? <Link className="cb-hero-kicker" href={leagueHref(club.league.slug)}>{club.league.name}{club.league.seasonName ? ` · ${club.league.seasonName}` : ""}</Link> : <span className="cb-hero-kicker">Hồ sơ CLB</span>}
        <h1>{club.name}</h1>
        {meta.length > 0 && <ul className="cb-hero-meta">{meta.map((item) => <li key={item}>{item}</li>)}</ul>}
      </div>
      <div className="cb-hero-actions">
        {calendarHref && <a className="cb-hero-btn" href={calendarHref} download><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>Thêm vào lịch</a>}
        {followAction}
      </div>
    </div>
    {row && <dl className="cb-hero-stats" aria-label={`Vị trí ở ${table!.name}`}>
      <div><dt>Hạng</dt><dd>{row.position}</dd></div>
      <div><dt>Điểm</dt><dd>{row.points ?? "–"}</dd></div>
      <div className="cb-hero-form"><dt>Phong độ</dt><dd><FormDots form={row.form} /></dd></div>
    </dl>}
    {highlights.length > 0 && <ul className="cb-hero-tags" aria-label="Điểm nhấn của mùa giải">{highlights.map((item) => <li key={item.key}>{item.text}</li>)}</ul>}
  </header>;
}

/** The next fixture as a card with a countdown: who, when, home or away, and which competition. */
export function NextMatchCard({ fixture, clubName, now }: { fixture: FixtureRow; clubName: string; now: number }) {
  const live = fixture.status === "LIVE" || fixture.status === "HALFTIME";
  const label = fixture.status in matchStatusLabels ? matchStatusLabels[fixture.status as keyof typeof matchStatusLabels] : "";
  return <section className="cb-next" aria-label="Trận kế tiếp">
    <div className="cb-next-head"><span className="cb-eyebrow">{live ? "Đang diễn ra" : "Trận kế tiếp"}</span>{fixture.competition && <span>{fixture.competition.name}</span>}</div>
    <Link className="cb-next-main" href={matchHref(fixture.slug)} aria-label={`${fixture.home.name} gặp ${fixture.away.name}, ${dayLabel(fixture.kickoffAt)} ${formatMatchTime(fixture.kickoffAt)}`}>
      <span className="cb-next-team home"><span>{fixture.home.name}</span><Mark url={fixture.home.crestUrl} name={fixture.home.name} size="lg" /></span>
      <span className="cb-next-when">{live && fixture.homeScore !== null ? <b>{fixture.homeScore} – {fixture.awayScore}</b> : <b>{formatMatchTime(fixture.kickoffAt)}</b>}<small>{live ? label : dayLabel(fixture.kickoffAt)}</small></span>
      <span className="cb-next-team away"><Mark url={fixture.away.crestUrl} name={fixture.away.name} size="lg" /><span>{fixture.away.name}</span></span>
    </Link>
    {!live && <Countdown to={fixture.kickoffAt} now={now} />}
    <p className="cb-next-foot">{isHome(fixture, clubName) ? "Sân nhà" : "Sân khách"} · giờ Việt Nam (UTC+7)<Link href={matchHref(fixture.slug, "doi-dau")}>Đối đầu →</Link></p>
  </section>;
}

/** The rest of the season's record (played, W-D-L, goals, goal difference) and the way to the full table. */
export function ClubStatStrip({ row, table, tableHref }: { row: StandingRow; table: ClubTable; tableHref: string }) {
  const items: { value: React.ReactNode; label: string; tone?: "up" | "down" }[] = [
    { value: row.played ?? "–", label: "Trận" },
    { value: row.won !== null && row.drawn !== null && row.lost !== null ? `${row.won}-${row.drawn}-${row.lost}` : "–", label: "Thắng-Hòa-Thua" },
    { value: row.goalsFor !== null && row.goalsAgainst !== null ? `${row.goalsFor}:${row.goalsAgainst}` : "–", label: "Bàn thắng:thua" },
    { value: row.goalDifference === null ? "–" : row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference, label: "Hiệu số", tone: row.goalDifference === null ? undefined : row.goalDifference > 0 ? "up" : row.goalDifference < 0 ? "down" : undefined },
  ];
  const share = row.points !== null && row.played ? row.points / (row.played * 3) : null;
  return <section className="cb-strip" aria-label={`Thành tích ${table.name}`}>
    <div className="cb-strip-head"><h2>{table.name}</h2><Link href={tableHref}>Bảng xếp hạng đầy đủ →</Link></div>
    <dl>{items.map((item) => <div key={item.label} className={item.tone ?? ""}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
    {share !== null && <div className="cb-meter"><div className="cb-meter-bar" role="img" aria-label={`Đã giành ${row.points} trên ${row.played! * 3} điểm tối đa`}><span style={{ width: `${Math.round(share * 100)}%` }} /></div><p>Đã giành <b>{row.points}/{row.played! * 3}</b> điểm tối đa ({Math.round(share * 100)}%)</p></div>}
  </section>;
}
