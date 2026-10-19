import { videoTypes, type VideoCandidate, type VideoMapping, type VideoMatch, type VideoSource } from "../types/video-provider";

export function normalizedVideoText(value: string) { return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
export function classifyVideo(title: string): typeof videoTypes[number] {
  const text = normalizedVideoText(title);
  for (const [kind, pattern] of [["WATCH_ALONG", /watch along|watchalong|truc tiep|livestream|live stream/], ["REACTION", /reaction|reacts|phan ung/], ["ANALYSIS", /analysis|phan tich|nhan dinh|preview|du doan/], ["PRESS_CONFERENCE", /press conference|hop bao/], ["INTERVIEW", /interview|phong van/], ["EXTENDED_HIGHLIGHT", /extended highlights?|highlights? mo rong/], ["HIGHLIGHT", /\bhighlights?\b/], ["GOALS", /\bgoals\b|tong hop ban thang/]] as const) if (pattern.test(text)) return kind;
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
const leagues: Record<string, RegExp> = { "premier-league": /premier league|ngoai hang anh|\bepl\b/, "la-liga": /la liga|laliga|la liga ea sports/ };
function mention(title: string, aliases: string[]) { return aliases.some((alias) => { const name = normalizedVideoText(alias); return name.length >= 4 && (` ${title} `).includes(` ${name} `); }); }
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
  const stated = video.title.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.]\d{4})?\b/);
  if (stated && `${stated[1].padStart(2, "0")}/${stated[2].padStart(2, "0")}` !== date) return { valid: false, reason: "DATE", kind };
  return { valid: true, reason: "BOTH_TEAMS_COMPETITION_TIME_REVIEWED_SOURCE", kind };
}
export function primaryVideo<T extends { video: VideoCandidate; source: VideoSource; mapping: VideoMapping }>(items: T[], match: VideoMatch, now: Date) {
  const kinds = ["HIGHLIGHT", "EXTENDED_HIGHLIGHT", "GOALS"];
  return items.filter((item) => validateVideo(item.video, item.source, item.mapping, match, now).valid && kinds.includes(classifyVideo(item.video.title))).sort((a, b) => sourceRank(a.source, a.mapping) - sourceRank(b.source, b.mapping) || kinds.indexOf(classifyVideo(a.video.title)) - kinds.indexOf(classifyVideo(b.video.title)) || a.mapping.priority - b.mapping.priority || a.source.priority - b.source.priority || a.video.externalId.localeCompare(b.video.externalId))[0] ?? null;
}
