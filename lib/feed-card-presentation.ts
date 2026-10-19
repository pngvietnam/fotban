import type { Metadata } from "next";
import type { FeedCardView } from "../types/feed-card";

export const feedLabelText = { MEDIA: "Báo chí", COMMUNITY: "Cộng đồng" } as const;
export const feedCertaintyText = { REPORTED: "Đang đưa tin", UNCONFIRMED: "Chưa xác nhận" } as const;
// A wording-derived stage is never "Đã xác nhận"; a reported completed deal reads "Chưa xác nhận".
export const feedTransferText = { INTEREST: "Đang quan tâm", NEGOTIATION: "Đang đàm phán", RUMOR: "Chưa xác nhận" } as const;
export const feedNotice = "Tiêu đề và mô tả do báo đăng. FotBan chưa xác minh độc lập.";
export const officialWordingNotice = "Chữ “chính thức” trong tiêu đề là cách báo đặt tít; FotBan chưa đối chiếu với thông báo chính thức.";

export const feedSlug = (articleId: string) => `bao-${articleId}`;
export function feedArticleIdFromSlug(slug: string) {
  return /^bao-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(slug)?.[1] ?? null;
}
export function parseFeedOffset(value: string | string[] | undefined) {
  if (value === undefined) return 0;
  return typeof value === "string" && /^\d{1,4}$/.test(value) ? Number(value) : null;
}
/** Card pages reproduce publisher text, so they are never indexed; the original stays canonical. */
export function feedMetadata(card: FeedCardView | null): Metadata {
  if (!card) return { title: "Tin chưa khả dụng | Football Morning Brief", robots: { index: false, follow: false } };
  return { title: `${card.title} | Football Morning Brief`, robots: { index: false, follow: true }, ...(card.url ? { alternates: { canonical: card.url } } : {}) };
}
