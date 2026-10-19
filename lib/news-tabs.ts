import type { NewsFilters } from "../types/news-ui";

export const newsTabs = [
  { key: "danh-cho-ban", label: "Dành cho bạn" }, { key: "moi-nhat", label: "Mới nhất" },
  { key: "chuyen-nhuong", label: "Chuyển nhượng" }, { key: "giai-dau", label: "Giải đấu" },
] as const;
export type NewsTab = typeof newsTabs[number]["key"];
/** Missing means the default tab; an unknown value is invalid (null). */
export function parseNewsTab(value: string | string[] | undefined): NewsTab | null {
  if (value === undefined) return "danh-cho-ban";
  return typeof value === "string" && newsTabs.some((tab) => tab.key === value) ? value as NewsTab : null;
}
export function newsTabHref(tab: NewsTab, options: { league?: NewsFilters["league"]; offset?: number } = {}) {
  const query = new URLSearchParams();
  if (tab !== "danh-cho-ban") query.set("tab", tab);
  if (tab === "giai-dau" && options.league && options.league !== "all") query.set("league", options.league);
  if (options.offset) query.set("bao", String(options.offset));
  return `/news${query.size ? `?${query}` : ""}`;
}
