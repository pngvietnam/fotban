import { parseFeedOffset } from "./feed-card-presentation";
import { parseNewsFilters } from "./news-presentation";
import type { NewsFilters } from "../types/news-ui";

/** The three ways to read the feed (prototype v2). */
export const newsTabs = [
  { key: "danh-cho-ban", label: "Dành cho bạn" }, { key: "moi-nhat", label: "Mới nhất" }, { key: "soi-noi", label: "Sôi nổi" },
] as const;
export type NewsTab = typeof newsTabs[number]["key"];
/** "Loại tin": the story types the feed classifies, grouped the way readers look for them. */
export const newsKinds = [
  { key: "tat-ca", label: "Tất cả", types: null },
  { key: "tran-dau", label: "Trận đấu", types: ["MATCH"] },
  { key: "chuyen-nhuong", label: "Chuyển nhượng", types: ["TRANSFER", "CONTRACT"] },
  { key: "phan-tich", label: "Phân tích", types: ["TACTICAL", "INTERVIEW"] },
  { key: "hlv", label: "Huấn luyện viên", types: ["MANAGER"] },
  { key: "chan-thuong", label: "Chấn thương & kỷ luật", types: ["INJURY", "DISCIPLINE"] },
  { key: "ngoai-le", label: "Ngoài lề", types: ["OFF_FIELD"] },
  { key: "fan-noi-gi", label: "Fan nói gì", types: ["SOCIAL", "COMMUNITY"] },
] as const;
export type NewsKind = typeof newsKinds[number]["key"];
/** The badge on a post: the reader-facing kind of its story type. */
export const kindOfStoryType = (storyType: string) => newsKinds.find((kind) => (kind.types as readonly string[] | null)?.includes(storyType)) ?? null;

export type NewsView = { tab: NewsTab; kind: NewsKind; league: NewsFilters["league"]; offset: number };
const pick = <T extends string>(value: string | string[] | undefined, allowed: readonly { key: T }[], fallback: T): T | null =>
  value === undefined ? fallback : typeof value === "string" && allowed.some((item) => item.key === value) ? value as T : null;

/**
 * Reads ?tab=, ?loai=, ?league= and ?bao=; unknown or repeated values are invalid (null).
 * Older links keep working: tab=chuyen-nhuong is the transfer kind, tab=giai-dau the league filter.
 */
export function parseNewsView(params: Record<string, string | string[] | undefined>): NewsView | null {
  const legacy = params.tab === "chuyen-nhuong" ? { tab: "moi-nhat", loai: params.loai ?? "chuyen-nhuong" } : params.tab === "giai-dau" ? { tab: undefined, loai: params.loai } : { tab: params.tab, loai: params.loai };
  const tab = pick(legacy.tab, newsTabs, "danh-cho-ban"); const kind = pick(legacy.loai, newsKinds, "tat-ca");
  const league = parseNewsFilters({ league: params.league }); const offset = parseFeedOffset(params.bao);
  return tab && kind && league && offset !== null ? { tab, kind, league: league.league, offset } : null;
}
/** Canonical link: defaults are left out; changing a filter starts again from the first page. */
export function newsViewHref(view: NewsView, overrides: Partial<NewsView> = {}) {
  const values = { ...view, offset: 0, ...overrides };
  const query = new URLSearchParams();
  if (values.tab !== "danh-cho-ban") query.set("tab", values.tab);
  if (values.kind !== "tat-ca") query.set("loai", values.kind);
  if (values.league !== "all") query.set("league", values.league);
  if (values.offset) query.set("bao", String(values.offset));
  return `/news${query.size ? `?${query}` : ""}`;
}
