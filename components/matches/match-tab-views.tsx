import type { MatchDetail } from "../../types/match-ui";
import type { MatchHub } from "../../services/match-hub";
import type { FixtureRow } from "../../types/league-hub";
import { resultLabel, resultText } from "../../lib/league-presentation";
import { teamName } from "../../lib/match-presentation";
import { FixtureItem, StandingsTable } from "../league/league-hub";

const eventLabels: Record<string, string> = { GOAL: "Bàn thắng", OWN_GOAL: "Phản lưới", PENALTY: "Phạt đền", YELLOW_CARD: "Thẻ vàng", RED_CARD: "Thẻ đỏ", SUBSTITUTION: "Thay người", OTHER: "Sự kiện" };
const statLabels: Record<string, string> = { shots: "Số cú sút", shots_on_goal: "Sút trúng đích", ball_possession: "Kiểm soát bóng", corner_kicks: "Phạt góc", fouls: "Phạm lỗi", saves: "Cứu thua" };
const panel = "rounded-2xl border border-slate-200 bg-white p-5 sm:p-6";

export function Unavailable({ children }: { children: string }) {
  return <p role="status" className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm leading-7 text-slate-600">{children}</p>;
}
export function EventsList({ match }: { match: MatchDetail }) {
  if (!match.events.length) return <Unavailable>Chưa có dữ liệu diễn biến (bàn thắng, thẻ phạt, thay người) cho trận này.</Unavailable>;
  return <section aria-labelledby="match-events" className={panel}>
    <h2 id="match-events" className="font-bold">Diễn biến trận đấu</h2>
    <ol className="mt-4 divide-y divide-slate-100">{match.events.map((event, index) => <li key={index} className="flex gap-4 py-4 text-sm">
      <span className="w-12 shrink-0 font-bold tabular-nums text-slate-700">{event.minute == null ? "—" : `${event.minute}${event.addedMinute ? `+${event.addedMinute}` : ""}′`}</span>
      <div><p className="font-semibold">{eventLabels[event.type] ?? "Sự kiện"}{event.player?.name ? ` · ${event.player.name}` : ""}</p>{event.club && <p className="mt-1 text-xs text-slate-500">{event.club.name}</p>}{event.relatedPlayer && <p className="mt-1 text-xs text-slate-600">Liên quan: {event.relatedPlayer.name}</p>}{event.detail && <p className="mt-1 text-xs leading-5 text-slate-600">{event.detail}</p>}</div>
    </li>)}</ol>
  </section>;
}
export function StatsList({ match }: { match: MatchDetail }) {
  if (!match.stats.length) return <Unavailable>Chưa có dữ liệu thống kê (kiểm soát bóng, số cú sút, phạt góc…) cho trận này.</Unavailable>;
  return <section aria-labelledby="match-stats" className={panel}>
    <h2 id="match-stats" className="font-bold">Thống kê trận đấu</h2>
    <dl className="mt-4 divide-y divide-slate-100">{match.stats.map((stat, index) => <div key={index} className="flex justify-between gap-4 py-3 text-sm"><dt><span className="font-medium">{statLabels[stat.metric] ?? stat.metric.replaceAll("_", " ")}</span><span className="mt-1 block text-xs text-slate-500">{stat.club.name}{stat.player ? ` · ${stat.player.name}` : ""}</span></dt><dd className="shrink-0 font-bold tabular-nums">{stat.value}{stat.unit ? ` ${stat.unit}` : ""}</dd></div>)}</dl>
  </section>;
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
    <dl className="mb-4 grid grid-cols-3 gap-2 text-center">
      <div className="rounded-xl bg-slate-50 p-3"><dd className="text-2xl font-bold tabular-nums">{homeWins}</dd><dt className="mt-1 break-words text-[11px] text-slate-500">{home} thắng</dt></div>
      <div className="rounded-xl bg-slate-50 p-3"><dd className="text-2xl font-bold tabular-nums">{draws}</dd><dt className="mt-1 text-[11px] text-slate-500">Hòa</dt></div>
      <div className="rounded-xl bg-slate-50 p-3"><dd className="text-2xl font-bold tabular-nums">{awayWins}</dd><dt className="mt-1 break-words text-[11px] text-slate-500">{away} thắng</dt></div>
    </dl>
    <ul>{fixtures.map((fixture) => <FixtureItem key={fixture.slug} fixture={fixture} />)}</ul>
    <p className="mt-3 text-[11px] text-slate-500">Các lần gặp nhau đã lưu trong hệ thống.</p>
  </section>;
}
