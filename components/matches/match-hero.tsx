import Link from "next/link";
import type { MatchDetail, MatchTeam } from "../../types/match-ui";
import { formatMatchTime, formatRound, isMatchStale, matchStatusLabels, scorePresentation, teamMonogram, teamName } from "../../lib/match-presentation";
import { dayNumbers, timelineLeague } from "../../lib/match-timeline";
import { matchDayKey } from "../../lib/match-presentation";
import { leagueHref } from "../../lib/league-presentation";
import { clubPath } from "../../lib/club-presentation";
import { safeCrestUrl } from "../../lib/crest";
import { isLeagueSlug } from "../../services/league-hub";
import { scorerLines, type HeroLine } from "./match-tab-views";

/** Name then crest for the home club, crest then name for the away club, both leaning toward the score. */
function Side({ team, side }: { team: MatchTeam | null; side: "home" | "away" }) {
  const crest = safeCrestUrl(team?.externalCrestUrl);
  const body = <>
    {/* eslint-disable-next-line @next/next/no-img-element -- hotlinked football-data crest */}
    {crest ? <img src={crest} alt="" referrerPolicy="no-referrer" /> : <span className="mh-mono" aria-hidden="true">{teamMonogram(team)}</span>}
    <b title={team?.name ?? undefined}>{teamName(team, side)}</b>
  </>;
  return team?.id ? <Link className={`mh-side ${side}`} href={clubPath(team.id)}>{body}</Link> : <span className={`mh-side ${side}`}>{body}</span>;
}

const item = (line: HeroLine, index: number) => <li key={index} className={line.kind === "red" ? "red" : undefined}>{line.kind === "red" && <><i aria-hidden="true" /><span className="sr-only">Thẻ đỏ: </span></>}{line.text}</li>;

/**
 * The dark score card, compact: one meta line (competition, round, kickoff, venue), then both clubs around the
 * score, then each side's scorers under its club, aligned toward the score.
 */
export function MatchHero({ match, now, venueName }: { match: MatchDetail; now: Date; venueName: string | null }) {
  const league = timelineLeague(match.league.slug);
  const round = match.round ? /^\d+$/.test(match.round) && league ? `${league.roundWord} ${match.round}` : formatRound(match.round) : null;
  const competition = `${league?.label ?? match.league.name}${round ? ` · ${round}` : ""}`;
  const score = scorePresentation(match);
  const status = match.status === "FINISHED" ? "Đã kết thúc" : match.status === "SCHEDULED" ? "Sắp diễn ra" : matchStatusLabels[match.status];
  const scorers = scorerLines(match);
  const notes = [status, score.regulation ? `90 phút ${score.regulation}` : null, score.penalties ? `Luân lưu ${score.penalties}` : null, isMatchStale(match, now) ? "Có thể đã cũ" : null].filter(Boolean).join(" · ");
  return <section className="mh" aria-label={`${teamName(match.homeClub, "home", true)} gặp ${teamName(match.awayClub, "away", true)}`}>
    <p className="mh-meta">
      {isLeagueSlug(match.league.slug) ? <Link href={leagueHref(match.league.slug)}>{competition}</Link> : <span>{competition}</span>}
      <span>{dayNumbers(matchDayKey(match.kickoffAt))} · {formatMatchTime(match.kickoffAt)} UTC+7{venueName ? ` · ${venueName}` : ""}</span>
    </p>
    <div className="mh-board">
      <Side team={match.homeClub} side="home" />
      <span className="mh-score"><strong>{score.text}</strong><small>{notes}</small></span>
      <Side team={match.awayClub} side="away" />
      {scorers && <><ul aria-label="Bàn thắng và thẻ đỏ đội nhà" className="mh-goals home">{scorers.home.map(item)}</ul><ul aria-label="Bàn thắng và thẻ đỏ đội khách" className="mh-goals away">{scorers.away.map(item)}</ul></>}
    </div>
  </section>;
}
