import { z } from "zod";
import { hasMention } from "../providers/ai/rules";
import { holdReasons } from "./feed-card-policy";
import { crudeWords, sensitiveEnglish } from "./fan-feeds";

/**
 * One top-level YouTube comment as Fotban keeps it: the comment id, its text, its likes and its time. The API also sends the
 * commenter's name, avatar and channel; the parser never reads them.
 */
export type ApiComment = { id: string; text: string; likeCount: number; publishedAt: string };
export type CommentApiErrorCode = "FORBIDDEN" | "QUOTA" | "DISABLED" | "NOT_FOUND" | "UPSTREAM" | "MALFORMED" | "NETWORK" | "TIMEOUT";

export const maxCommentLength = 500;
const commentId = /^[A-Za-z0-9_-]{6,80}$/;
const videoId = /^[A-Za-z0-9_-]{11}$/;
const iso = (value: string) => { const time = Date.parse(value); return Number.isFinite(time) ? new Date(time).toISOString() : null; };

/** Line breaks and runs of spaces become one space; the text is cut to 500 characters. */
export function cleanCommentText(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > maxCommentLength ? `${clean.slice(0, maxCommentLength - 1).trimEnd()}…` : clean;
}

const thread = z.object({ snippet: z.object({ topLevelComment: z.object({ id: z.string(), snippet: z.object({ textDisplay: z.string().optional(), textOriginal: z.string().optional(), likeCount: z.number().int().nonnegative().optional(), publishedAt: z.string() }) }) }) });
/** A commentThreads.list (part=snippet, textFormat=plainText) answer: items that do not have the expected shape are skipped. */
export function parseCommentThreads(raw: unknown): ApiComment[] | null {
  const page = z.object({ items: z.array(z.unknown()).max(100) }).safeParse(raw);
  if (!page.success) return null;
  const comments: ApiComment[] = [];
  for (const item of page.data.items) {
    const parsed = thread.safeParse(item);
    if (!parsed.success) continue;
    const top = parsed.data.snippet.topLevelComment;
    const text = cleanCommentText(top.snippet.textDisplay ?? top.snippet.textOriginal ?? "");
    const publishedAt = iso(top.snippet.publishedAt);
    if (!commentId.test(top.id) || !text || !publishedAt) continue;
    comments.push({ id: top.id, text, likeCount: top.snippet.likeCount ?? 0, publishedAt });
  }
  return comments;
}

/** A videos.list (part=statistics) answer: each video's public comment count, or null when the video hides it. */
export function parseVideoStatistics(raw: unknown): Map<string, number | null> | null {
  const page = z.object({ items: z.array(z.object({ id: z.string().regex(videoId), statistics: z.object({ commentCount: z.string().regex(/^\d{1,12}$/).optional() }).optional() })).max(50) }).safeParse(raw);
  if (!page.success) return null;
  return new Map(page.data.items.map((item) => [item.id, item.statistics?.commentCount === undefined ? null : Number(item.statistics.commentCount)]));
}

/**
 * What a refused request means. Comments turned off or a removed video concern one video only; a refused key (IP or
 * referrer restriction, invalid, API not enabled) or a spent quota stop the whole run.
 */
export function commentApiErrorCode(status: number, body: string): CommentApiErrorCode {
  if (/commentsDisabled/.test(body)) return "DISABLED";
  if (status === 404 || /videoNotFound/.test(body)) return "NOT_FOUND";
  if (status === 429 || /quotaExceeded|dailyLimitExceeded|rateLimitExceeded/.test(body)) return "QUOTA";
  if (status === 401 || status === 403 || /API_KEY_INVALID|keyInvalid|API_KEY_IP_ADDRESS_BLOCKED|ipRefererBlocked|accessNotConfigured|SERVICE_DISABLED/.test(body)) return "FORBIDDEN";
  if (status >= 500 || status === 408) return "UPSTREAM";
  return "MALFORMED";
}

