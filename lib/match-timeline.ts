import { z } from "zod";
import type { MatchStatus } from "@prisma/client";
import { matchLeagues } from "./match-leagues";
import { matchDayKey, matchTimeZone } from "./match-presentation";
import type { MatchSummary } from "../types/match-ui";

/**
 * The matches page is a scrolling timeline of match days (prototype v2): one anchor day plus earlier
 * match days ("truoc") and later days with upcoming matches ("sau"), opened on request. Everything
 * lives in the URL so the back button and shared links restore the same view.
 */
export const timelineLeagues = [
  { slug: "premier-league", label: "Premier League", mark: "PL", tab: 1, emblem: 0, country: "Anh", rounds: 38, roundWord: "Vòng" },
  { slug: "la-liga", label: "La Liga", mark: "LL", tab: 2, emblem: 1, country: "Tây Ban Nha", rounds: 38, roundWord: "Vòng" },
  { slug: "ligue-1", label: "Ligue 1", mark: "L1", tab: 3, emblem: 2, country: "Pháp", rounds: 34, roundWord: "Vòng" },
  { slug: "champions-league", label: "Champions League", mark: "C1", tab: 4, emblem: 3, country: "Châu Âu", rounds: 8, roundWord: "Lượt trận" },
] as const satisfies readonly { slug: keyof typeof matchLeagues; label: string; mark: string; tab: number; emblem: number; country: string; rounds: number; roundWord: string }[];
export type TimelineLeague = typeof timelineLeagues[number];
export const timelineLeague = (slug: string) => timelineLeagues.find((league) => league.slug === slug) ?? null;

export const timelineStatuses = [["all", "Tất cả"], ["live", "Đang diễn ra"], ["upcoming", "Sắp đá"], ["finished", "Đã kết thúc"]] as const;
export type TimelineStatus = typeof timelineStatuses[number][0];
/** Database statuses behind each filter; "all" also shows postponed and cancelled matches. */
export const timelineStatusValues: Record<Exclude<TimelineStatus, "all">, MatchStatus[]> = { live: ["LIVE", "HALFTIME", "SUSPENDED"], upcoming: ["SCHEDULED"], finished: ["FINISHED"] };
export type FixtureState = "live" | "upcoming" | "finished" | "postponed";
export function fixtureState(status: MatchStatus): FixtureState {
  if (status === "FINISHED") return "finished";
  if (status === "SCHEDULED") return "upcoming";
  if (status === "POSTPONED" || status === "CANCELLED") return "postponed";
  return "live";
}

const count = z.coerce.number().int().min(0).max(40);
const timelineSchema = z.object({
  league: z.string().refine((value) => value === "all" || timelineLeague(value) !== null),
  status: z.enum(["all", "live", "upcoming", "finished"]),
  ngay: z.iso.date(), truoc: count, sau: count,
  doi: z.boolean(),
});
export type TimelineView = z.infer<typeof timelineSchema> & { today: string };

/** Reads the query string; older "?from=" links open on their first day. Repeated parameters are invalid. */
export function parseTimeline(params: Record<string, string | string[] | undefined>, now = new Date()) {
  const today = matchDayKey(now);
  const parsed = timelineSchema.safeParse({
    league: params.league ?? "all", status: params.status ?? "all",
    ngay: params.ngay ?? params.from ?? today, truoc: params.truoc ?? 0, sau: params.sau ?? 0,
    doi: params.doi === undefined ? false : params.doi === "theo-doi" ? true : "invalid",
  });
  return parsed.success ? { success: true as const, data: { ...parsed.data, today } } : { success: false as const };
}
export const defaultTimeline = (now = new Date()): TimelineView => ({ league: "all", status: "all", ngay: matchDayKey(now), truoc: 0, sau: 0, doi: false, today: matchDayKey(now) });

/** Canonical link: defaults are left out. */
export function timelineHref(view: TimelineView, overrides: Partial<TimelineView> = {}, hash = "") {
  const values = { ...view, ...overrides };
  const query = new URLSearchParams();
  if (values.ngay !== values.today) query.set("ngay", values.ngay);
  if (values.league !== "all") query.set("league", values.league);
  if (values.status !== "all") query.set("status", values.status);
  if (values.doi) query.set("doi", "theo-doi");
  if (values.truoc) query.set("truoc", String(values.truoc));
  if (values.sau) query.set("sau", String(values.sau));
  const search = query.toString();
  return `/matches${search ? `?${search}` : ""}${hash}`;
}

/** "20/10/2026" from "2026-10-20". */
export const dayNumbers = (day: string) => day.split("-").reverse().join("/");
/** "T3, 20/10" under a kickoff time. */
export const shortWeekday = (value: MatchSummary["kickoffAt"]) => new Intl.DateTimeFormat("vi-VN", { timeZone: matchTimeZone, weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(value));
/** "2026/2027" → "2026/27". */
export function shortSeason(name: string | null | undefined) {
  const match = name?.match(/^(\d{4})\s*[/-]\s*(\d{4})$/);
  return match ? `${match[1]}/${match[2].slice(2)}` : name ?? null;
}
/** Each side's goals as shown on a fixture card: after extra time when the match went there; null when unknown. */
export function sideScores(match: MatchSummary): { home: number; away: number } | null {
  const ok = (value: number | null | undefined): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
  if (!ok(match.homeScore) || !ok(match.awayScore)) return null;
  const extra = ["EXTRA_TIME", "PENALTY_SHOOTOUT"].includes(match.scoreDuration ?? "") && ok(match.homeExtraTimeScore) && ok(match.awayExtraTimeScore);
  return extra ? { home: match.homeScore + match.homeExtraTimeScore!, away: match.awayScore + match.awayExtraTimeScore! } : { home: match.homeScore, away: match.awayScore };
}
/** Numeric rounds sort numerically; named knockout rounds keep their stored order after them. */
export function compareRounds(a: string | null, b: string | null) {
  return (a ?? "").localeCompare(b ?? "", "vi", { numeric: true });
}

/** Shifts a YYYY-MM-DD day key by a given number of days. */
export function shiftDayKey(isoDate: string, daysOffset: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + daysOffset, 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

/** "CN", "T2", "T3" ... from a YYYY-MM-DD string. */
export function weekdayLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const day = date.getUTCDay();
  return day === 0 ? "CN" : `T${day + 1}`;
}

/** "27/10" from "2026-10-27". */
export function dayShort(isoDate: string): string {
  const parts = isoDate.split("-");
  return `${parts[2]}/${parts[1]}`;
}
