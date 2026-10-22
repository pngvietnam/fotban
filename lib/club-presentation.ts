import { clubTabs, type ClubTab } from "../types/club-hub";

export const clubTabLabels: Record<ClubTab, string> = { "tong-quan": "Tổng quan", "bang-xep-hang": "BXH", "lich-thi-dau": "Lịch thi đấu", "cau-thu": "Đội hình", "tin-tuc": "Tin tức", "chuyen-nhuong": "Chuyển nhượng", "lich-su": "Lịch sử", vui: "Vui" };
export type ClubQuery = { tab: ClubTab; offset: number; /** Competition shown in the overview table (a league slug); only valid for clubs that play in it. */ giai?: string };
/** Strict parsing: an unknown tab or a malformed offset invalidates the whole query. */
export function parseClubQuery(params: Record<string, string | string[] | undefined>): ClubQuery | null {
  const tab = params.tab ?? "tong-quan"; const bao = params.bao ?? "0";
  if (typeof tab !== "string" || !(clubTabs as readonly string[]).includes(tab) || typeof bao !== "string" || !/^\d{1,4}$/.test(bao)) return null;
  const giai = params.giai;
  if (giai !== undefined && (typeof giai !== "string" || !/^[a-z0-9-]{1,40}$/.test(giai))) return null;
  return { tab: tab as ClubTab, offset: Number(bao), ...(giai ? { giai } : {}) };
}
export function clubHref(slug: string, query: Partial<ClubQuery> = {}) {
  const params = new URLSearchParams();
  if (query.tab && query.tab !== "tong-quan") params.set("tab", query.tab);
  if (query.offset) params.set("bao", String(query.offset));
  if (query.giai) params.set("giai", query.giai);
  return `/club/${slug}${params.size ? `?${params}` : ""}`;
}
export const funNotice = "Bài nhẹ nhàng do chính các báo đăng. Chỉ để giải trí, không phải tin đã xác nhận.";
/** Club slugs are club-<id>, so any place that knows a club ID can link to its page. */
export const clubPath = (clubId: string) => `/club/club-${clubId}`;
