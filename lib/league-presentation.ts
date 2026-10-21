import type { LeagueSlug, LeagueTab } from "../types/league-hub";
import { leagueTabs } from "../types/league-hub";

export const leagueTabLabels: Record<LeagueTab, string> = {
  "tin-tuc": "Tin tức", "tong-quan": "Tổng quan", "bang-xep-hang": "Bảng xếp hạng", "lich-thi-dau": "Lịch thi đấu", "loai-truc-tiep": "Loại trực tiếp", "thong-ke": "Thống kê", "mua-giai": "Mùa giải", "doi-bong": "Đội bóng", "chuyen-nhuong": "Chuyển nhượng",
};
/** Tabs a league shows: the knockout bracket only for a competition that has one. */
export const tabsFor = (slug: LeagueSlug) => leagueTabs.filter((tab) => tab !== "loai-truc-tiep" || slug === "champions-league");
/** How the fixtures tab lists matches: by round, by match day, or one club's season. */
export const fixtureViews = [["vong", "Theo vòng"], ["ngay", "Theo ngày"], ["doi", "Theo đội"]] as const;
export type FixtureView = typeof fixtureViews[number][0];
export const leagueLinks: { slug: LeagueSlug; label: string }[] = [{ slug: "premier-league", label: "Ngoại hạng Anh" }, { slug: "la-liga", label: "La Liga" }, { slug: "ligue-1", label: "Ligue 1" }, { slug: "champions-league", label: "Champions League" }];
const dayMs = 86400000; const windowDays = 7; const maxShiftDays = 120;
const vietnamDate = (date: Date) => new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10);
const startOfVietnamDay = (day: string) => new Date(`${day}T00:00:00+07:00`);

/**
 * `round`: the round chosen with ?vong= (overview and fixtures), null for the current one. On the fixtures tab
 * `view` (?xem=) picks the listing, `day` (?ngay=) a match day and `club` (?doi=) one club's season.
 */
export type LeagueQuery = { tab: LeagueTab; offset: number; from: string; round: number | null; view: FixtureView; day: string | null; club: string | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Strict parsing: unknown tabs, bad offsets and out-of-range dates make the whole query invalid. */
export function parseLeagueQuery(params: Record<string, string | string[] | undefined>, now: Date): LeagueQuery | null {
  const tab = params.tab ?? "tong-quan"; const bao = params.bao ?? "0"; const tu = params.tu; const vong = params.vong;
  const xem = params.xem ?? "vong"; const ngay = params.ngay; const doi = params.doi;
  if (vong !== undefined && (typeof vong !== "string" || !/^[1-9]\d?$/.test(vong))) return null;
  if (typeof xem !== "string" || !fixtureViews.some(([key]) => key === xem)) return null;
  if (ngay !== undefined && (typeof ngay !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(ngay) || !Number.isFinite(Date.parse(`${ngay}T00:00:00Z`)))) return null;
  if (doi !== undefined && (typeof doi !== "string" || !uuid.test(doi))) return null;
  if (typeof tab !== "string" || !(leagueTabs as readonly string[]).includes(tab) || typeof bao !== "string" || !/^\d{1,4}$/.test(bao) || (tu !== undefined && typeof tu !== "string")) return null;
  const today = vietnamDate(now);
  const from = tu ?? vietnamDate(new Date(now.getTime() - 3 * dayMs));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !Number.isFinite(Date.parse(`${from}T00:00:00Z`)) || new Date(`${from}T00:00:00Z`).toISOString().slice(0, 10) !== from) return null;
  if (Math.abs(Date.parse(`${from}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) > maxShiftDays * dayMs) return null;
  return { tab: tab as LeagueTab, offset: Number(bao), from, round: vong ? Number(vong) : null, view: xem as FixtureView, day: ngay ?? null, club: doi?.toLowerCase() ?? null };
}
export function leagueHref(slug: LeagueSlug, query: Partial<LeagueQuery> & { tab?: LeagueTab } = {}) {
  const params = new URLSearchParams();
  if (query.tab && query.tab !== "tong-quan") params.set("tab", query.tab);
  if (query.offset) params.set("bao", String(query.offset));
  if (query.from) params.set("tu", query.from);
  if (query.view && query.view !== "vong") params.set("xem", query.view);
  if (query.round) params.set("vong", String(query.round));
  if (query.day) params.set("ngay", query.day);
  if (query.club) params.set("doi", query.club);
  return `/league/${slug}${params.size ? `?${params}` : ""}`;
}
/** 7-day window [from, from+7d) in Vietnam time and the dates of the neighbouring windows. */
export function fixtureWindow(from: string, now: Date) {
  const start = startOfVietnamDay(from); const end = new Date(start.getTime() + windowDays * dayMs);
  const shift = (days: number) => vietnamDate(new Date(start.getTime() + days * dayMs));
  const today = vietnamDate(now);
  const clamp = (day: string) => Math.abs(Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) <= maxShiftDays * dayMs ? day : null;
  return { start, end, last: vietnamDate(new Date(end.getTime() - dayMs)), prev: clamp(shift(-windowDays)), next: clamp(shift(windowDays)) };
}
export const resultLabel = { W: "T", D: "H", L: "B" } as const;
export const resultText = { W: "Thắng", D: "Hòa", L: "Thua" } as const;
