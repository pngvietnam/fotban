import Link from "next/link";
import type { LineupPlayerView, MatchDetail } from "../../types/match-ui";
import type { MatchHub } from "../../services/match-hub";
import type { FixtureRow } from "../../types/league-hub";
import { resultLabel, resultText } from "../../lib/league-presentation";
import { teamName } from "../../lib/match-presentation";
import { playerPath } from "../../lib/player-presentation";
import { FixtureItem, StandingsTable } from "../league/league-hub";
import { PlayerPhoto } from "../ui/player-photo";

const eventLabels: Record<string, string> = { GOAL: "Bàn thắng", OWN_GOAL: "Phản lưới", PENALTY: "Phạt đền", YELLOW_CARD: "Thẻ vàng", RED_CARD: "Thẻ đỏ", SUBSTITUTION: "Thay người", OTHER: "Sự kiện" };
const panel = "rounded-2xl border border-slate-200 bg-white p-5 sm:p-6";

export function Unavailable({ children }: { children: string }) {
  return <p role="status" className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm leading-7 text-slate-600">{children}</p>;
}

type MatchEventView = MatchDetail["events"][number];
type Person = { id?: string; name: string } | null;
const minuteText = (event: MatchEventView) => event.minute == null ? "—" : `${event.minute}${event.addedMinute ? `+${event.addedMinute}` : ""}′`;
/** The canonical player when matched, else the provider's own (often shortened) name. */
const personName = (person: Person, fallback: string | null | undefined) => person?.name ?? fallback ?? null;
const isGoal = (type: string) => ["GOAL", "PENALTY", "OWN_GOAL"].includes(type);
function PersonLink({ person, fallback }: { person: Person; fallback?: string | null }) {
  const name = personName(person, fallback);
  if (!name) return null;
  return person?.id ? <Link href={playerPath(person.id)} className="hover:underline">{name}</Link> : <>{name}</>;
}
function EventIcon({ type, detail }: { type: string; detail: string | null }) {
  if (type === "YELLOW_CARD") return <span aria-hidden="true" className="inline-block h-4 w-3 rounded-sm bg-yellow-400" />;
  if (type === "RED_CARD") return <span aria-hidden="true" className="inline-block h-4 w-3 rounded-sm bg-red-600" />;
  if (type === "SUBSTITUTION") return <span aria-hidden="true" className="text-sm font-bold"><span className="text-emerald-600">↑</span><span className="text-rose-600">↓</span></span>;
  if (isGoal(type)) return <span aria-hidden="true">⚽</span>;
  return <span aria-hidden="true" className="rounded bg-slate-200 px-1 text-[9px] font-bold text-slate-700">{detail?.startsWith("VAR") ? "VAR" : "!"}</span>;
}
function EventBody({ event, align }: { event: MatchEventView; align: "left" | "right" }) {
  const related = personName(event.relatedPlayer, event.relatedPlayerName);
  const secondary = event.type === "SUBSTITUTION" ? (related ? <>Ra: <PersonLink person={event.relatedPlayer} fallback={event.relatedPlayerName} /></> : null)
    : (event.type === "GOAL" || event.type === "PENALTY") && related ? <>Kiến tạo: <PersonLink person={event.relatedPlayer} fallback={event.relatedPlayerName} />{event.type === "PENALTY" ? " · Phạt đền" : ""}</>
    : event.type === "PENALTY" ? "Phạt đền" : event.type === "OWN_GOAL" ? "Phản lưới nhà" : event.type === "OTHER" ? event.detail : null;
  const hasPlayer = Boolean(personName(event.player, event.playerName));
  return <div className={`flex min-w-0 items-start gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
    <span className="mt-0.5 shrink-0"><EventIcon type={event.type} detail={event.detail} /></span>
    <div className="min-w-0">
      <p className="break-words font-semibold">{event.type === "SUBSTITUTION" && hasPlayer ? <>Vào: <PersonLink person={event.player} fallback={event.playerName} /></> : hasPlayer ? <PersonLink person={event.player} fallback={event.playerName} /> : eventLabels[event.type] ?? "Sự kiện"}</p>
      {secondary && <p className="mt-0.5 break-words text-xs text-slate-500">{secondary}</p>}
    </div>
  </div>;
}
/** FotMob-style timeline: the home team's events on the left, the away team's on the right. */
export function EventsList({ match }: { match: MatchDetail }) {
  if (!match.events.length) return <Unavailable>Chưa có dữ liệu diễn biến (bàn thắng, thẻ phạt, thay người) cho trận này.</Unavailable>;
  const homeId = match.homeClub?.id;
  const firstSecondHalf = match.events.findIndex((event) => (event.minute ?? 0) > 45);
  return <section aria-labelledby="match-events" className={panel}>
    <h2 id="match-events" className="font-bold">Diễn biến trận đấu</h2>
    <ol className="mt-4">{match.events.map((event, index) => {
      const home = Boolean(homeId && event.club?.id === homeId);
      return <li key={index}>
        {index === firstSecondHalf && index > 0 && <p className="my-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">Hết hiệp 1</p>}
        <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)] items-center gap-2 border-t border-slate-100 py-3 text-sm">
          <div>{home && <EventBody event={event} align="right" />}</div>
          <span className="justify-self-center rounded-full bg-slate-100 px-2 py-1 text-xs font-bold tabular-nums text-slate-700">{minuteText(event)}</span>
          <div>{!home && <EventBody event={event} align="left" />}</div>
        </div>
      </li>;
    })}</ol>
  </section>;
}
/** Goal scorers under the scoreboard, per side. */
export function Scorers({ match }: { match: MatchDetail }) {
  const goals = match.events.filter((event) => isGoal(event.type));
  if (!goals.length) return null;
  const side = (home: boolean) => goals.filter((event) => Boolean(match.homeClub?.id && event.club?.id === match.homeClub.id) === home)
    .map((event, index) => <li key={index}>{personName(event.player, event.playerName) ?? "Bàn thắng"} {minuteText(event)}{event.type === "PENALTY" ? " (pen)" : event.type === "OWN_GOAL" ? " (phản lưới)" : ""}</li>);
  return <div className="grid grid-cols-2 gap-6 border-t border-slate-100 px-5 py-3 text-xs leading-6 text-slate-600">
    <ul aria-label="Bàn thắng đội nhà" className="text-right">{side(true)}</ul><ul aria-label="Bàn thắng đội khách">{side(false)}</ul>
  </div>;
}

const percentLike = /possession|accuracy|percent/;
const statOrder = ["ball_possession", "expected_goals", "total_shots", "shots", "shots_on_target", "shots_on_goal", "shots_off_target", "blocked_shots", "shots_accuracy", "corner_kicks", "corners", "offsides", "fouls", "yellow_cards", "red_cards", "goalkeeper_saves", "saves", "total_passes", "passes", "passes_accurate", "accurate_passes", "passes_accuracy", "pass_accuracy"];
const statText: Record<string, string> = {
  ball_possession: "Kiểm soát bóng", expected_goals: "Bàn thắng kỳ vọng (xG)", total_shots: "Tổng số cú sút", shots: "Số cú sút", shots_on_target: "Sút trúng đích", shots_on_goal: "Sút trúng đích",
  shots_off_target: "Sút ra ngoài", blocked_shots: "Sút bị chặn", shots_accuracy: "Tỉ lệ sút trúng", corner_kicks: "Phạt góc", corners: "Phạt góc", offsides: "Việt vị", fouls: "Phạm lỗi",
  yellow_cards: "Thẻ vàng", red_cards: "Thẻ đỏ", goalkeeper_saves: "Cứu thua", saves: "Cứu thua", total_passes: "Số đường chuyền", passes: "Số đường chuyền",
  passes_accurate: "Chuyền chính xác", accurate_passes: "Chuyền chính xác", passes_accuracy: "Tỉ lệ chuyền chính xác", pass_accuracy: "Tỉ lệ chuyền chính xác",
};
/** Known metrics in Vietnamese; others keep the provider's English name. */
export const statLabel = (metric: string) => statText[metric] ?? metric.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase());
export function statValue(metric: string, value: number) {
  if (percentLike.test(metric)) return `${Math.round(value <= 1 ? value * 100 : value)}%`;
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}
/** Home vs away bars per metric, like FotMob's statistics tab. */
export function StatsList({ match }: { match: MatchDetail }) {
  const clubStats = match.stats.filter((stat) => !stat.player);
  if (!clubStats.length) return <Unavailable>Chưa có dữ liệu thống kê (kiểm soát bóng, số cú sút, phạt góc…) cho trận này.</Unavailable>;
  const rank = (metric: string) => { const index = statOrder.indexOf(metric); return index < 0 ? 999 : index; };
  const metrics = [...new Set(clubStats.map((stat) => stat.metric))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const value = (metric: string, clubId: string | undefined) => { const found = clubStats.find((stat) => stat.metric === metric && stat.club.id === clubId); return found ? Number(found.value) : null; };
  return <section aria-labelledby="match-stats" className={panel}>
    <h2 id="match-stats" className="mb-2 font-bold">Thống kê trận đấu</h2>
    <div className="mb-3 flex justify-between gap-4 text-xs font-semibold text-slate-500"><span>{teamName(match.homeClub, "home", true)}</span><span className="text-right">{teamName(match.awayClub, "away", true)}</span></div>
    <ul className="space-y-4">{metrics.map((metric) => {
      const home = value(metric, match.homeClub?.id); const away = value(metric, match.awayClub?.id);
      const total = (home ?? 0) + (away ?? 0); const homeShare = total > 0 ? (home ?? 0) / total : 0.5;
      return <li key={metric} aria-label={`${statLabel(metric)}: ${home === null ? "—" : statValue(metric, home)} - ${away === null ? "—" : statValue(metric, away)}`}>
        <div aria-hidden="true" className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-bold tabular-nums">{home === null ? "—" : statValue(metric, home)}</span>
          <span className="text-center text-xs text-slate-600">{statLabel(metric)}</span>
          <span className="font-bold tabular-nums">{away === null ? "—" : statValue(metric, away)}</span>
        </div>
        <div aria-hidden="true" className="mt-1.5 flex h-1.5 gap-1"><span className="rounded-full bg-slate-900" style={{ width: `${homeShare * 100}%` }} /><span className="flex-1 rounded-full bg-lime-500" /></div>
      </li>;
    })}</ul>
  </section>;
}

const positionText: Record<string, string> = { Goalkeeper: "Thủ môn", Defender: "Hậu vệ", Midfielder: "Tiền vệ", Forward: "Tiền đạo" };
const shortName = (name: string) => { const words = name.trim().split(/\s+/); return words.length > 1 ? words.slice(1).join(" ") : name; };
function PitchPlayer({ player }: { player: LineupPlayerView }) {
  const content = <>
    <span className="relative"><PlayerPhoto photoUrl={player.photoUrl} size="md" />{player.number !== null && <span className="absolute -bottom-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-slate-900 shadow">{player.number}</span>}</span>
    <span className="mt-1 line-clamp-1 max-w-[5.5rem] break-words text-center text-[11px] font-semibold text-white">{shortName(player.name)}</span>
  </>;
  return <li className="flex min-w-0 flex-1 flex-col items-center">{player.playerId
    ? <Link href={playerPath(player.playerId)} aria-label={player.name} className="flex flex-col items-center">{content}</Link>
    : <span aria-label={player.name} className="flex flex-col items-center">{content}</span>}</li>;
}
function TeamLineup({ name, lineup }: { name: string; lineup: NonNullable<MatchDetail["lineups"]>[number] }) {
  const starters = lineup.players.filter((player) => player.starter);
  // Forwards at the top, goalkeeper at the bottom.
  const rows = [...new Set(starters.map((player) => player.row ?? 0))].sort((a, b) => b - a)
    .map((row) => starters.filter((player) => (player.row ?? 0) === row).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0)));
  const bench = lineup.players.filter((player) => !player.starter);
  return <section aria-label={`Đội hình ${name}`} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
    <h3 className="mb-3 flex items-baseline justify-between gap-2 font-bold"><span className="min-w-0 break-words">{name}</span>{lineup.formation && <span className="shrink-0 text-sm text-slate-500">{lineup.formation}</span>}</h3>
    {starters.length > 0 && <div className="rounded-xl bg-gradient-to-b from-emerald-700 to-emerald-800 px-2 py-4">
      <ol className="flex flex-col gap-4">{rows.map((row, index) => <li key={index}><ul className="flex justify-around gap-1">{row.map((player) => <PitchPlayer key={`${player.name}-${player.number}`} player={player} />)}</ul></li>)}</ol>
    </div>}
    {bench.length > 0 && <>
      <h4 className="mb-1 mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Dự bị</h4>
      <ul className="divide-y divide-slate-100 text-sm">{bench.map((player) => <li key={`${player.name}-${player.number}`} className="flex items-center gap-3 py-2">
        <span className="w-6 text-right text-xs font-bold tabular-nums text-slate-500">{player.number ?? ""}</span><PlayerPhoto photoUrl={player.photoUrl} />
        <span className="min-w-0 flex-1 break-words">{player.playerId ? <Link href={playerPath(player.playerId)} className="font-medium hover:underline">{player.name}</Link> : <span className="font-medium">{player.name}</span>}</span>
        {player.position && <span className="shrink-0 text-xs text-slate-500">{positionText[player.position] ?? player.position}</span>}
      </li>)}</ul>
    </>}
  </section>;
}
export function LineupsView({ match }: { match: MatchDetail }) {
  const home = match.lineups?.find((lineup) => lineup.clubId === match.homeClub?.id);
  const away = match.lineups?.find((lineup) => lineup.clubId === match.awayClub?.id);
  if (!home && !away) return <Unavailable>Chưa có đội hình. Đội hình thường được công bố khoảng một giờ trước giờ bóng lăn.</Unavailable>;
  return <div className="grid gap-4 md:grid-cols-2">
    {home && <TeamLineup name={teamName(match.homeClub, "home", true)} lineup={home} />}
    {away && <TeamLineup name={teamName(match.awayClub, "away", true)} lineup={away} />}
  </div>;
}

/** Result of a fixture from one club's point of view (by name, since fixture rows carry names). */
function resultFor(fixture: FixtureRow, clubName: string) {
  if (fixture.homeScore === null || fixture.awayScore === null) return null;
  if (fixture.homeScore === fixture.awayScore) return "D" as const;
  return (fixture.homeScore > fixture.awayScore) === (fixture.home.name === clubName) ? "W" as const : "L" as const;
}
function FormColumn({ name, clubName, fixtures }: { name: string; clubName: string; fixtures: FixtureRow[] }) {
  const results = [...fixtures].reverse().map((fixture) => resultFor(fixture, clubName)).filter((result) => result !== null);
  const tone = { W: "bg-emerald-600", D: "bg-slate-400", L: "bg-rose-600" } as const;
  return <div className="min-w-0"><p className="mb-2 break-words text-xs font-semibold text-slate-500">{name}</p>
    {results.length ? <ul aria-label={`Phong độ ${name}: ${results.map((result) => resultText[result]).join(", ")}`} className="flex gap-1">{results.map((result, index) => <li key={index} aria-hidden="true" className={`grid h-7 w-7 place-items-center rounded text-xs font-bold text-white ${tone[result]}`}>{resultLabel[result]}</li>)}</ul> : <p className="text-xs text-slate-400">Chưa có kết quả</p>}</div>;
}
export function FormPanel({ match, hub }: { match: MatchDetail; hub: MatchHub }) {
  if (!hub.home && !hub.away) return null;
  return <section aria-labelledby="match-form" className={panel}>
    <h2 id="match-form" className="mb-4 text-base font-bold">Phong độ</h2>
    <div className="grid gap-5 sm:grid-cols-2">
      <FormColumn name={teamName(match.homeClub, "home", true)} clubName={match.homeClub?.name ?? ""} fixtures={hub.home?.recent ?? []} />
      <FormColumn name={teamName(match.awayClub, "away", true)} clubName={match.awayClub?.name ?? ""} fixtures={hub.away?.recent ?? []} />
    </div>
    <p className="mt-3 text-[11px] text-slate-500">5 trận gần nhất, từ kết quả đã lưu.</p>
  </section>;
}
export function NextMatches({ match, hub }: { match: MatchDetail; hub: MatchHub }) {
  const items = [[teamName(match.homeClub, "home", true), hub.home?.next], [teamName(match.awayClub, "away", true), hub.away?.next]] as const;
  if (!items.some(([, next]) => next)) return null;
  return <section aria-labelledby="match-next" className={panel}>
    <h2 id="match-next" className="mb-2 text-base font-bold">Trận tiếp theo</h2>
    {items.map(([name, next]) => next && <div key={name}><p className="mt-3 text-xs font-semibold text-slate-500">{name}</p><ul><FixtureItem fixture={next} /></ul></div>)}
  </section>;
}
export function StandingsPanel({ match, hub }: { match: MatchDetail; hub: MatchHub }) {
  if (!hub.league || !hub.standings) return <Unavailable>Giải đấu này chưa có bảng xếp hạng.</Unavailable>;
  return <StandingsTable data={hub.standings} league={hub.league} highlight={[match.homeClub?.id, match.awayClub?.id].filter((id): id is string => Boolean(id))} />;
}
export function HeadToHeadPanel({ match, hub }: { match: MatchDetail; hub: MatchHub }) {
  const { fixtures, homeWins, draws, awayWins } = hub.headToHead;
  if (!fixtures.length) return <Unavailable>Chưa có dữ liệu các lần gặp nhau của hai đội.</Unavailable>;
  const home = teamName(match.homeClub, "home", true); const away = teamName(match.awayClub, "away", true);
  return <section aria-labelledby="match-h2h" className={panel}>
    <h2 id="match-h2h" className="mb-4 text-base font-bold">Thành tích đối đầu</h2>
    <div className="mb-4 grid grid-cols-3 gap-2 text-center">
      <div className="rounded-xl bg-slate-50 p-3"><p className="text-2xl font-bold tabular-nums">{homeWins}</p><p className="mt-1 break-words text-[11px] text-slate-500">{home} thắng</p></div>
      <div className="rounded-xl bg-slate-50 p-3"><p className="text-2xl font-bold tabular-nums">{draws}</p><p className="mt-1 text-[11px] text-slate-500">Hòa</p></div>
      <div className="rounded-xl bg-slate-50 p-3"><p className="text-2xl font-bold tabular-nums">{awayWins}</p><p className="mt-1 break-words text-[11px] text-slate-500">{away} thắng</p></div>
    </div>
    <ul>{fixtures.map((fixture) => <FixtureItem key={fixture.slug} fixture={fixture} />)}</ul>
    <p className="mt-3 text-[11px] text-slate-500">Các lần gặp nhau đã lưu trong hệ thống.</p>
  </section>;
}
