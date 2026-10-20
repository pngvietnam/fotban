import type { Metadata } from "next";
import type { NewsFilters, NewsStory } from "../types/news-ui";

export const newsTimeZone = "Asia/Ho_Chi_Minh";
export const storyLabels: Record<string, string> = {
  MATCH: "Trận đấu", PLAYER: "Cầu thủ", CLUB: "Câu lạc bộ", TRANSFER: "Chuyển nhượng",
  INJURY: "Chấn thương", MANAGER: "Huấn luyện viên", TACTICAL: "Chiến thuật", CONTRACT: "Hợp đồng",
  FINANCIAL: "Tài chính", OFF_FIELD: "Ngoài sân cỏ", INTERVIEW: "Phỏng vấn", DISCIPLINE: "Kỷ luật",
  COMMUNITY: "Cộng đồng", SOCIAL: "Cộng đồng", FUN: "Vui", OTHER: "Bóng đá",
};
export const transferLabels = { CONFIRMED: "Đã xác nhận", NEGOTIATION: "Đang đàm phán", INTEREST: "Đang quan tâm", RUMOR: "Tin đồn" };
export const tierLabels: Record<string, string> = { TIER_0_OFFICIAL: "Nguồn chính thức", TIER_1_HIGH: "Nguồn uy tín cao", TIER_2_ESTABLISHED: "Báo chí đã được thẩm định", TIER_3_UNVERIFIED: "Nguồn chưa thẩm định", COMMUNITY: "Nguồn cộng đồng" };
export const languageLabels: Record<string, string> = { en: "Tiếng Anh", es: "Tiếng Tây Ban Nha", vi: "Tiếng Việt" };

export function parseNewsFilters(params: Record<string, string | string[] | undefined>): NewsFilters | null {
  const league = params.league ?? "all"; const offset = params.after ?? "0";
  if (!["all", "premier-league", "la-liga", "champions-league"].includes(league as string) || typeof league !== "string" || typeof offset !== "string" || !/^\d{1,6}$/.test(offset) || Number(offset) > 100000) return null;
  return { league: league as NewsFilters["league"], offset: Number(offset) };
}
export function newsHref(filters: NewsFilters) {
  const query = new URLSearchParams();
  if (filters.league !== "all") query.set("league", filters.league);
  if (filters.offset) query.set("after", String(filters.offset));
  return `/news${query.size ? `?${query}` : ""}`;
}
export function newsSlug(id: string) { return `tin-${id}`; }
export function clusterIdFromSlug(slug: string) {
  return /^tin-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(slug)?.[1] ?? null;
}
export function safeNewsUrl(value: string | null | undefined) {
  try { const url = new URL(value ?? ""); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function newsAbsoluteTime(value: string | null, dateOnly = false) {
  const date = new Date(value ?? "");
  if (!Number.isFinite(date.getTime())) return "Chưa rõ thời điểm";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: newsTimeZone, day: "2-digit", month: "2-digit", year: "numeric", ...(dateOnly ? {} : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const }) }).format(date);
}
export function newsRelativeTime(value: string, now: Date, dateOnly = false) {
  if (dateOnly) return newsAbsoluteTime(value, true);
  const delta = now.getTime() - Date.parse(value);
  if (!Number.isFinite(delta) || delta < 0) return newsAbsoluteTime(value);
  if (delta < 60000) return "Vừa cập nhật";
  if (delta < 3600000) return `${Math.floor(delta / 60000)} phút trước`;
  if (delta < 86400000) return `${Math.floor(delta / 3600000)} giờ trước`;
  const day = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: newsTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  if (day(new Date(value)) === day(new Date(now.getTime() - 86400000))) return `Hôm qua, ${new Intl.DateTimeFormat("vi-VN", { timeZone: newsTimeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value))}`;
  return newsAbsoluteTime(value);
}
export function newsMetadata(story: NewsStory | null, appUrl: string): Metadata {
  if (!story?.titleVi?.trim() || !story.summaryVi?.trim()) return { title: "Tin chưa khả dụng | Fotban", robots: { index: false, follow: false } };
  const url = new URL(`/news/${story.slug}`, appUrl).href;
  return {
    title: `${story.titleVi} | Fotban`, description: story.summaryVi,
    alternates: { canonical: url }, robots: { index: true, follow: true },
    openGraph: { type: "article", locale: "vi_VN", siteName: "Fotban", url, title: story.titleVi, description: story.summaryVi, publishedTime: story.publishedAt, modifiedTime: story.updatedAt },
  };
}
