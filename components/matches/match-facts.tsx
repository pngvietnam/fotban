import Link from "next/link";
import type { ReactNode } from "react";
import type { MatchDetail } from "../../types/match-ui";
import type { FixtureRow, StandingRow } from "../../types/league-hub";
import type { MatchHub } from "../../services/match-hub";
import { formatMatchDate, formatMatchTime, formatPersonName, formatRound, formatUpdated, matchStatusLabels, teamName } from "../../lib/match-presentation";
import { leagueHref, leagueLinks, resultLabel, resultText } from "../../lib/league-presentation";
import { matchTabHref } from "../../lib/match-tabs";
import { playerPath } from "../../lib/player-presentation";
import { ratingTone } from "../../lib/match-lineup-marks";
import { isLeagueSlug } from "../../services/league-hub";
import { Crest } from "../domain/domain-ui";
import { PlayerPhoto } from "../ui/player-photo";

const vnZone = "Asia/Ho_Chi_Minh";
/** "CN, 25 thg 10", as FotMob writes fixture days in Vietnamese. */
const shortDay = (iso: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: vnZone, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
/** "Manchester City FC" -> "Manchester City": the club suffix adds nothing in a compact card. */
export const shortClub = (name: string) => name.replace(/^(AFC|FC|CF)\s+/, "").replace(/\s+(FC|CF|AFC|SC)$/, "");
const competitionLabel = (competition: FixtureRow["competition"]) => competition ? leagueLinks.find((league) => league.slug === competition.slug)?.label ?? competition.name : null;
const isGoal = (type: string) => ["GOAL", "PENALTY", "OWN_GOAL"].includes(type);
const sideOf = (match: MatchDetail, clubId: string | null | undefined) => clubId && clubId === match.homeClub?.id ? "home" : clubId && clubId === match.awayClub?.id ? "away" : null;

/** A shot's place on the match clock: stoppage time stays at the end of its half (45+2 -> 45). */
const clock = (minute: number, added: number | null) => added ? (minute <= 45 ? 45 : minute <= 90 ? 90 : Math.min(minute, 120)) : Math.min(minute, 120);

/**
 * "Thế trận": shots per five minutes for each side (home above the line, away below) with the goals marked,
 * drawn only from the provider's shot list. Nothing is estimated; without enough shots the block is left out.
 */
export function MatchMomentum({ match }: { match: MatchDetail }) {
  const shots = (match.shots ?? []).filter((shot) => shot.minute !== null && sideOf(match, shot.clubId));
  if (shots.length < 4) return null;
  const end = shots.some((shot) => clock(shot.minute!, shot.addedMinute) > 90) ? 120 : 90;
  const size = 5; const buckets = end / size;
  const bucketOf = (at: number) => Math.min(buckets - 1, Math.max(0, Math.ceil(at / size) - 1));
  const counts = (side: "home" | "away") => { const list = Array<number>(buckets).fill(0); for (const shot of shots) if (sideOf(match, shot.clubId) === side) list[bucketOf(clock(shot.minute!, shot.addedMinute))]++; return list; };
  const home = counts("home"); const away = counts("away");
  const peak = Math.max(1, ...home, ...away);
  const width = 720; const middle = 64; const reach = 54; const slot = width / buckets;
  const goals = match.events.filter((event) => isGoal(event.type) && event.minute !== null).map((event) => {
    // An own goal counts for the other side, so its marker sits on the side that scored.
    const scorer = sideOf(match, event.club?.id);
    const side = event.type === "OWN_GOAL" ? (scorer === "home" ? "away" : scorer === "away" ? "home" : null) : scorer;
    return side ? { side, x: (clock(event.minute!, event.addedMinute) / end) * width } : null;
  }).filter((goal): goal is { side: "home" | "away"; x: number } => goal !== null);
  const homeName = teamName(match.homeClub, "home", true); const awayName = teamName(match.awayClub, "away", true);
  const half = (list: number[], first: boolean) => list.slice(first ? 0 : 9, first ? 9 : 18).reduce((sum, value) => sum + value, 0);
  const total = (list: number[]) => list.reduce((sum, value) => sum + value, 0);
  const summary = `Thế trận theo số cú sút mỗi 5 phút. ${homeName}: ${total(home)} cú sút (${half(home, true)} trong hiệp 1, ${half(home, false)} trong hiệp 2). ${awayName}: ${total(away)} cú sút (${half(away, true)} trong hiệp 1, ${half(away, false)} trong hiệp 2).`;
  const ticks = end === 90 ? [0, 15, 30, 45, 60, 75, 90] : [0, 30, 45, 60, 90, 105, 120];
  return <section className="dp-panel mf-card" aria-labelledby="mf-momentum">
    <div className="mf-heading"><h2 id="mf-momentum">Thế trận</h2><span>Cú sút mỗi 5 phút · ● bàn thắng</span></div>
    <div className="mf-legend" aria-hidden="true"><span><i className="home" />{teamName(match.homeClub, "home")} · {total(home)}</span><span><i className="away" />{teamName(match.awayClub, "away")} · {total(away)}</span></div>
    <div className="mf-chart">
    <svg className="mf-momentum" viewBox={`0 0 ${width} ${middle * 2}`} role="img" aria-label={summary} preserveAspectRatio="none">
      <line x1="0" x2={width} y1={middle} y2={middle} className="mf-axis" />
      <line x1={(45 / end) * width} x2={(45 / end) * width} y1="4" y2={middle * 2 - 4} className="mf-half" />
      {home.map((count, index) => count ? <rect key={`h${index}`} className="home" x={index * slot + 2} width={slot - 4} y={middle - (count / peak) * reach} height={(count / peak) * reach} rx="2" /> : null)}
      {away.map((count, index) => count ? <rect key={`a${index}`} className="away" x={index * slot + 2} width={slot - 4} y={middle} height={(count / peak) * reach} rx="2" /> : null)}
    </svg>
    {goals.map((goal, index) => <i key={index} aria-hidden="true" className={`mf-goal ${goal.side}`} style={{ left: `${(goal.x / width) * 100}%` }} />)}
    </div>
    <div className="mf-ticks" aria-hidden="true">{ticks.map((tick) => <span key={tick} style={{ left: `${(tick / end) * 100}%` }}>{tick === 45 ? "HT" : `${tick}′`}</span>)}</div>
  </section>;
}

/** The best-rated player of the match by the provider's rating, with goals and assists from the event list. */
export function PlayerOfMatch({ match }: { match: MatchDetail }) {
  const players = (match.lineups ?? []).flatMap((lineup) => lineup.players.map((player) => ({ ...player, clubId: lineup.clubId })));
  const rated = players.filter((player): player is typeof player & { rating: number } => typeof player.rating === "number");
  if (!rated.length) return null;
  const best = rated.reduce((top, player) => player.rating > top.rating ? player : top);
  const same = (person: { id?: string; name: string } | null, name: string | null | undefined) => Boolean((best.playerId && person?.id === best.playerId) || (name && (name === best.name || name === best.fullName)));
  const goals = match.events.filter((event) => (event.type === "GOAL" || event.type === "PENALTY") && same(event.player, event.playerName)).length;
  const assists = match.events.filter((event) => (event.type === "GOAL" || event.type === "PENALTY") && same(event.relatedPlayer, event.relatedPlayerName)).length;
  const side = sideOf(match, best.clubId);
  const club = side === "home" ? match.homeClub : side === "away" ? match.awayClub : null;
  const facts = [goals ? `${goals} bàn` : null, assists ? `${assists} kiến tạo` : null, best.minutes ? `${best.minutes} phút` : null].filter(Boolean);
  const name = best.name || best.fullName || "";
  return <section className="dp-panel mf-card mf-potm" aria-labelledby="mf-potm">
    <div className="mf-heading"><h2 id="mf-potm">Cầu thủ xuất sắc nhất</h2><span>Theo điểm Highlightly</span></div>
    <div className="mf-potm-body">
      <PlayerPhoto photoUrl={best.photoUrl} size="lg" round />
      <div>
        {best.playerId ? <Link href={playerPath(best.playerId)} className="mf-potm-name">{name}</Link> : <span className="mf-potm-name">{name}</span>}
        {club && <span className="mf-potm-club"><Crest url={club.externalCrestUrl} name={teamName(club, side ?? "home")} />{teamName(club, side ?? "home")}</span>}
        {facts.length > 0 && <span className="mf-potm-facts">{facts.join(" · ")}</span>}
      </div>
      <span className={`mf-potm-rating ${ratingTone(best.rating)}`} aria-label={`Điểm ${best.rating.toFixed(1)}`}>{best.rating.toFixed(1)}</span>
    </div>
  </section>;
}

function NextCard({ fixture }: { fixture: FixtureRow }) {
  const finished = fixture.status === "FINISHED" && fixture.homeScore !== null && fixture.awayScore !== null;
  const off = ["POSTPONED", "CANCELLED", "SUSPENDED"].includes(fixture.status);
  const centre = finished ? `${fixture.homeScore} – ${fixture.awayScore}` : off ? matchStatusLabels[fixture.status as keyof typeof matchStatusLabels] ?? "—" : formatMatchTime(fixture.kickoffAt);
  const label = competitionLabel(fixture.competition);
  return <Link className="mf-next" href={`/match/${encodeURIComponent(fixture.slug)}`} aria-label={`${fixture.home.name} gặp ${fixture.away.name}, ${shortDay(fixture.kickoffAt)}, ${centre}${label ? `, ${label}` : ""}`}>
    {label && <span className="mf-next-comp">{label}</span>}
    <span className="mf-next-crest"><Crest url={fixture.home.crestUrl} name={fixture.home.name} /></span>
    <strong className="mf-next-time">{centre}</strong>
    <span className="mf-next-crest"><Crest url={fixture.away.crestUrl} name={fixture.away.name} /></span>
    <span className="mf-next-name">{shortClub(fixture.home.name)}</span>
    <small className="mf-next-day">{shortDay(fixture.kickoffAt)}</small>
    <span className="mf-next-name">{shortClub(fixture.away.name)}</span>
  </Link>;
}
/** FotMob's "Trận tiếp theo": each club's next fixture as a card (competition, crests, time, names, day). */
export function NextMatchCards({ hub }: { hub: MatchHub }) {
  const fixtures = [hub.home?.next, hub.away?.next].filter((fixture): fixture is FixtureRow => Boolean(fixture));
  const unique = fixtures.filter((fixture, index) => fixtures.findIndex((item) => item.slug === fixture.slug) === index);
  if (!unique.length) return null;
  return <section className="dp-panel mf-card" aria-labelledby="mf-next">
    <div className="mf-heading"><h2 id="mf-next">Trận tiếp theo</h2></div>
    <div className="mf-next-grid">{unique.map((fixture) => <NextCard key={fixture.slug} fixture={fixture} />)}</div>
  </section>;
}

/** Match facts as a compact list for the side column. */
export function MatchInfoList({ match, venueName, weather }: { match: MatchDetail; venueName: string | null; weather: string | null }) {
  const league = isLeagueSlug(match.league.slug) ? leagueLinks.find((item) => item.slug === match.league.slug) : null;
  const rows: [string, ReactNode][] = [
    ["Giải đấu", league ? <Link href={leagueHref(league.slug)}>{match.league.name}</Link> : match.league.name],
    ["Mùa giải", match.season.name || null],
    ["Vòng đấu", formatRound(match.round) || null],
    ["Giờ thi đấu", `${formatMatchTime(match.kickoffAt)} · ${formatMatchDate(match.kickoffAt, true)}`],
    ["Sân vận động", venueName ? [venueName, match.venueInfo?.city].filter(Boolean).join(", ") : null],
    ["Sức chứa", match.venueInfo?.capacity ? match.venueInfo.capacity.toLocaleString("vi-VN") : null],
    ["Thời tiết", weather],
    ["Trọng tài", formatPersonName(match.referee) || null],
    ["Cập nhật", formatUpdated(match.lastUpdatedAt)],
  ];
  return <section className="dp-panel mf-card" aria-labelledby="mf-info">
    <div className="mf-heading"><h2 id="mf-info">Thông tin trận đấu</h2></div>
    <dl className="mf-info">{rows.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p className="mf-note">Giờ Việt Nam (UTC+7).</p>
  </section>;
}

/** Result of a fixture from one club's side (by name, since fixture rows carry names). */
function resultFor(fixture: FixtureRow, clubName: string) {
  if (fixture.homeScore === null || fixture.awayScore === null) return null;
  if (fixture.homeScore === fixture.awayScore) return "D" as const;
  return (fixture.homeScore > fixture.awayScore) === (fixture.home.name === clubName) ? "W" as const : "L" as const;
}
/** Last five results of both clubs, oldest first, each chip lettered (T/H/B) as well as coloured. */
export function FormAside({ match, hub }: { match: MatchDetail; hub: MatchHub }) {
  const sides = (["home", "away"] as const).map((side) => {
    const club = side === "home" ? match.homeClub : match.awayClub;
    const recent = (side === "home" ? hub.home : hub.away)?.recent ?? [];
    return { side, club, name: teamName(club, side), results: [...recent].reverse().map((fixture) => resultFor(fixture, club?.name ?? "")).filter((result) => result !== null) };
  });
  if (!sides.some((item) => item.results.length)) return null;
  return <section className="dp-panel mf-card" aria-labelledby="mf-form">
    <div className="mf-heading"><h2 id="mf-form">Phong độ</h2><span>5 trận gần nhất</span></div>
    {sides.map((item) => <div className="mf-form-row" key={item.side}>
      <span className="mf-club"><Crest url={item.club?.externalCrestUrl} name={item.name} />{item.name}</span>
      {item.results.length ? <ul aria-label={`Phong độ ${item.name}: ${item.results.map((result) => resultText[result]).join(", ")}`}>{item.results.map((result, index) => <li key={index} aria-hidden="true" className={`mf-result ${result}`}>{resultLabel[result]}</li>)}</ul> : <span className="mf-note">Chưa có kết quả</span>}
    </div>)}
  </section>;
}

/** Where both clubs stand in the league table, with a link to the full table. */
export function StandingsSnippet({ match, hub }: { match: MatchDetail; hub: MatchHub }) {
  const rows = (hub.standings?.rows ?? []).filter((row) => row.clubId === match.homeClub?.id || row.clubId === match.awayClub?.id);
  if (!rows.length) return null;
  const name = (row: StandingRow) => row.shortName?.trim() || shortClub(row.name);
  return <section className="dp-panel mf-card" aria-labelledby="mf-table">
    <div className="mf-heading"><h2 id="mf-table">Bảng xếp hạng</h2><Link href={matchTabHref(match.slug, "bxh")}>Xem đầy đủ →</Link></div>
    <table className="mf-table"><caption className="sr-only">Vị trí của hai đội</caption>
      <thead><tr><th scope="col">#</th><th scope="col">Đội</th><th scope="col"><abbr title="Số trận">Tr</abbr></th><th scope="col"><abbr title="Hiệu số">HS</abbr></th><th scope="col"><abbr title="Điểm">Đ</abbr></th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.clubId}><td>{row.position}</td><th scope="row"><span className="mf-club"><Crest url={row.crestUrl} name={row.name} />{name(row)}</span></th><td>{row.played ?? "—"}</td><td>{row.goalDifference ?? "—"}</td><td><b>{row.points ?? "—"}</b></td></tr>)}</tbody>
    </table>
  </section>;
}

/** Earlier meetings in brief; the full list is on the Đối đầu tab. */
export function H2HSummary({ match, hub }: { match: MatchDetail; hub: MatchHub }) {
  const { meetings, homeWins, draws, awayWins } = hub.headToHead;
  if (!meetings.length) return null;
  const home = teamName(match.homeClub, "home", true); const away = teamName(match.awayClub, "away", true);
  return <section className="dp-panel mf-card" aria-labelledby="mf-h2h">
    <div className="mf-heading"><h2 id="mf-h2h">Đối đầu</h2><Link href={matchTabHref(match.slug, "doi-dau")}>{meetings.length} trận gần nhất →</Link></div>
    <div className="mf-h2h"><span><b>{homeWins}</b><small>{home}</small></span><span><b>{draws}</b><small>Hòa</small></span><span><b>{awayWins}</b><small>{away}</small></span></div>
  </section>;
}
