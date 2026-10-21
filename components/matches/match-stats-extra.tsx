import Link from "next/link";
import type { ReactNode } from "react";
import type { LineupPlayerView, MatchDetail, MatchTeam } from "../../types/match-ui";
import { teamName } from "../../lib/match-presentation";
import { playerPath } from "../../lib/player-presentation";
import { ratingTone } from "../../lib/match-lineup-marks";
import { matchTabHref } from "../../lib/match-tabs";
import { TeamBadge } from "../ui/team-badge";
import { PlayerPhoto } from "../ui/player-photo";
import { StatsList } from "./match-tab-views";

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
  return <ol className="mt-2 divide-y divide-slate-100 text-sm">{shots.map((shot, index) => {
    const name = shot.player?.name ?? shot.playerName ?? "Không rõ";
    const target = goalTargetText(shot.goalTarget, shot.outcome);
    return <li key={index} className="flex items-center gap-2 py-1.5">
      <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-slate-500">{shot.minute === null ? "—" : `${shot.minute}${shot.addedMinute ? `+${shot.addedMinute}` : ""}′`}</span>
      <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ring-2 ${outcomeDot[shot.outcome] ?? outcomeDot.OTHER}`} />
      <span className="min-w-0 flex-1 truncate">{shot.player ? <Link href={playerPath(shot.player.id)} className="inline-block py-[3px] font-medium hover:underline">{name}</Link> : <span className="font-medium">{name}</span>}</span>
      <span className="shrink-0 text-right text-xs text-slate-500">{outcomeText[shot.outcome] ?? "Khác"}{target ? ` · ${target}` : ""}</span>
    </li>;
  })}</ol>;
}
/**
 * FotMob has a pitch shot map; the free source has no pitch coordinates, so each team's shots are
 * drawn on the goal frame with a one-line summary, and the full list is one click away.
 */
export function ShotsView({ match }: { match: MatchDetail }) {
  if (!match.shots?.length) return null;
  const sides = [[match.homeClub, "home"], [match.awayClub, "away"]] as const;
  return <section id="thong-ke-cu-sut" aria-labelledby="match-shots" className={`${panel} scroll-mt-4`}>
    <h2 id="match-shots" className="font-bold">Cú sút</h2>
    <div className="mt-4 grid gap-6 sm:grid-cols-2">{sides.map(([team, side]) => {
      const shots = match.shots!.filter((shot) => shot.clubId === team?.id);
      const count = (outcomes: string[]) => shots.filter((shot) => outcomes.includes(shot.outcome)).length;
      return <div key={side} className="min-w-0">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-bold"><TeamBadge name={teamName(team, side, true)} tla={team?.tla} crestUrl={team?.externalCrestUrl} /><span className="truncate">{team?.shortName?.trim() || teamName(team, side, true)}</span></h3>
        <p className="mb-3 text-xs text-slate-500"><strong className="text-slate-800">{shots.length}</strong> cú sút · <strong className="text-slate-800">{count(["GOAL"])}</strong> bàn</p>
        <GoalFrame shots={shots} />
        {shots.length > 0 && <details className="mt-3 text-sm">
          <summary className="flex min-h-6 cursor-pointer items-center text-xs font-semibold text-slate-600">Danh sách {shots.length} cú sút</summary>
          <ShotList shots={shots} />
        </details>}
      </div>;
    })}</div>
    <ul aria-label="Chú thích" className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500">{["GOAL", "SAVED", "POST", "MISSED", "BLOCKED"].map((outcome) => <li key={outcome} className="flex items-center gap-1.5"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ring-2 ${outcomeDot[outcome]}`} />{outcomeText[outcome]}</li>)}
      <li className="basis-full">Vị trí bóng đi về phía khung thành, nhìn từ người sút; cú sút bị chặn chỉ có trong danh sách.</li></ul>
  </section>;
}

export const playerStatViews = [
  { key: "hang-dau", label: "Hàng đầu" }, { key: "tan-cong", label: "Tấn công" }, { key: "chuyen-bong", label: "Chuyền bóng" },
  { key: "phong-ngu", label: "Phòng ngự" }, { key: "tranh-bong", label: "Tranh bóng" }, { key: "thu-thanh", label: "Thủ thành" },
] as const;
export type PlayerStatView = typeof playerStatViews[number]["key"];
export const parsePlayerStatView = (value: string | string[] | undefined): PlayerStatView => typeof value === "string" && playerStatViews.some((view) => view.key === value) ? value as PlayerStatView : "hang-dau";
/** Player table filter: both teams (default), home ("nha") or away ("khach"). */
export type PlayerTeamFilter = "all" | "home" | "away";
export const parsePlayerTeamFilter = (value: string | string[] | undefined): PlayerTeamFilter => value === "nha" ? "home" : value === "khach" ? "away" : "all";

