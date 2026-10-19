import type { LeagueSlug, LeagueTab } from "../types/league-hub";
import { leagueTabs } from "../types/league-hub";

export const leagueTabLabels: Record<LeagueTab, string> = {
  "tin-tuc": "Tin tức", "tong-quan": "Tổng quan", "bang-xep-hang": "Bảng xếp hạng", "lich-thi-dau": "Lịch thi đấu", "doi-bong": "Đội bóng", "chuyen-nhuong": "Chuyển nhượng",
};
export const leagueLinks: { slug: LeagueSlug; label: string }[] = [{ slug: "premier-league", label: "Ngoại hạng Anh" }, { slug: "la-liga", label: "La Liga" }];
const dayMs = 86400000; const windowDays = 7; const maxShiftDays = 120;
const vietnamDate = (date: Date) => new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10);
const startOfVietnamDay = (day: string) => new Date(`${day}T00:00:00+07:00`);

export type LeagueQuery = { tab: LeagueTab; offset: number; from: string };
/** Strict parsing: unknown tabs, bad offsets and out-of-range dates make the whole query invalid. */
export function parseLeagueQuery(params: Record<string, string | string[] | undefined>, now: Date): LeagueQuery | null {
  const tab = params.tab ?? "tin-tuc"; const bao = params.bao ?? "0"; const tu = params.tu;
  if (typeof tab !== "string" || !(leagueTabs as readonly string[]).includes(tab) || typeof bao !== "string" || !/^\d{1,4}$/.test(bao) || (tu !== undefined && typeof tu !== "string")) return null;
  const today = vietnamDate(now);
  const from = tu ?? vietnamDate(new Date(now.getTime() - 3 * dayMs));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !Number.isFinite(Date.parse(`${from}T00:00:00Z`)) || new Date(`${from}T00:00:00Z`).toISOString().slice(0, 10) !== from) return null;
  if (Math.abs(Date.parse(`${from}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) > maxShiftDays * dayMs) return null;
  return { tab: tab as LeagueTab, offset: Number(bao), from };
}
export function leagueHref(slug: LeagueSlug, query: Partial<LeagueQuery> & { tab?: LeagueTab } = {}) {
  const params = new URLSearchParams();
  if (query.tab && query.tab !== "tin-tuc") params.set("tab", query.tab);
  if (query.offset) params.set("bao", String(query.offset));
  if (query.from) params.set("tu", query.from);
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
