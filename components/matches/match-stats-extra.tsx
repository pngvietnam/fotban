import Link from "next/link";
import type { LineupPlayerView, MatchDetail, MatchTeam } from "../../types/match-ui";
import { teamName } from "../../lib/match-presentation";
import { playerPath } from "../../lib/player-presentation";
import { ratingTone } from "../../lib/match-lineup-marks";
import { matchTabHref } from "../../lib/match-tabs";
import { TeamBadge } from "../ui/team-badge";
import { PlayerPhoto } from "../ui/player-photo";

const panel = "rounded-2xl border border-slate-200 bg-white p-5 sm:p-6";
type Shot = NonNullable<MatchDetail["shots"]>[number];

const outcomeText: Record<string, string> = { GOAL: "Bàn thắng", SAVED: "Bị cản phá", MISSED: "Ra ngoài", BLOCKED: "Bị chặn", POST: "Trúng xà/cột dọc", OTHER: "Khác" };
const outcomeDot: Record<string, string> = { GOAL: "bg-emerald-500 ring-emerald-700", SAVED: "bg-sky-500 ring-sky-700", MISSED: "bg-white ring-rose-500", POST: "bg-amber-400 ring-amber-600", BLOCKED: "bg-slate-400 ring-slate-600", OTHER: "bg-slate-300 ring-slate-500" };
/** Where a shot went, as the provider describes it from the shooter's view: "Low Right", "High Centre", "CloseLeft". */
export function parseGoalTarget(value: string | null) {
  const text = (value ?? "").toLowerCase();
  if (!text.trim()) return null;
  const close = text.includes("close");
  const vertical: "high" | "low" | null = text.includes("high") ? "high" : text.includes("low") ? "low" : null;
  const horizontal: "left" | "centre" | "right" | null = text.includes("left") ? "left" : text.includes("right") ? "right" : text.includes("cent") ? "centre" : null;
  if (!vertical && !horizontal) return null;
  return { close, vertical, horizontal };
}
/** Vietnamese for where a shot went; a shot that missed is described as off target, not as a corner of the goal. */
export function goalTargetText(value: string | null, outcome?: string) {
  const target = parseGoalTarget(value);
  if (!target) return null;
  const side = { left: "trái", centre: "giữa", right: "phải" } as const;
  if (target.close || outcome === "MISSED") {
    // "CloseLeft" is just wide of the post; a missed "High …" went over the bar.
    const wide = target.horizontal === "left" || target.horizontal === "right" ? `Chệch cột ${side[target.horizontal]}` : null;
    if (target.close) return wide ?? "Vọt xà";
    return target.vertical === "high" ? "Vọt xà" : wide ?? "Ra ngoài";
  }
  return [target.vertical === "high" ? "Góc cao" : target.vertical === "low" ? "Góc thấp" : "Khung thành", target.horizontal ? side[target.horizontal] : null].filter(Boolean).join(" ");
}
/**
 * Goal-frame view of one team's shots: shots on goal in their zone of the frame, near misses just
 * outside it. Blocked shots and shots without a target are only in the list.
 */
