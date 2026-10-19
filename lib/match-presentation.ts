import type { MatchDate, MatchSummary, MatchTeam } from "../types/match-ui";

export const matchTimeZone = "Asia/Ho_Chi_Minh";
export const matchStatusLabels = {
  SCHEDULED: "Sắp diễn ra", LIVE: "Đang diễn ra", HALFTIME: "Nghỉ giữa hiệp",
  FINISHED: "Kết thúc", POSTPONED: "Hoãn", CANCELLED: "Hủy", SUSPENDED: "Tạm dừng",
} as const;

function validDate(value: MatchDate | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
export function matchDayKey(value: MatchDate) {
  const date = validDate(value);
  if (!date) return "unknown";
  const parts = new Intl.DateTimeFormat("en", { timeZone: matchTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}-${parts.find((p) => p.type === "day")!.value}`;
}
export function formatMatchTime(value: MatchDate) {
  const date = validDate(value);
  return date ? new Intl.DateTimeFormat("vi-VN", { timeZone: matchTimeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date) : "Chưa rõ giờ";
}
export function formatMatchDate(value: MatchDate, includeYear = false) {
  const date = validDate(value);
  return date ? new Intl.DateTimeFormat("vi-VN", { timeZone: matchTimeZone, weekday: "long", day: "2-digit", month: "2-digit", ...(includeYear ? { year: "numeric" as const } : {}) }).format(date) : "Chưa rõ ngày";
}
export function formatUpdated(value: MatchDate | null | undefined) {
  const date = validDate(value);
  return date ? new Intl.DateTimeFormat("vi-VN", { timeZone: matchTimeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23", day: "2-digit", month: "2-digit" }).format(date) : null;
}
export function matchIsoTimestamp(value: MatchDate) { return validDate(value)?.toISOString(); }
export function formatRound(round: string | null | undefined) {
  if (!round?.trim()) return null;
  if (/^\d+$/.test(round)) return `Vòng ${round}`;
  const labels: Record<string, string> = { REGULAR_SEASON: "Vòng đấu chính", GROUP_STAGE: "Vòng bảng", FINAL: "Chung kết", THIRD_PLACE: "Tranh hạng ba", SEMI_FINALS: "Bán kết", QUARTER_FINALS: "Tứ kết", LAST_16: "Vòng 1/8", LAST_32: "Vòng 1/16" };
  return labels[round] ?? round;
}
export function dateBounds(from: string, to: string, zone: "UTC" | typeof matchTimeZone = "UTC") {
  const offset = zone === "UTC" ? "Z" : "+07:00";
  return { gte: new Date(`${from}T00:00:00${offset}`), lt: new Date(Date.parse(`${to}T00:00:00${offset}`) + 86400000) };
}
export function teamName(team: MatchTeam | null, side: "home" | "away", full = false) {
  const fallback = side === "home" ? "Đội chủ nhà" : "Đội khách";
  const name = team?.name?.trim(); const short = team?.shortName?.trim();
  return (full ? name || short : short || name) || fallback;
}
export function teamMonogram(team: MatchTeam | null) {
  const tla = team?.tla?.trim();
  if (tla) return tla.slice(0, 4).toLocaleUpperCase("vi-VN");
  const words = (team?.shortName || team?.name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words.length === 1 ? words[0].slice(0, 3) : words.slice(0, 3).map((word) => [...word][0]).join("")).toLocaleUpperCase("vi-VN");
}
function pair(home: number | null | undefined, away: number | null | undefined) {
  return typeof home === "number" && typeof away === "number" && Number.isInteger(home) && Number.isInteger(away) && home >= 0 && away >= 0 ? { home, away } : null;
}
export function scorePresentation(match: MatchSummary) {
  const regulation = pair(match.homeScore, match.awayScore);
  const extra = pair(match.homeExtraTimeScore, match.awayExtraTimeScore);
  const penalties = pair(match.homePenaltyScore, match.awayPenaltyScore);
  if (match.status === "SCHEDULED") return { text: formatMatchTime(match.kickoffAt), label: "Giờ thi đấu", penalties: null, regulation: null };
  if (["POSTPONED", "CANCELLED"].includes(match.status)) return { text: "—", label: "Chưa có tỷ số", penalties: null, regulation: null };
  const afterExtra = regulation && extra && ["EXTRA_TIME", "PENALTY_SHOOTOUT"].includes(match.scoreDuration ?? "");
  const scores = afterExtra ? { home: regulation.home + extra.home, away: regulation.away + extra.away } : regulation;
  return { text: scores ? `${scores.home} – ${scores.away}` : "—", label: scores ? (afterExtra ? "Sau hiệp phụ" : match.scoreDuration === "PENALTY_SHOOTOUT" || match.scoreDuration === "EXTRA_TIME" ? "90 phút" : match.status === "FINISHED" ? "Tỷ số kết thúc" : "Tỷ số hiện tại") : "Chưa có tỷ số",
    penalties: penalties ? `${penalties.home} – ${penalties.away}` : null,
    regulation: afterExtra && regulation ? `${regulation.home} – ${regulation.away}` : null };
}
export function isMatchStale(match: MatchSummary, now: Date) {
  const updated = validDate(match.lastUpdatedAt);
  return match.status !== "FINISHED" && (!updated || now.getTime() - updated.getTime() > 6 * 3600000);
}
export function groupMatchesByDate(matches: MatchSummary[]) {
  const groups = new Map<string, MatchSummary[]>();
  for (const match of matches) {
    const key = matchDayKey(match.kickoffAt);
    groups.set(key, [...(groups.get(key) ?? []), match]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}
