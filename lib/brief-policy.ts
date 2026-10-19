import { createHash } from "node:crypto";
import { briefRequestSchema, type BriefRequest, type BriefWindow } from "../types/morning-brief";

export const briefLimits = { SUMMARY: 6, RESULTS: 60, HIGHLIGHTS: 60, TOP_STORIES: 6, CLUB_PLAYER: 6, OFF_FIELD: 3, TRANSFERS: 5, COMMUNITY: 0, UPCOMING: 6, candidates: 200, maxPerClub: 2 } as const;
// Editorial scan priorities, not source reliability or a claim about current league position.
// Compare reviewed canonical slugs only; never create clubs from these names.
export const prominentBriefClubs = new Set(["arsenal", "arsenal-fc", "chelsea", "chelsea-fc", "liverpool", "liverpool-fc", "manchester-city", "manchester-city-fc", "manchester-united", "manchester-united-fc", "tottenham-hotspur", "tottenham-hotspur-fc", "fc-barcelona", "barcelona", "real-madrid", "real-madrid-cf", "club-atletico-de-madrid", "atletico-de-madrid", "athletic-club", "real-betis-balompie"]);
export function prominentBriefClub(slug: string, canonicalName: string) { const key = canonicalName.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); return prominentBriefClubs.has(slug.toLowerCase()) || prominentBriefClubs.has(key); }
export const sectionLabels = { RESULTS: "Kết quả đã ghi nhận", HIGHLIGHTS: "Highlight đã xác minh", TOP_STORIES: "Tin đáng chú ý", CLUB_PLAYER: "Câu lạc bộ và cầu thủ", OFF_FIELD: "Ngoài sân cỏ", TRANSFERS: "Chuyển nhượng", COMMUNITY: "Cộng đồng", UPCOMING: "Trận đấu sắp tới" } as const;
export const databaseSections = { SUMMARY: "MORNING_SUMMARY", RESULTS: "LAST_NIGHT_MATCHES", HIGHLIGHTS: "TOP_MATCH_INSIGHTS", TOP_STORIES: "MORE_NEWS", CLUB_PLAYER: "CLUB_STORIES", OFF_FIELD: "MORE_NEWS", TRANSFERS: "TRANSFER_WATCH", COMMUNITY: "MORE_NEWS", UPCOMING: "COMING_UP" } as const;
export function briefHash(value: unknown): string {
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical) : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, canonical(value)])) : item;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export function briefDate(now: Date, timezone = "Asia/Ho_Chi_Minh") { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export function resolveBriefRequest(input: unknown): BriefRequest { const parsed = briefRequestSchema.parse(input); return { ...parsed, competitions: [...new Set(parsed.competitions)].sort() }; }
export function briefWindow(request: BriefRequest, now: Date): BriefWindow {
  const offset = request.timezone === "UTC" ? 0 : 7;
  const cutoff = request.asOf ?? new Date(Date.parse(`${request.date}T00:00:00Z`) + (request.cutoffHour - offset) * 3600000).toISOString();
  if (briefDate(new Date(cutoff), request.timezone) !== request.date || Date.parse(cutoff) > now.getTime()) throw new Error("INVALID_OR_FUTURE_CUTOFF");
  return { windowStart: new Date(Date.parse(cutoff) - request.lookbackHours * 3600000).toISOString(), windowEnd: cutoff, cutoffAt: cutoff, upcomingEnd: new Date(Date.parse(cutoff) + request.upcomingHours * 3600000).toISOString() };
}
export function briefTime(utc: string, timezone: string) { return new Intl.DateTimeFormat("vi-VN", { timeZone: timezone, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(utc)); }