function GoalFrame({ shots }: { shots: Shot[] }) {
  // 5 columns × 3 rows: the frame is columns 2-4, rows 2-3; the outer ring holds near misses.
  const cells = new Map<string, Shot[]>();
  for (const shot of shots) {
    const target = parseGoalTarget(shot.goalTarget);
    if (!target || shot.outcome === "BLOCKED") continue;
    const outside = target.close || shot.outcome === "MISSED";
    const column = { left: 1, centre: 2, right: 3 }[target.horizontal ?? "centre"];
    let key: string;
    if (!outside) key = `${target.vertical === "high" ? 1 : 2}-${column}`;
    else if (target.horizontal === "left") key = `${target.vertical === "high" ? 1 : 2}-0`;
    else if (target.horizontal === "right") key = `${target.vertical === "high" ? 1 : 2}-4`;
    else key = `0-${column}`;
    cells.set(key, [...(cells.get(key) ?? []), shot]);
  }
  return <div aria-hidden="true" className="grid grid-cols-[1fr_2fr_2fr_2fr_1fr] grid-rows-[1.75rem_2.75rem_2.75rem] gap-px">
    {Array.from({ length: 15 }, (_, index) => {
      const row = Math.floor(index / 5); const column = index % 5;
      const frame = row > 0 && column > 0 && column < 4;
      const border = frame ? `bg-slate-50 ${row === 1 ? "border-t-4" : ""} ${column === 1 ? "border-l-4" : ""} ${column === 3 ? "border-r-4" : ""} border-slate-700` : "";
      return <div key={index} className={`flex flex-wrap content-center items-center justify-center gap-0.5 ${border}`}>
        {(cells.get(`${row}-${column}`) ?? []).map((shot, dot) => <span key={dot} className={`h-2.5 w-2.5 rounded-full ring-2 ${outcomeDot[shot.outcome] ?? outcomeDot.OTHER}`} />)}
      </div>;
    })}
  </div>;
}
function ShotList({ shots }: { shots: Shot[] }) {
  return <ol className="mt-3 divide-y divide-slate-100 text-sm">{shots.map((shot, index) => {
    const name = shot.player?.name ?? shot.playerName ?? "Không rõ";
    const target = goalTargetText(shot.goalTarget, shot.outcome);
    return <li key={index} className="flex items-center gap-2 py-1.5">
      <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-slate-500">{shot.minute === null ? "—" : `${shot.minute}${shot.addedMinute ? `+${shot.addedMinute}` : ""}′`}</span>
      <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ring-2 ${outcomeDot[shot.outcome] ?? outcomeDot.OTHER}`} />
      <span className="min-w-0 flex-1 truncate">{shot.player ? <Link href={playerPath(shot.player.id)} className="font-medium hover:underline">{name}</Link> : <span className="font-medium">{name}</span>}</span>
      <span className="shrink-0 text-right text-xs text-slate-500">{outcomeText[shot.outcome] ?? "Khác"}{target ? ` · ${target}` : ""}</span>
    </li>;
  })}</ol>;
}
/** FotMob has a pitch shot map; the free source has no pitch coordinates, so shots are shown on the goal frame and listed. */
export function ShotsView({ match }: { match: MatchDetail }) {
  if (!match.shots?.length) return null;
  const sides = [[match.homeClub, "home"], [match.awayClub, "away"]] as const;
  return <section aria-labelledby="match-shots" className={panel}>
    <h2 id="match-shots" className="font-bold">Cú sút</h2>
    <p className="mt-1 text-xs text-slate-500">Vị trí bóng đi về phía khung thành, nhìn từ người sút. Cú sút bị chặn chỉ có trong danh sách.</p>
    <ul aria-label="Chú thích" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">{["GOAL", "SAVED", "POST", "MISSED", "BLOCKED"].map((outcome) => <li key={outcome} className="flex items-center gap-1.5"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ring-2 ${outcomeDot[outcome]}`} />{outcomeText[outcome]}</li>)}</ul>
    <div className="mt-5 grid gap-8 md:grid-cols-2">{sides.map(([team, side]) => {
      const shots = match.shots!.filter((shot) => shot.clubId === team?.id);
      return <div key={side} className="min-w-0">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><TeamBadge name={teamName(team, side, true)} tla={team?.tla} crestUrl={team?.externalCrestUrl} />{team?.shortName?.trim() || teamName(team, side, true)}<span className="font-normal text-slate-500">· {shots.length} cú sút</span></h3>
        <GoalFrame shots={shots} />
        {shots.length ? <ShotList shots={shots} /> : <p className="mt-3 text-sm text-slate-500">Không có cú sút.</p>}
      </div>;
    })}</div>
  </section>;
}

export const playerStatViews = [
  { key: "hang-dau", label: "Hàng đầu" }, { key: "tan-cong", label: "Tấn công" }, { key: "chuyen-bong", label: "Chuyền bóng" },
  { key: "phong-ngu", label: "Phòng ngự" }, { key: "tranh-bong", label: "Tranh bóng" }, { key: "thu-thanh", label: "Thủ thành" },
] as const;
export type PlayerStatView = typeof playerStatViews[number]["key"];
export const parsePlayerStatView = (value: string | string[] | undefined): PlayerStatView => typeof value === "string" && playerStatViews.some((view) => view.key === value) ? value as PlayerStatView : "hang-dau";

