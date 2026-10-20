import Link from "next/link";
import type { LineupPlayerView, MatchDetail, MatchTeam } from "../../types/match-ui";
import { lineupMarks, ratingTone, teamRating, type PlayerMarks } from "../../lib/match-lineup-marks";
import { teamName } from "../../lib/match-presentation";
import { playerPath } from "../../lib/player-presentation";
import { PlayerPhoto } from "../ui/player-photo";
import { TeamBadge } from "../ui/team-badge";

type Lineup = NonNullable<MatchDetail["lineups"]>[number];
type Side = "home" | "away";
const positionText: Record<string, string> = { Goalkeeper: "Thủ môn", Defender: "Hậu vệ", Midfielder: "Tiền vệ", Forward: "Tiền đạo" };
const shortName = (name: string) => { const words = name.trim().split(/\s+/); return words.length > 1 ? words.slice(1).join(" ") : name; };
const keyOf = (player: LineupPlayerView) => `${player.name}-${player.number}`;

function Unavailable() {
  return <p role="status" className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm leading-7 text-slate-600">Chưa có đội hình. Đội hình thường được công bố khoảng một giờ trước giờ bóng lăn.</p>;
}
function Rating({ value, best }: { value: number; best?: boolean }) {
  return <span className={`inline-flex items-center gap-0.5 rounded-md px-1 py-px text-[10px] font-bold tabular-nums leading-4 ${ratingTone(value)}`}>{value.toFixed(1)}{best && <span aria-hidden="true">★</span>}</span>;
}
const Arrow = ({ dir }: { dir: "in" | "out" }) => <span aria-hidden="true" className={`grid h-3.5 w-3.5 place-items-center rounded-full text-[9px] font-black text-white ${dir === "in" ? "bg-emerald-500" : "bg-rose-500"}`}>{dir === "in" ? "↑" : "↓"}</span>;
const Card = ({ red }: { red?: boolean }) => <span aria-hidden="true" className={`inline-block h-3.5 w-2.5 rounded-sm ${red ? "bg-red-600" : "bg-yellow-400"}`} />;
/** Spoken summary of a player's match for screen readers. */
function describe(player: LineupPlayerView, marks: PlayerMarks, best: boolean) {
  return [player.name, player.number !== null ? `số ${player.number}` : null, player.rating != null ? `điểm ${player.rating.toFixed(1)}${best ? ", cao nhất trận" : ""}` : null,
    marks.goals ? `${marks.goals} bàn` : null, marks.ownGoals ? "phản lưới nhà" : null, marks.assists ? `${marks.assists} kiến tạo` : null,
    marks.yellow ? `thẻ vàng phút ${marks.yellow}` : null, marks.red ? `thẻ đỏ phút ${marks.red}` : null,
    marks.subOn ? `vào sân phút ${marks.subOn}` : null, marks.subOff ? `rời sân phút ${marks.subOff}` : null].filter(Boolean).join(", ");
}
function PlayerName({ player, className }: { player: LineupPlayerView; className: string }) {
  return player.playerId ? <Link href={playerPath(player.playerId)} className={`${className} hover:underline`}>{shortName(player.name)}</Link> : <span className={className}>{shortName(player.name)}</span>;
}
function PitchPlayer({ player, marks, best }: { player: LineupPlayerView; marks: PlayerMarks; best: boolean }) {
  return <li aria-label={describe(player, marks, best)} className="flex w-[4.5rem] flex-col items-center text-center sm:w-20">
    <div aria-hidden="true" className="relative">
      <PlayerPhoto photoUrl={player.photoUrl} size="md" round />
      {marks.subOff && <span className="absolute -left-6 -top-2 flex items-center gap-0.5 text-[10px] font-semibold text-white"><span>{marks.subOff}′</span><Arrow dir="out" /></span>}
      {player.rating != null && <span className="absolute -right-4 -top-2"><Rating value={player.rating} best={best} /></span>}
      {(marks.red || marks.yellow) && <span className="absolute -left-1.5 bottom-0"><Card red={Boolean(marks.red)} /></span>}
      {(marks.goals > 0 || marks.ownGoals > 0) && <span className="absolute -right-3 bottom-0 flex items-center rounded-full bg-white px-0.5 text-[10px] leading-4 shadow">{"⚽".repeat(Math.min(3, marks.goals + marks.ownGoals))}{marks.ownGoals > 0 ? <span className="font-bold text-rose-600">PL</span> : null}</span>}
    </div>
    <span className="mt-1.5 line-clamp-2 break-words text-[11px] font-semibold leading-tight text-white">
      {player.number !== null && <span aria-hidden="true" className="mr-0.5 font-normal opacity-75">{player.number}</span>}<PlayerName player={player} className="" />
    </span>
  </li>;
}
/**
 * One team's half. Lines go goalkeeper → forwards towards the halfway line; within a line the
 * provider orders players from the team's left to right, so each orientation flips accordingly
 * (phones: home on top attacking down; wide screens: home on the left attacking right).
 */
