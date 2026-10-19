import { z } from "zod";
import { matchLeagues } from "./match-leagues";
import { matchDayKey } from "./match-presentation";

export const uiStatusFilters = { all: "Tất cả", upcoming: "Sắp diễn ra", live: "Đang diễn ra", finished: "Kết thúc" } as const;
export const matchUiFilterSchema = z.object({
  league: z.string().refine((value) => value === "all" || Object.hasOwn(matchLeagues, value)),
  from: z.iso.date(), to: z.iso.date(),
  status: z.enum(["all", "upcoming", "live", "finished"]),
  page: z.coerce.number().int().min(1).max(10000),
}).refine((value) => value.from <= value.to && Date.parse(value.to) - Date.parse(value.from) <= 31 * 86400000);
export type MatchUiFilters = z.infer<typeof matchUiFilterSchema>;
export function defaultUiFilters(now = new Date()): MatchUiFilters {
  return { league: "all", from: matchDayKey(new Date(now.getTime() - 7 * 86400000)), to: matchDayKey(new Date(now.getTime() + 14 * 86400000)), status: "all", page: 1 };
}
export function parseUiFilters(params: Record<string, string | string[] | undefined>, now = new Date()) {
  return matchUiFilterSchema.safeParse({ ...defaultUiFilters(now), ...Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined)) });
}
export function matchListHref(filters: MatchUiFilters, overrides: Partial<MatchUiFilters> = {}) {
  const values = { ...filters, ...overrides };
  return `/matches?${new URLSearchParams({ league: values.league, from: values.from, to: values.to, status: values.status, page: String(values.page) })}`;
}
export const matchSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/);