const letters = /\p{L}/gu;
const link = /https?:\/\/|www\.|(?<![\p{L}\p{N}])[a-z0-9-]{2,}\.(?:com|net|vn|io|me|ly|gg|xyz|top|info|org|link|site|club|bet|tv|app)(?![\p{L}\p{N}])/iu;
// Betting, self-promotion and money offers: the spam that fills football comment sections (and gambling ads are illegal in Vietnam).
const spam = /nhà cái|cá cược|cá độ|soi kèo|tỷ lệ kèo|tỉ lệ kèo|kèo nhà|kèo thơm|link xem|zalo|telegram|đăng ký kênh|đăng kí kênh|sub kênh|kiếm tiền|nạp tiền|khuyến mãi|casino|xổ số|lô đề|vay tiền|(?<![\p{L}\p{N}])(?:bet|vay|inbox|ib)(?![\p{L}\p{N}])/iu;
// The shared list matches ASCII word edges only; these Vietnamese insults and their chat spellings need Unicode edges.
const crudeVietnamese = /(?<![\p{L}\p{N}])(?:đm|đmm|đcm|dcm|dkm|đkm|clgt|vkl|vcc|vcl|cmm|cmnr|đéo|deo me|địt|đjt|djt|đụ|cặc|lồn|buồi|óc chó|óc lợn|chó má|súc vật|ngu|ngu như)(?![\p{L}\p{N}])/iu;
// Vietnamese letters, or at least two common words typed without accents: a comment the Vietnamese reader can read.
const vietnameseLetters = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹáàãéèíìóòõúùýĂÂĐÊÔƠƯ]/u;
const plainVietnamese = /(?<![a-z])(khong|ko|qua|cua|doi|thi|nay|hay|danh|duoc|dc|roi|minh|tran|bong|vay|nhu|cung|nhung|lam|that|choi|thang|thua|hoa|qua|ghe|dinh|cau thu|ban thang|trong tai)(?![a-z])/gi;

export type CommentRejection = "SHORT" | "NOISE" | "LINK" | "SPAM" | "CRUDE" | "HEAVY" | "LANGUAGE";
/**
 * Why a comment is left out, or null when it may be counted and quoted: too short, emoji or symbols only, a link, betting
 * or self-promotion, crude language, a heavy topic (death, crime, abuse, discrimination, self-harm), or not Vietnamese.
 */
export function commentRejection(text: string): CommentRejection | null {
  const clean = cleanCommentText(text);
  if (clean.length < 8) return "SHORT";
  if ((clean.match(letters)?.length ?? 0) < 4) return "NOISE";
  if (link.test(clean)) return "LINK";
  if (spam.test(clean)) return "SPAM";
  if (crudeWords.test(clean) || crudeVietnamese.test(clean)) return "CRUDE";
  if (sensitiveEnglish.test(clean) || holdReasons(clean).length) return "HEAVY";
  if (!vietnameseLetters.test(clean) && new Set((clean.match(plainVietnamese) ?? []).map((word) => word.toLowerCase())).size < 2) return "LANGUAGE";
  return null;
}