type Row = { player: LineupPlayerView; team: MatchTeam | null; side: "home" | "away" };
/** raw: the number compared to mark the column's best value (absent: never marked). */
type Column = { label: string; title?: string; value: (stats: Record<string, number>, row: Row) => string; raw?: (stats: Record<string, number>, row: Row) => number | null };
const n = (stats: Record<string, number>, key: string) => stats[key] ?? null;
const num = (value: number | null) => value === null ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
const ratio = (done: number | null, total: number | null) => done === null || total === null ? "—" : total ? `${done}/${total} (${Math.round((done / total) * 100)}%)` : `${done}/${total}`;
const sum = (...values: (number | null)[]) => values.every((value) => value === null) ? null : values.reduce<number>((total, value) => total + (value ?? 0), 0);
const count = (key: string) => (s: Record<string, number>) => n(s, key);
const columns: Record<PlayerStatView, Column[]> = {
  "hang-dau": [
    { label: "Phút", value: (_, row) => num(row.player.minutes ?? null) }, { label: "Bàn", value: (s) => num(n(s, "goalsScored")), raw: count("goalsScored") }, { label: "Kiến tạo", value: (s) => num(n(s, "assists")), raw: count("assists") },
    { label: "xG", value: (s) => num(n(s, "expectedGoals")), raw: count("expectedGoals") }, { label: "xA", value: (s) => num(n(s, "expectedAssists")), raw: count("expectedAssists") },
    { label: "xG + xA", value: (s) => num(sum(n(s, "expectedGoals"), n(s, "expectedAssists"))), raw: (s) => sum(n(s, "expectedGoals"), n(s, "expectedAssists")) },
    { label: "Tắc + cắt", title: "Tắc bóng + cắt bóng", value: (s) => num(sum(n(s, "tacklesTotal"), n(s, "interceptionsTotal"))), raw: (s) => sum(n(s, "tacklesTotal"), n(s, "interceptionsTotal")) },
  ],
  "tan-cong": [
    { label: "Bàn", value: (s) => num(n(s, "goalsScored")), raw: count("goalsScored") }, { label: "Sút", value: (s) => num(n(s, "shotsTotal")), raw: count("shotsTotal") }, { label: "Trúng đích", value: (s) => num(n(s, "shotsOnTarget")), raw: count("shotsOnTarget") },
    { label: "xG", value: (s) => num(n(s, "expectedGoals")), raw: count("expectedGoals") }, { label: "Rê bóng", title: "Rê bóng thành công / tổng", value: (s) => ratio(n(s, "dribblesSuccessful"), n(s, "dribblesTotal")), raw: count("dribblesSuccessful") },
    { label: "Bị phạm lỗi", value: (s) => num(n(s, "fouledByOthers")), raw: count("fouledByOthers") }, { label: "Việt vị", value: (s) => num(n(s, "offsides")) },
  ],
  "chuyen-bong": [
    { label: "Kiến tạo", value: (s) => num(n(s, "assists")), raw: count("assists") }, { label: "Chuyền chính xác", value: (s) => ratio(n(s, "passesSuccessful"), n(s, "passesTotal")), raw: count("passesSuccessful") },
    { label: "Chuyền then chốt", value: (s) => num(n(s, "passesKey")), raw: count("passesKey") }, { label: "xA", value: (s) => num(n(s, "expectedAssists")), raw: count("expectedAssists") },
  ],
  "phong-ngu": [
    { label: "Tắc bóng", value: (s) => num(n(s, "tacklesTotal")), raw: count("tacklesTotal") }, { label: "Cắt bóng", value: (s) => num(n(s, "interceptionsTotal")), raw: count("interceptionsTotal") },
    { label: "Phạm lỗi", value: (s) => num(n(s, "fouledOthers")) }, { label: "Thẻ vàng", value: (s) => num(n(s, "cardsYellow")) }, { label: "Thẻ đỏ", value: (s) => num(n(s, "cardsRed")) },
  ],
  "tranh-bong": [
    { label: "Tranh chấp thắng", value: (s) => ratio(n(s, "duelsWon"), n(s, "duelsTotal")), raw: count("duelsWon") }, { label: "Tranh chấp thua", value: (s) => num(n(s, "duelsLost")) },
    { label: "Rê bóng", title: "Rê bóng thành công / tổng", value: (s) => ratio(n(s, "dribblesSuccessful"), n(s, "dribblesTotal")), raw: count("dribblesSuccessful") },
  ],
  "thu-thanh": [
    { label: "Phút", value: (_, row) => num(row.player.minutes ?? null) }, { label: "Cứu thua", value: (s) => num(n(s, "goalsSaved")), raw: count("goalsSaved") }, { label: "Bị thủng lưới", value: (s) => num(n(s, "goalsConceded")) },
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
/** FotMob's player statistics table: everyone who played, best rating first, a view per area of the game, filterable by team. */
export function PlayerStatsTable({ match, view, team = "all" }: { match: MatchDetail; view: PlayerStatView; team?: PlayerTeamFilter }) {
  if (!match.lineups?.some((lineup) => lineup.players.some((player) => player.rating != null || player.minutes != null))) return null;
  const rows: Row[] = ([[match.homeClub, "home"], [match.awayClub, "away"]] as const).filter(([, side]) => team === "all" || team === side).flatMap(([club, side]) =>
    (match.lineups?.find((lineup) => lineup.clubId === club?.id)?.players ?? [])
      .filter((player) => (player.minutes ?? 0) > 0 || player.rating != null)
      .filter((player) => view !== "thu-thanh" || player.position === "Goalkeeper")
      .map((player) => ({ player, team: club, side })));
  rows.sort((a, b) => (b.player.rating ?? -1) - (a.player.rating ?? -1) || (b.player.minutes ?? 0) - (a.player.minutes ?? 0) || a.player.name.localeCompare(b.player.name));
  const best = columns[view].map((column) => { if (!column.raw) return null; const values = rows.map((row) => column.raw!(row.player.stats ?? {}, row) ?? 0); const max = Math.max(0, ...values); return max > 0 ? max : null; });
  const topRating = Math.max(-1, ...rows.map((row) => row.player.rating ?? -1));
  const href = (next: { view?: PlayerStatView; team?: PlayerTeamFilter }) => {
    const v = next.view ?? view; const t = next.team ?? team;
    return `${matchTabHref(match.slug, "thong-ke")}${v === "hang-dau" ? "" : `&bang=${v}`}${t === "all" ? "" : `&doi=${t === "home" ? "nha" : "khach"}`}#thong-ke-cau-thu`;
  };
  const chip = (active: boolean) => `shrink-0 rounded-full border px-3 py-1 text-sm font-semibold ${active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-600"}`;
  const teamLabel = (club: MatchTeam | null, side: "home" | "away") => club?.shortName?.trim() || teamName(club, side, true);
  return <section id="thong-ke-cau-thu" aria-labelledby="player-stats" className={`${panel} scroll-mt-4`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="player-stats" className="font-bold">Thống kê cầu thủ</h2>
      <nav aria-label="Lọc theo đội" className="flex flex-wrap gap-1.5">{(["all", "home", "away"] as const).map((key) => <Link key={key} href={href({ team: key })} aria-current={key === team ? "page" : undefined} className={chip(key === team)}>
        {key === "all" ? "Cả hai đội" : <span className="flex items-center gap-1.5"><TeamBadge name={teamName(key === "home" ? match.homeClub : match.awayClub, key, true)} tla={(key === "home" ? match.homeClub : match.awayClub)?.tla} crestUrl={(key === "home" ? match.homeClub : match.awayClub)?.externalCrestUrl} />{teamLabel(key === "home" ? match.homeClub : match.awayClub, key)}</span>}</Link>)}</nav>
    </div>
    <nav aria-label="Nhóm chỉ số cầu thủ" className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">{playerStatViews.map((item) => <Link key={item.key} href={href({ view: item.key })} aria-current={item.key === view ? "page" : undefined} className={chip(item.key === view)}>{item.label}</Link>)}</nav>
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[600px] text-sm">
        <caption className="sr-only">Thống kê cầu thủ: {playerStatViews.find((item) => item.key === view)!.label}</caption>
        <thead className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500"><tr>
          <th scope="col" className="sticky left-0 z-10 bg-white py-2 pr-3 text-left font-semibold">Cầu thủ</th>
          <th scope="col" className="px-2 py-2 text-center font-semibold">Điểm</th>
          {columns[view].map((column) => <th key={column.label} scope="col" title={column.title} className="whitespace-nowrap px-2 py-2 text-right font-semibold">{column.label}</th>)}
        </tr></thead>
        <tbody>{rows.map((row) => {
          const stats = row.player.stats ?? {};
          const name = displayName(row.player);
          return <tr key={`${row.side}-${row.player.name}-${row.player.number}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
            <th scope="row" className="sticky left-0 z-10 bg-white py-1.5 pr-3 text-left font-medium">
              <span className="flex min-w-[10.5rem] items-center gap-2">
                <PlayerPhoto photoUrl={row.player.photoUrl} round />
                <span className="min-w-0 flex-1 truncate">{row.player.playerId ? <Link href={playerPath(row.player.playerId)} className="inline-block py-[3px] hover:underline">{name}</Link> : name}</span>
                <span title={teamLabel(row.team, row.side)} className="shrink-0"><TeamBadge name={teamName(row.team, row.side, true)} tla={row.team?.tla} crestUrl={row.team?.externalCrestUrl} /></span>
              </span>
            </th>
            <td className="px-2 text-center">{row.player.rating != null ? <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${ratingTone(row.player.rating)}`}>{row.player.rating.toFixed(1)}{row.player.rating === topRating && <span aria-label="cao nhất trận">★</span>}</span> : "—"}</td>
            {columns[view].map((column, index) => {
              const top = best[index] !== null && column.raw!(stats, row) === best[index];
              return <td key={column.label} className={`whitespace-nowrap px-2 text-right tabular-nums ${top ? "font-bold text-slate-950" : "text-slate-700"}`}>{top ? <span className="rounded bg-lime-100 px-1">{column.value(stats, row)}</span> : column.value(stats, row)}</td>;
            })}
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p className="mt-3 text-[11px] text-slate-500">Điểm và chỉ số cầu thủ theo Highlightly; cầu thủ không ra sân không được liệt kê. Ô tô xanh: cao nhất ở cột đó.</p>
  </section>;
}

/** Colour key for the two teams and quick links to each part of the statistics tab. */
function StatsHeader({ match, hasShots, hasPlayers }: { match: MatchDetail; hasShots: boolean; hasPlayers: boolean }) {
  const side = (club: MatchTeam | null, key: "home" | "away", swatch: string) => <span className={`flex min-w-0 items-center gap-2 ${key === "away" ? "flex-row-reverse" : ""}`}>
    <span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-full ${swatch}`} /><TeamBadge name={teamName(club, key, true)} tla={club?.tla} crestUrl={club?.externalCrestUrl} />
    <span className="truncate text-sm font-bold">{club?.shortName?.trim() || teamName(club, key, true)}</span></span>;
  const links = [["#thong-ke-tong-quan", "Tổng quan"], ...(hasShots ? [["#thong-ke-cu-sut", "Cú sút"]] : []), ["#thong-ke-doi", "Chỉ số đội"], ...(hasPlayers ? [["#thong-ke-cau-thu", "Cầu thủ"]] : [])];
  return <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
    <div className="flex items-center justify-between gap-3">{side(match.homeClub, "home", "bg-[var(--fb-color-brand)]")}<span className="text-xs text-slate-600">vs</span>{side(match.awayClub, "away", "bg-[var(--fb-color-navy)]")}</div>
    <nav aria-label="Phần của tab thống kê" className="mt-3 flex gap-1.5 overflow-x-auto border-t border-slate-100 pt-3">{links.map(([href, label]) => <a key={href} href={href} className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200">{label}</a>)}</nav>
  </div>;
}
/**
 * The statistics tab, read top-down: team key and quick links; the headline figures beside the
 * shots; the team figures in small cards; the player table.
 */
export function StatsTab({ match, view, team, top }: { match: MatchDetail; view: PlayerStatView; team: PlayerTeamFilter; top: ReactNode }) {
  const hasShots = Boolean(match.shots?.length);
  const hasPlayers = Boolean(match.lineups?.some((lineup) => lineup.players.some((player) => player.rating != null || player.minutes != null)));
  if (!match.stats.length && !hasShots && !hasPlayers) return <p role="status" className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm leading-7 text-slate-600">Chưa có dữ liệu thống kê (kiểm soát bóng, số cú sút, phạt góc…) cho trận này.</p>;
  return <div className="space-y-4">
    <StatsHeader match={match} hasShots={hasShots} hasPlayers={hasPlayers} />
    <div id="thong-ke-tong-quan" className={`grid scroll-mt-4 items-start gap-4 ${hasShots ? "lg:grid-cols-2" : ""}`}>{top}<ShotsView match={match} /></div>
    <div id="thong-ke-doi" className="scroll-mt-4"><StatsList match={match} /></div>
    <PlayerStatsTable match={match} view={view} team={team} />
  </div>;
}