function Half({ side, lineup, marks, best }: { side: Side; lineup: Lineup; marks: PlayerMarks[]; best: string | null }) {
  const starters = lineup.players.map((player, index) => ({ player, marks: marks[index] })).filter((entry) => entry.player.starter);
  const rows = [...new Set(starters.map((entry) => entry.player.row ?? 0))].sort((a, b) => side === "home" ? a - b : b - a);
  return <ol className={`flex min-h-[23rem] flex-1 flex-col md:min-h-[34rem] md:flex-row ${side === "home" ? "border-b border-white/40 md:border-b-0 md:border-r" : ""}`}>
    {rows.map((row) => <li key={row} className="flex flex-1">
      <ul className={`flex flex-1 items-center justify-around gap-1 px-1 py-2 md:px-0 md:py-2 ${side === "home" ? "flex-row-reverse md:flex-col" : "flex-row md:flex-col-reverse"}`}>
        {starters.filter((entry) => (entry.player.row ?? 0) === row).sort((a, b) => (a.player.slot ?? 0) - (b.player.slot ?? 0))
          .map((entry) => <PitchPlayer key={keyOf(entry.player)} player={entry.player} marks={entry.marks} best={best === keyOf(entry.player)} />)}
      </ul>
    </li>)}
  </ol>;
}
function TeamBar({ team, side, lineup }: { team: MatchTeam | null; side: Side; lineup: Lineup | undefined }) {
  const name = teamName(team, side, true);
  const rating = lineup ? teamRating(lineup.players.map((player) => player.rating)) : null;
  return <div className={`flex min-w-0 items-center gap-2 ${side === "away" ? "flex-row-reverse text-right" : ""}`}>
    {rating !== null && <span title="Điểm trung bình của các cầu thủ có điểm"><Rating value={rating} /></span>}
    <TeamBadge name={name} tla={team?.tla} crestUrl={team?.externalCrestUrl} />
    <span className="min-w-0 leading-tight sm:flex sm:items-baseline sm:gap-2"><span className="block break-words text-sm font-bold">{team?.shortName?.trim() || name}</span>{lineup?.formation && <span className="block text-xs text-slate-500 sm:text-sm">{lineup.formation}</span>}</span>
  </div>;
}
function BenchList({ team, side, lineup, marks, best }: { team: MatchTeam | null; side: Side; lineup: Lineup; marks: PlayerMarks[]; best: string | null }) {
  const bench = lineup.players.map((player, index) => ({ player, marks: marks[index] })).filter((entry) => !entry.player.starter)
    .sort((a, b) => Number(Boolean(b.marks.subOn)) - Number(Boolean(a.marks.subOn)) || (parseInt(a.marks.subOn ?? "999", 10) - parseInt(b.marks.subOn ?? "999", 10)));
  return <div className="min-w-0">
    <h4 className="mb-1 truncate text-xs font-bold uppercase tracking-wide text-slate-500">{team?.shortName?.trim() || teamName(team, side, true)}</h4>
    {bench.length ? <ul className="divide-y divide-slate-100 text-sm">{bench.map(({ player, marks: mark }) => <li key={keyOf(player)} aria-label={describe(player, mark, best === keyOf(player))} className="flex items-center gap-2.5 py-2">
      <PlayerPhoto photoUrl={player.photoUrl} round />
      <span aria-hidden="true" className="w-9 shrink-0">{player.rating != null && <Rating value={player.rating} best={best === keyOf(player)} />}</span>
      <span aria-hidden="true" className="w-5 shrink-0 text-right text-xs tabular-nums text-slate-500">{player.number ?? ""}</span>
      <span aria-hidden="true" className="min-w-0 flex-1"><span className="block truncate font-medium">{player.playerId ? <Link href={playerPath(player.playerId)} className="hover:underline">{player.name}</Link> : player.name}</span>{player.position && <span className="block text-xs text-slate-500">{positionText[player.position] ?? player.position}</span>}</span>
      <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-emerald-700">{(mark.red || mark.yellow) && <Card red={Boolean(mark.red)} />}{mark.goals > 0 && <span>{"⚽".repeat(Math.min(3, mark.goals))}</span>}{mark.subOn && <><span>{mark.subOn}′</span><Arrow dir="in" /></>}</span>
    </li>)}</ul> : <p className="py-2 text-sm text-slate-500">Chưa có danh sách dự bị.</p>}
  </div>;
}

