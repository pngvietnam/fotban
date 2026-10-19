export const playerTabs = ["tong-quan", "tin-tuc", "chuyen-nhuong"] as const;
export type PlayerTab = typeof playerTabs[number];
export const playerTabLabels: Record<PlayerTab, string> = { "tong-quan": "Tổng quan", "tin-tuc": "Tin tức", "chuyen-nhuong": "Chuyển nhượng" };
export type PlayerQuery = { tab: PlayerTab; offset: number };
/** Strict parsing: an unknown tab or a malformed offset invalidates the whole query. */
export function parsePlayerQuery(params: Record<string, string | string[] | undefined>): PlayerQuery | null {
  const tab = params.tab ?? "tong-quan"; const bao = params.bao ?? "0";
  if (typeof tab !== "string" || !(playerTabs as readonly string[]).includes(tab) || typeof bao !== "string" || !/^\d{1,4}$/.test(bao)) return null;
  return { tab: tab as PlayerTab, offset: Number(bao) };
}
export function playerHref(slug: string, query: Partial<PlayerQuery> = {}) {
  const params = new URLSearchParams();
  if (query.tab && query.tab !== "tong-quan") params.set("tab", query.tab);
  if (query.offset) params.set("bao", String(query.offset));
  return `/player/${slug}${params.size ? `?${params}` : ""}`;
}
/** Player slugs are player-<id>, so any place that knows a player ID can link to the page. */
export const playerPath = (playerId: string) => `/player/player-${playerId}`;
/** Completed years on the given date; null for a missing or impossible birth date. */
export function ageOn(birthDate: string | null, now: Date) {
  const born = birthDate ? new Date(`${birthDate}T00:00:00Z`) : null;
  if (!born || !Number.isFinite(born.getTime()) || born > now) return null;
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  if (now.getUTCMonth() < born.getUTCMonth() || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate())) age--;
  return age >= 0 && age < 70 ? age : null;
}
