import { z } from "zod";
import { matchLeagues } from "./match-leagues";
import { matchDayKey, matchTimeZone } from "./match-presentation";

export const uiStatusFilters = { all: "Tất cả", live: "Đang diễn ra", upcoming: "Sắp diễn ra", finished: "Kết thúc" } as const;
/** Short Vietnamese names for the league chips. */
export const uiLeagueLabels: Record<keyof typeof matchLeagues, string> = { "premier-league": "Ngoại hạng Anh", "la-liga": "La Liga", "champions-league": "Champions League" };
export const matchUiFilterSchema = z.object({
  league: z.string().refine((value) => value === "all" || Object.hasOwn(matchLeagues, value)),
  from: z.iso.date(), to: z.iso.date(),
  status: z.enum(["all", "upcoming", "live", "finished"]),
  page: z.coerce.number().int().min(1).max(10000),
}).refine((value) => value.from <= value.to && Date.parse(value.to) - Date.parse(value.from) <= 31 * 86400000);
export type MatchUiFilters = z.infer<typeof matchUiFilterSchema>;
/** Football is followed day by day: the default is today (Vietnam time), every league, every status. */
export function defaultUiFilters(now = new Date()): MatchUiFilters {
  const today = matchDayKey(now);
  return { league: "all", from: today, to: today, status: "all", page: 1 };
}
/**
 * "?ngay=YYYY-MM-DD" picks one day (the normal case). Older "from"/"to" range links keep working;
 * a range is at most 32 days.
 */
export function parseUiFilters(params: Record<string, string | string[] | undefined>, now = new Date()) {
  const { ngay, ...rest } = params;
  const day = ngay === undefined ? {} : { from: ngay, to: ngay };
  return matchUiFilterSchema.safeParse({ ...defaultUiFilters(now), ...Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined)), ...day });
}
export const isSingleDay = (filters: MatchUiFilters) => filters.from === filters.to;
/** Canonical, short links: defaults are left out and a single day is written as ?ngay=. */
export function matchListHref(filters: MatchUiFilters, overrides: Partial<MatchUiFilters> = {}) {
  const values = { ...filters, ...overrides };
  const query = new URLSearchParams();
  if (values.from === values.to) query.set("ngay", values.from); else { query.set("from", values.from); query.set("to", values.to); }
  if (values.league !== "all") query.set("league", values.league);
  if (values.status !== "all") query.set("status", values.status);
  if (values.page !== 1) query.set("page", String(values.page));
  return `/matches?${query}`;
}
export const matchSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/);

/** A Vietnam calendar day shifted by whole days. */
export function shiftDay(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
const weekdays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
/** The seven days shown around the selected one, with friendly names for yesterday, today and tomorrow. */
export function dayStrip(selected: string, now: Date) {
  const today = matchDayKey(now);
  return Array.from({ length: 7 }, (_, index) => {
    const day = shiftDay(selected, index - 3);
    const date = new Date(`${day}T00:00:00Z`);
    const relative = day === today ? "Hôm nay" : day === shiftDay(today, -1) ? "Hôm qua" : day === shiftDay(today, 1) ? "Ngày mai" : null;
    return { day, label: relative ?? weekdays[date.getUTCDay()], date: `${day.slice(8, 10)}/${day.slice(5, 7)}`, today: day === today };
  });
}
/** "Thứ Ba, 20/10/2026" for headings. */
export function longDay(day: string) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: matchTimeZone, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${day}T12:00:00+07:00`));
}
