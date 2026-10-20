import type { Metadata } from "next";
import type { TransferFilters, TransferView } from "../types/transfers";

export const statusLabels = { CONFIRMED: "Đã xác nhận", NEGOTIATION: "Đang đàm phán", INTEREST: "Đang quan tâm", RUMOR: "Tin đồn" };
export const dealLabels: Record<string, string> = { PERMANENT: "Chuyển nhượng chính thức", LOAN: "Cho mượn", FREE_TRANSFER: "Chuyển nhượng tự do", CONTRACT_EXTENSION: "Gia hạn hợp đồng", RELEASE: "Thanh lý hợp đồng", UNKNOWN: "Chưa rõ hình thức" };
export const statusRank = { CONFIRMED: 4, NEGOTIATION: 3, INTEREST: 2, RUMOR: 1 };
export const transferSlug = (id: string) => `giao-dich-${id}`;
export function transferIdFromSlug(slug: string) { return /^giao-dich-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(slug)?.[1] ?? null; }
export function parseTransferFilters(params: Record<string, string | string[] | undefined>): TransferFilters | null {
  const league = params.league ?? "all"; const status = params.status ?? "all"; const page = params.page ?? "1";
  if (typeof league !== "string" || !["all", "premier-league", "la-liga", "champions-league"].includes(league) || typeof status !== "string" || !["all", ...Object.keys(statusLabels)].includes(status) || typeof page !== "string" || !/^[1-9]\d?$/.test(page)) return null;
  return { league: league as TransferFilters["league"], status: status as TransferFilters["status"], page: Number(page) };
}
export function transferHref(filters: TransferFilters) {
  const params = new URLSearchParams(); if (filters.league !== "all") params.set("league", filters.league); if (filters.status !== "all") params.set("status", filters.status); if (filters.page > 1) params.set("page", String(filters.page));
  return `/transfers${params.size ? `?${params}` : ""}`;
}
export function transferMetadata(view: TransferView | null, origin: string): Metadata {
  if (!view?.slug) return { title: "Chuyển nhượng chưa khả dụng | Fotban", robots: { index: false, follow: false } };
  const url = new URL(`/transfers/${view.slug}`, origin).href;
  return { title: `${view.story.titleVi} | Fotban`, description: view.story.summaryVi, alternates: { canonical: url }, robots: { index: true, follow: true }, openGraph: { type: "article", locale: "vi_VN", url, title: view.story.titleVi, description: view.story.summaryVi } };
}
