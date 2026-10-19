import type { Metadata } from "next";
import type { BriefContentItem } from "../types/morning-brief";
import type { HomeItem } from "../types/morning-homepage";

export const homepageZone = "Asia/Ho_Chi_Minh";
export const homeSectionLabels = { RESULTS: "Kết quả đêm qua", TOP_STORIES: "Tin đáng chú ý", HIGHLIGHTS: "Highlight đã xác minh", CLUB_PLAYER: "Tiêu điểm câu lạc bộ & cầu thủ", TRANSFERS: "Theo dõi chuyển nhượng", OFF_FIELD: "Ngoài sân cỏ", COMMUNITY: "Fan đang nói gì?", UPCOMING: "Trận đấu sắp tới" } as const;
export const homeReliabilityLabels = { OFFICIAL: "Chính thức / Đã xác nhận", RELIABLE: "Báo chí uy tín", SOCIAL: "Cộng đồng / Mạng xã hội", RUMOR: "Tin đồn", DISPUTED: "Có thông tin trái chiều" } as const;
export const homeVideoLabels: Record<string, string> = { HIGHLIGHT: "Highlight", EXTENDED_HIGHLIGHT: "Highlight mở rộng", GOALS: "Các bàn thắng" };
export function developmentPreview(requested: unknown, environment: string | undefined) { return environment === "development" && requested === "1"; }
export function homeDate(value: string) { return new Intl.DateTimeFormat("vi-VN", { timeZone: homepageZone, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T05:00:00Z`)); }
export function homeTime(value: string, includeDate = false) { return new Intl.DateTimeFormat("vi-VN", { timeZone: homepageZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(includeDate ? { day: "2-digit", month: "2-digit", year: "numeric" } : {}) }).format(new Date(value)); }
export function homeInitials(name: string) { return name.trim().split(/\s+/).slice(0, 3).map((word) => Array.from(word)[0]).join("").toLocaleUpperCase("vi-VN"); }
export function homeItemIdentity(item: BriefContentItem) { return item.transferId ? `transfer:${item.transferId}` : item.clusterId ? `story:${item.clusterId}` : item.match ? `match:${item.match.id}` : item.key; }
export function homeSources(item: HomeItem) { return [...new Set(item.item.citations.map((citation) => citation.sourceName))]; }
export function homepageMetadata(origin: string, preview: boolean): Metadata {
  const title = "Bản tin sáng bóng đá | Football Morning Brief";
  const description = "Kết quả Premier League và La Liga, highlight đã xác minh, tin đáng chú ý và chuyển nhượng. Gọn mỗi sáng, rõ nguồn và mức độ xác nhận.";
  const url = new URL("/", origin).href;
  return { title, description, alternates: { canonical: url }, robots: { index: !preview, follow: !preview }, openGraph: { title, description, type: "website", locale: "vi_VN", siteName: "Football Morning Brief", url } };
}
