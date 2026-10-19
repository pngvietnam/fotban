export const matchTabs = [
  { key: "du-kien", label: "Dữ kiện" }, { key: "su-kien", label: "Sự kiện" }, { key: "doi-hinh", label: "Đội hình" },
  { key: "bxh", label: "BXH" }, { key: "thong-ke", label: "Thống kê" }, { key: "doi-dau", label: "Đối đầu" },
] as const;
export type MatchTab = typeof matchTabs[number]["key"];
/** Missing means the default tab; an unknown value is invalid (null). */
export function parseMatchTab(value: string | string[] | undefined): MatchTab | null {
  if (value === undefined) return "du-kien";
  return typeof value === "string" && matchTabs.some((tab) => tab.key === value) ? value as MatchTab : null;
}
export const matchTabHref = (slug: string, tab: MatchTab) => `/match/${encodeURIComponent(slug)}${tab === "du-kien" ? "" : `?tab=${tab}`}`;