type Row = { player: LineupPlayerView; team: MatchTeam | null; side: "home" | "away" };
type Column = { label: string; title?: string; value: (stats: Record<string, number>, row: Row) => string };
const n = (stats: Record<string, number>, key: string) => stats[key] ?? null;
const num = (value: number | null) => value === null ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
const ratio = (done: number | null, total: number | null) => done === null || total === null ? "—" : total ? `${done}/${total} (${Math.round((done / total) * 100)}%)` : `${done}/${total}`;
const sum = (...values: (number | null)[]) => values.every((value) => value === null) ? null : values.reduce<number>((total, value) => total + (value ?? 0), 0);
const columns: Record<PlayerStatView, Column[]> = {
  "hang-dau": [
    { label: "Phút", value: (_, row) => num(row.player.minutes ?? null) }, { label: "Bàn", value: (s) => num(n(s, "goalsScored")) }, { label: "Kiến tạo", value: (s) => num(n(s, "assists")) },
    { label: "xG", value: (s) => num(n(s, "expectedGoals")) }, { label: "xA", value: (s) => num(n(s, "expectedAssists")) }, { label: "xG + xA", value: (s) => num(sum(n(s, "expectedGoals"), n(s, "expectedAssists"))) },
    { label: "Tắc + cắt", title: "Tắc bóng + cắt bóng", value: (s) => num(sum(n(s, "tacklesTotal"), n(s, "interceptionsTotal"))) },
  ],
  "tan-cong": [
    { label: "Bàn", value: (s) => num(n(s, "goalsScored")) }, { label: "Sút", value: (s) => num(n(s, "shotsTotal")) }, { label: "Trúng đích", value: (s) => num(n(s, "shotsOnTarget")) },
    { label: "xG", value: (s) => num(n(s, "expectedGoals")) }, { label: "Rê bóng", title: "Rê bóng thành công / tổng", value: (s) => ratio(n(s, "dribblesSuccessful"), n(s, "dribblesTotal")) },
    { label: "Bị phạm lỗi", value: (s) => num(n(s, "fouledByOthers")) }, { label: "Việt vị", value: (s) => num(n(s, "offsides")) },
  ],
  "chuyen-bong": [
    { label: "Kiến tạo", value: (s) => num(n(s, "assists")) }, { label: "Chuyền chính xác", value: (s) => ratio(n(s, "passesSuccessful"), n(s, "passesTotal")) },
    { label: "Chuyền then chốt", value: (s) => num(n(s, "passesKey")) }, { label: "xA", value: (s) => num(n(s, "expectedAssists")) },
  ],
  "phong-ngu": [
    { label: "Tắc bóng", value: (s) => num(n(s, "tacklesTotal")) }, { label: "Cắt bóng", value: (s) => num(n(s, "interceptionsTotal")) },
    { label: "Phạm lỗi", value: (s) => num(n(s, "fouledOthers")) }, { label: "Thẻ vàng", value: (s) => num(n(s, "cardsYellow")) }, { label: "Thẻ đỏ", value: (s) => num(n(s, "cardsRed")) },
  ],
  "tranh-bong": [
    { label: "Tranh chấp thắng", value: (s) => ratio(n(s, "duelsWon"), n(s, "duelsTotal")) }, { label: "Tranh chấp thua", value: (s) => num(n(s, "duelsLost")) },
    { label: "Rê bóng", title: "Rê bóng thành công / tổng", value: (s) => ratio(n(s, "dribblesSuccessful"), n(s, "dribblesTotal")) },
  ],
  "thu-thanh": [
    { label: "Phút", value: (_, row) => num(row.player.minutes ?? null) }, { label: "Cứu thua", value: (s) => num(n(s, "goalsSaved")) }, { label: "Bị thủng lưới", value: (s) => num(n(s, "goalsConceded")) },
    { label: "Chuyền chính xác", value: (s) => ratio(n(s, "passesSuccessful"), n(s, "passesTotal")) },
  ],
};
/**
 * The name fans use: a short provider name "E. Martínez" with full name "Damián Emiliano Martínez
 * Romero" becomes "Emiliano Martínez" (the given name matching the initial); full names stay as sent.
 */
