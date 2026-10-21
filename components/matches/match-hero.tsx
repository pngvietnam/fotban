import Link from "next/link";
import type { MatchDetail, MatchTeam } from "../../types/match-ui";
import { formatMatchTime, formatRound, isMatchStale, matchStatusLabels, scorePresentation, teamMonogram, teamName } from "../../lib/match-presentation";
import { dayNumbers, timelineLeague } from "../../lib/match-timeline";
import { matchDayKey } from "../../lib/match-presentation";
import { leagueHref } from "../../lib/league-presentation";
import { clubPath } from "../../lib/club-presentation";
import { safeCrestUrl } from "../../lib/crest";
import { isLeagueSlug } from "../../services/league-hub";
import { scorerLines } from "./match-tab-views";

function Side({ team, side }: { team: MatchTeam | null; side: "home" | "away" }) {
  const crest = safeCrestUrl(team?.externalCrestUrl);
  const body = <>
    {/* eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data crest */}
    {crest ? <img src={crest} alt="" referrerPolicy="no-referrer" /> : <span className="dp-hero-monogram" aria-hidden="true">{teamMonogram(team)}</span>}
    <b title={team?.name ?? undefined}>{teamName(team, side)}</b>
  </>;
  return team?.id ? <Link href={clubPath(team.id)}>{body}</Link> : <span>{body}</span>;
}

/** The dark score card of prototype v2: competition and round, both clubs, score or kickoff, date and venue. */
export function MatchHero({ match, now, venueName }: { match: MatchDetail; now: Date; venueName: string | null }) {
  const league = timelineLeague(match.league.slug);
  const round = match.round ? /^\d+$/.test(match.round) && league ? `${league.roundWord} ${match.round}` : formatRound(match.round) : null;
  const kicker = `${league?.label ?? match.league.name}${round ? ` · ${round}` : ""}`;
  const score = scorePresentation(match);
  const status = match.status === "FINISHED" ? "Đã kết thúc" : match.status === "SCHEDULED" ? "Sắp diễn ra" : matchStatusLabels[match.status];
  const scorers = scorerLines(match);
  const notes = [status, score.regulation ? `90 phút ${score.regulation}` : null, score.penalties ? `Luân lưu ${score.penalties}` : null, isMatchStale(match, now) ? "Có thể đã cũ" : null].filter(Boolean).join(" · ");
  return <section className="dp-match-hero" aria-label={`${teamName(match.homeClub, "home", true)} gặp ${teamName(match.awayClub, "away", true)}`}>
    {isLeagueSlug(match.league.slug) ? <Link className="dp-kicker" href={leagueHref(match.league.slug)}>{kicker} ↗</Link> : <span className="dp-kicker">{kicker}</span>}
    <div>
      <Side team={match.homeClub} side="home" />
      <span><strong>{score.text}</strong><small>{notes}</small></span>
      <Side team={match.awayClub} side="away" />
      {scorers && <><ul aria-label="Bàn thắng đội nhà" className="dp-hero-goals">{scorers.home.map((line, index) => <li key={index}>{line}</li>)}</ul><ul aria-label="Bàn thắng đội khách" className="dp-hero-goals away">{scorers.away.map((line, index) => <li key={index}>{line}</li>)}</ul></>}
    </div>
    <p>{dayNumbers(matchDayKey(match.kickoffAt))} · {formatMatchTime(match.kickoffAt)} UTC+7{venueName ? ` · ${venueName}` : ""}</p>
  </section>;
}