/** Accents removed and đ written d, lower case: comments are often typed without accents ("trong tai", "thu mon"). */
export const foldVietnamese = (text: string) => text.normalize("NFD").replace(/\p{M}+/gu, "").replace(/[đĐ]/g, "d").toLowerCase();
const anyWord = (words: string[]) => new RegExp(`(?<![a-z0-9])(?:${words.map((word) => word.replace(/ /g, "\\s+")).join("|")})(?![a-z0-9])`);
/** What fans argue about, by plain keywords (matched on the folded text). Each comment counts once per topic. */
export const fanTopics = [
  { key: "referee", label: "Trọng tài & VAR", pattern: anyWord(["trong tai", "var", "penalty", "penalti", "phat den", "pen", "the do", "viet vi", "offside"]) },
  { key: "coach", label: "HLV & chiến thuật", pattern: anyWord(["hlv", "huan luyen vien", "ban huan luyen", "chien thuat", "doi hinh", "thay nguoi", "so do"]) },
  { key: "keeper", label: "Thủ môn", pattern: anyWord(["thu mon", "gk", "thu thanh", "cuu thua", "bat bong"]) },
  { key: "defence", label: "Hàng thủ", pattern: anyWord(["hang thu", "hang phong ngu", "hau ve", "trung ve", "phong ngu"]) },
  { key: "attack", label: "Tiền đạo & dứt điểm", pattern: anyWord(["tien dao", "hang cong", "dut diem", "bo lo", "phung phi", "sut"]) },
] as const;
export const commentTopics = (text: string) => { const folded = foldVietnamese(text); return fanTopics.filter((topic) => topic.pattern.test(folded)).map((topic) => topic.key); };

/** A stored comment as the summaries read it. `videoId` is the YouTube video id. */
export type StoredComment = { id: string; text: string; likeCount: number; publishedAt: string; videoId: string; matchId: string; clubIds: string[]; playerIds: string[] };
export type PulseChip = { kind: "player" | "club" | "coach" | "topic"; key: string; label: string; count: number };
export type PulseQuote = { id: string; text: string; likeCount: number; publishedAt: string; url: string; matchId: string };
/** A coach the comments may name: the full name and the surname. */
export type CoachName = { name: string; aliases: string[] };
export const coachName = (name: string): CoachName => { const surname = name.trim().split(/\s+/).at(-1) ?? ""; return { name, aliases: surname.length >= 4 && surname !== name ? [name, surname] : [name] }; };

export const commentUrl = (video: string, comment: string) => `https://www.youtube.com/watch?v=${encodeURIComponent(video)}&lc=${encodeURIComponent(comment)}`;
export const videoUrl = (video: string) => `https://www.youtube.com/watch?v=${encodeURIComponent(video)}`;

/**
 * Counts, from the stored comments alone, how many name each player, club and coach and how many touch each topic (one
 * count per comment), and picks the most-liked comments to quote word for word. Only what at least two comments say is
 * a chip; `exclude` leaves out the clubs the summary is already about.
 */
export function summarizeComments(comments: StoredComment[], options: { names: Map<string, { name: string; kind: "club" | "player" }>; coaches: CoachName[]; exclude?: Set<string>; chips?: number; quotes?: number }) {
  const counts = new Map<string, PulseChip>();
  const add = (chip: Omit<PulseChip, "count">) => { const found = counts.get(`${chip.kind}:${chip.key}`); if (found) found.count++; else counts.set(`${chip.kind}:${chip.key}`, { ...chip, count: 1 }); };
  for (const comment of comments) {
    for (const id of new Set([...comment.playerIds, ...comment.clubIds])) {
      const entity = options.names.get(id);
      if (entity && !options.exclude?.has(id)) add({ kind: entity.kind, key: id, label: entity.name });
    }
    for (const coach of options.coaches) if (coach.aliases.some((alias) => hasMention(comment.text, alias))) add({ kind: "coach", key: coach.name, label: coach.name });
    for (const key of commentTopics(comment.text)) add({ kind: "topic", key, label: fanTopics.find((topic) => topic.key === key)!.label });
  }
  const chips = [...counts.values()].filter((chip) => chip.count >= 2).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "vi")).slice(0, options.chips ?? 6);
  const seen = new Set<string>();
  const quotes = [...comments].sort((a, b) => b.likeCount - a.likeCount || b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id))
    .filter((comment) => { const key = foldVietnamese(comment.text); if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, options.quotes ?? 3)
    .map((comment): PulseQuote => ({ id: comment.id, text: comment.text, likeCount: comment.likeCount, publishedAt: comment.publishedAt, url: commentUrl(comment.videoId, comment.id), matchId: comment.matchId }));
  return { chips, quotes };
}