export function displayName(player: Pick<LineupPlayerView, "name" | "fullName">) {
  const short = /^\s*(\p{L})\.\s*(.+)$/u.exec(player.name);
  if (!short || !player.fullName) return player.name;
  const given = player.fullName.split(/\s+/).find((word) => word.toLocaleLowerCase("vi").startsWith(short[1].toLocaleLowerCase("vi")));
  return given ? `${given} ${short[2]}` : player.name;
}
/** FotMob's player statistics table: everyone who played, best rating first, with a view per area of the game. */
export function PlayerStatsTable({ match, view }: { match: MatchDetail; view: PlayerStatView }) {
  const rows: Row[] = ([[match.homeClub, "home"], [match.awayClub, "away"]] as const).flatMap(([team, side]) =>
    (match.lineups?.find((lineup) => lineup.clubId === team?.id)?.players ?? [])
      .filter((player) => (player.minutes ?? 0) > 0 || player.rating != null)
      .filter((player) => view !== "thu-thanh" || player.position === "Goalkeeper")
      .map((player) => ({ player, team, side })));
  if (!match.lineups?.some((lineup) => lineup.players.some((player) => player.rating != null || player.minutes != null))) return null;
  rows.sort((a, b) => (b.player.rating ?? -1) - (a.player.rating ?? -1) || (b.player.minutes ?? 0) - (a.player.minutes ?? 0) || a.player.name.localeCompare(b.player.name));
  const href = (key: PlayerStatView) => `${matchTabHref(match.slug, "thong-ke")}${key === "hang-dau" ? "" : `&bang=${key}`}#thong-ke-cau-thu`;
  return <section id="thong-ke-cau-thu" aria-labelledby="player-stats" className={`${panel} scroll-mt-4`}>
    <h2 id="player-stats" className="font-bold">Thống kê cầu thủ</h2>
    <nav aria-label="Nhóm chỉ số cầu thủ" className="-mx-1 mt-3 flex gap-2 overflow-x-auto pb-1">{playerStatViews.map((item) => <Link key={item.key} href={href(item.key)} aria-current={item.key === view ? "page" : undefined}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${item.key === view ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-600"}`}>{item.label}</Link>)}</nav>
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">Thống kê cầu thủ: {playerStatViews.find((item) => item.key === view)!.label}</caption>
        <thead className="text-[11px] text-slate-500"><tr>
          <th scope="col" className="sticky left-0 z-10 bg-white py-2 pr-3 text-left font-semibold">Cầu thủ</th>
          <th scope="col" className="px-2 py-2 text-center font-semibold">Điểm</th>
          {columns[view].map((column) => <th key={column.label} scope="col" title={column.title} className="px-2 py-2 text-center font-semibold">{column.label}</th>)}
        </tr></thead>
        <tbody>{rows.map((row) => {
          const stats = row.player.stats ?? {};
          const name = displayName(row.player);
          return <tr key={`${row.side}-${row.player.name}-${row.player.number}`} className="border-t border-slate-100">
            <th scope="row" className="sticky left-0 z-10 bg-white py-2 pr-3 text-left font-medium">
              <span className="flex min-w-[11rem] items-center gap-2"><PlayerPhoto photoUrl={row.player.photoUrl} round />
                <span className="min-w-0"><span className="block truncate">{row.player.playerId ? <Link href={playerPath(row.player.playerId)} className="hover:underline">{name}</Link> : name}</span>
                  <span className="flex items-center gap-1 text-[11px] font-normal text-slate-500"><TeamBadge name={teamName(row.team, row.side, true)} tla={row.team?.tla} crestUrl={row.team?.externalCrestUrl} />{row.team?.shortName?.trim() || teamName(row.team, row.side, true)}</span></span></span>
            </th>
            <td className="px-2 text-center">{row.player.rating != null ? <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${ratingTone(row.player.rating)}`}>{row.player.rating.toFixed(1)}</span> : "—"}</td>
            {columns[view].map((column) => <td key={column.label} className="px-2 text-center tabular-nums">{column.value(stats, row)}</td>)}
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p className="mt-3 text-[11px] text-slate-500">Điểm và chỉ số cầu thủ theo Highlightly. Cầu thủ không ra sân không được liệt kê.</p>
  </section>;
}
