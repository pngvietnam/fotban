import { videoTypes, type VideoCandidate, type VideoMapping, type VideoMatch, type VideoSource } from "../types/video-provider";

export function normalizedVideoText(value: string) { return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
/** A first/second-half or single-moment clip ("ĐIỂM NHẤN HIỆP 1"), never the match highlight. A headline that merely mentions a half ("HIỆP 2 BÙNG NỔ") is not one. */
const partialClip = /diem nhan hiep|highlights? hiep (?:1|2|mot|hai)|first half|second half highlights?|half time|\bht\b/;
/**
 * Rights holders in Vietnam often title the match highlight as "HOME - AWAY | headline | COMPETITION"
 * without the word "highlight" (e.g. SCTV: "REAL MADRID - SEVILLA | ... | LALIGA EA SPORTS 26/27").
 */
const matchReportTitle = /^[^|]{3,60}\s[-–]\s[^|]{3,60}\|[^|]+\|[^|]+$/;
export function classifyVideo(title: string): typeof videoTypes[number] {
  const text = normalizedVideoText(title);
  if (partialClip.test(text)) return "OTHER";
  for (const [kind, pattern] of [["WATCH_ALONG", /watch along|watchalong|truc tiep|livestream|live stream/], ["REACTION", /reaction|reacts|phan ung/], ["ANALYSIS", /analysis|phan tich|nhan dinh|preview|du doan/], ["PRESS_CONFERENCE", /press conference|hop bao/], ["INTERVIEW", /interview|phong van/], ["EXTENDED_HIGHLIGHT", /extended highlights?|highlights? mo rong/], ["HIGHLIGHT", /\bhighlights?\b/], ["GOALS", /\bgoals\b|tong hop ban thang/]] as const) if (pattern.test(text)) return kind;
  if (matchReportTitle.test(title.trim())) return "HIGHLIGHT";
  return "OTHER";
}
export function sourceAllowed(source: VideoSource, mapping: VideoMapping, match: VideoMatch, now: Date) {
  const reviewed = Date.parse(source.lastVerifiedAt ?? "");
  return source.platform === "YOUTUBE" && source.enabled && source.verified && Boolean(source.channelId) && Boolean(source.reviewReference) && reviewed <= now.getTime() && now.getTime() - reviewed < 180 * 86400000 && mapping.videoSourceId === source.id && mapping.enabled && mapping.competitionId === match.leagueId && mapping.season === match.season && mapping.market === "VN" && Boolean(mapping.evidenceUrl) && ["AUTHORIZED_LINK", "OFFICIAL_LINK", "REVIEWED_FALLBACK"].includes(mapping.rightsType) && Date.parse(mapping.validFrom) <= Date.parse(match.kickoffAt) && Date.parse(match.kickoffAt) < Date.parse(mapping.validTo) && Date.parse(mapping.validFrom) <= now.getTime() && now.getTime() < Date.parse(mapping.validTo);
}
export function sourceRank(source: VideoSource, mapping: VideoMapping) {
  if (source.country === "VN" && mapping.language === "vi" && source.sourceType === "RIGHTS_HOLDER" && mapping.rightsType === "AUTHORIZED_LINK") return 0;
  if (source.country === "VN" && mapping.language === "vi" && mapping.rightsType === "AUTHORIZED_LINK") return 1;
  return ({ OFFICIAL_LEAGUE: 2, OFFICIAL_CLUB: 3, BROADCASTER: 4, TRUSTED_MEDIA: 4 } as Record<string, number>)[source.sourceType] ?? 5;
}
const leagues: Record<string, RegExp> = { "premier-league": /premier league|ngoai hang anh|\bepl\b/, "la-liga": /la liga|laliga|la liga ea sports/, "champions-league": /champions league|cup c1|c1 chau au|\bucl\b/ };
function mention(title: string, aliases: string[]) { return aliases.some((alias) => { const name = normalizedVideoText(alias); return name.length >= 4 && (` ${title} `).includes(` ${name} `); }); }
/**
 * Day/month dates written in a title ("19/10", "19.10.2026"). A season such as "26/27" (consecutive
 * years) or anything that is not a real day and month is not a date.
 */
export function statedDates(title: string) {
  return [...title.matchAll(/(?<![\d/.])(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}))?(?![\d/.])/g)].flatMap((found) => {
    const day = Number(found[1]); const month = Number(found[2]);
    if (!found[3] && month === (day + 1) % 100) return [];
    if (day < 1 || day > 31 || month < 1 || month > 12) return [];
    return [`${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`];
  });
}
export function validateVideo(video: VideoCandidate, source: VideoSource, mapping: VideoMapping, match: VideoMatch, now: Date) {
  const title = normalizedVideoText(video.title); const kind = classifyVideo(video.title);
  if (!sourceAllowed(source, mapping, match, now) || sourceRank(source, mapping) > 4 || video.channelId !== source.channelId || match.status !== "FINISHED") return { valid: false, reason: "SOURCE_OR_MATCH", kind };
  if (video.availability !== "AVAILABLE" || video.vietnamAvailability === "UNAVAILABLE") return { valid: false, reason: "UNAVAILABLE", kind };
  if (!mention(title, match.home) || !mention(title, match.away)) return { valid: false, reason: "TEAMS", kind };
  // Competition must appear in this video's own title/snippet, not just channel branding.
  const text = `${title} ${normalizedVideoText(video.description ?? "")}`;
  if (!leagues[match.leagueSlug]?.test(text)) return { valid: false, reason: "COMPETITION", kind };
  if (/\bu\s?(?:17|18|19|20|21|23)\b|women|\bnu\b|legends|classic|throwback|retro|friendly|giao huu|fifa\s?\d|efootball|pes\s?\d/.test(title)) return { valid: false, reason: "OTHER_EVENT", kind };
  const published = Date.parse(video.publishedAt); const kickoff = Date.parse(match.kickoffAt);
  if (published < kickoff + 75 * 60000 || published > kickoff + 72 * 3600000 || published > now.getTime()) return { valid: false, reason: "TIME", kind };
  // An explicit historical date/season contradicting this match is never ignored.
  const years = title.match(/\b20\d{2}\b/g) ?? [];
  if (years.some((year) => !match.season.includes(year) && year !== match.kickoffAt.slice(0, 4))) return { valid: false, reason: "DATE", kind };
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" }).format(new Date(kickoff));
  if (statedDates(video.title).some((stated) => stated !== date)) return { valid: false, reason: "DATE", kind };
  return { valid: true, reason: "BOTH_TEAMS_COMPETITION_TIME_REVIEWED_SOURCE", kind };
}
export function primaryVideo<T extends { video: VideoCandidate; source: VideoSource; mapping: VideoMapping }>(items: T[], match: VideoMatch, now: Date) {
  const kinds = ["HIGHLIGHT", "EXTENDED_HIGHLIGHT", "GOALS"];
  return items.filter((item) => validateVideo(item.video, item.source, item.mapping, match, now).valid && kinds.includes(classifyVideo(item.video.title))).sort((a, b) => sourceRank(a.source, a.mapping) - sourceRank(b.source, b.mapping) || kinds.indexOf(classifyVideo(a.video.title)) - kinds.indexOf(classifyVideo(b.video.title)) || a.mapping.priority - b.mapping.priority || a.source.priority - b.source.priority || a.video.externalId.localeCompare(b.video.externalId))[0] ?? null;
}