/** FotMob-style lineups: both teams on one pitch with ratings and match icons, then both benches. */
export function LineupsView({ match }: { match: MatchDetail }) {
  const home = match.lineups?.find((lineup) => lineup.clubId === match.homeClub?.id);
  const away = match.lineups?.find((lineup) => lineup.clubId === match.awayClub?.id);
  if (!home && !away) return <Unavailable />;
  const homeMarks = home ? lineupMarks(home.clubId, home.players, match.events) : [];
  const awayMarks = away ? lineupMarks(away.clubId, away.players, match.events) : [];
  const rated = [...(home?.players ?? []), ...(away?.players ?? [])].filter((player) => player.rating != null);
  const top = rated.length ? rated.reduce((best, player) => player.rating! > best.rating! ? player : best) : null;
  const best = top ? keyOf(top) : null;
  const hasRatings = rated.length > 0;
  return <div className="space-y-4">
    <section aria-label="Đội hình ra sân" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><TeamBar team={match.homeClub} side="home" lineup={home} /><TeamBar team={match.awayClub} side="away" lineup={away} /></div>
      <div className="relative flex flex-col bg-emerald-700 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.04)_0_48px,transparent_48px_96px)] md:flex-row md:bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.04)_0_64px,transparent_64px_128px)]">
        <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40" />
        {home ? <Half side="home" lineup={home} marks={homeMarks} best={best} /> : <div className="flex-1" />}
        {away ? <Half side="away" lineup={away} marks={awayMarks} best={best} /> : <div className="flex-1" />}
      </div>
      {hasRatings && <p className="px-4 py-2 text-[11px] text-slate-500">Điểm cầu thủ theo Highlightly (thang 10), có thể khác các trang khác. ★ điểm cao nhất trận.</p>}
    </section>
    <section aria-labelledby="lineup-bench" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h3 id="lineup-bench" className="mb-3 text-center font-bold">Dự bị</h3>
      <div className="grid gap-6 md:grid-cols-2">
        {home && <BenchList team={match.homeClub} side="home" lineup={home} marks={homeMarks} best={best} />}
        {away && <BenchList team={match.awayClub} side="away" lineup={away} marks={awayMarks} best={best} />}
      </div>
    </section>
  </div>;
}
