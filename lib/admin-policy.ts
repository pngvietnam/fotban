import { z } from "zod";
import { storyTypes } from "../providers/ai/schema";
import { feedScopeSchema } from "./publisher-feed-permission";

export const adminSections = ["sources", "videos", "stories", "transfers", "briefs", "jobs"] as const;
export type AdminSection = typeof adminSections[number];
export const adminErrorCodes = ["TIMEOUT","NETWORK","UPSTREAM","RATE_LIMITED","CONFIGURATION","PERMISSION_DENIED","UNAUTHORIZED","DATABASE","JOB_FAILED","NOT_READY","LOCK_LOST","WORKFLOW_RUNNING","STORED_DATA_ONLY","HISTORICAL_STORED_DATA","OPERATION_FAILED"];
export class AdminError extends Error {
  constructor(public code: "FORBIDDEN" | "INVALID_INPUT" | "NOT_FOUND" | "PERMISSION_BLOCKED" | "EVIDENCE_REQUIRED" | "CONFLICT" | "UNAVAILABLE", public status = 400) { super(code); }
}
export const adminMessages = { FORBIDDEN: "Bạn không có quyền truy cập khu vực quản trị.", INVALID_INPUT: "Thông tin chưa hợp lệ. Hãy kiểm tra biểu mẫu.", NOT_FOUND: "Không tìm thấy bản ghi.", PERMISSION_BLOCKED: "Quyền sử dụng chưa đủ. Không thể bật nguồn hoặc xuất bản.", EVIDENCE_REQUIRED: "Chưa đủ bằng chứng hoặc nội dung chưa vượt qua kiểm tra xuất bản.", CONFLICT: "Dữ liệu đã thay đổi hoặc thao tác không phù hợp trạng thái hiện tại. Hãy tải lại.", UNAVAILABLE: "Tác vụ chưa hoàn tất. Hãy kiểm tra nhật ký và thử lại." };
const secretPattern = /postgres(?:ql)?:\/\/|https?:\/\/[^\s/]+:[^\s/]+@|AIza[\w-]{20,}|sk-[\w-]{20,}|(?:access_token|refresh_token|client_secret|api_key|auth_secret|auth_google_secret|database_url|authorization)\s*[:=]|[?&](?:key|token|secret)=/iu;
export const adminText = (max = 1500) => z.string().trim().max(max).refine((v) => !secretPattern.test(v) && !/[<>\u0000-\u0008]/u.test(v));
export function safeAdminText(value: unknown) { const text = typeof value === "string" ? value : ""; return secretPattern.test(text) ? "[Nội dung nhạy cảm đã ẩn]" : text; }
export const adminUrl = z.url().refine((value) => { const url = new URL(value); return !secretPattern.test(value) && url.protocol === "https:" && !url.username && !url.password && !/[?&](?:key|token|secret|api_key|access_token)=/i.test(value); });
const nullableText = adminText(1500).nullable();
const entityScope = z.string().refine(v=>v.split(":").length===2&&/^(club|player|league):/.test(v)&&z.uuid().safeParse(v.split(":")[1]).success);
export const sourceEditSchema = z.object({
  name: adminText(200).min(1), domain: z.string().toLowerCase().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/),
  type: z.enum(["OFFICIAL", "NEWS_API", "RSS", "PUBLICATION", "SOCIAL"]), language: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/).nullable(), country: z.string().regex(/^[A-Z]{2}$/).nullable(),
  official: z.boolean(), sourceTier: z.enum(["TIER_0_OFFICIAL", "TIER_1_HIGH", "TIER_2_ESTABLISHED", "TIER_3_UNVERIFIED", "COMMUNITY"]), reliabilityScore: z.number().int().min(0).max(100), rationale: nullableText,
  enabled: z.boolean(), termsReviewed: z.boolean(), ingestionAllowed: z.boolean(), permissionStatus: z.enum(["UNREVIEWED", "ALLOWED", "RESTRICTED"]),
  accessPolicy: adminText(2000).min(5), permissionReference: adminUrl.nullable(), commercialReuseAllowed: z.boolean(), requiresReusableLicense: z.boolean(),
  maxExcerptChars: z.number().int().min(0).max(1000), ingestionMethod: z.enum(["MANUAL", "ATOM", "HTML_INDEX", "OFFICIAL_PAGE", "RSS", "API"]), authorityScopes: z.array(entityScope).max(40),
  permissionScope: feedScopeSchema.optional(), feedUrl: adminUrl.nullable().optional(), attributionRequirement: adminText(4000).nullable().optional(), newsPriority: z.number().int().min(0).max(1000).optional(), ingestionNotes: adminText(2000).nullable().optional(),
}).strict();
export const videoEditSchema = z.object({ name: adminText(200).min(1), channelId: z.string().regex(/^UC[A-Za-z0-9_-]{22}$/).nullable(), channelHandle: z.string().regex(/^@[\p{L}\p{N}_.-]{3,100}$/u), country: z.string().regex(/^[A-Z]{2}$/), language: z.string().regex(/^[a-z]{2}$/), verified: z.boolean(), enabled: z.boolean(), sourceType: z.enum(["RIGHTS_HOLDER", "OFFICIAL_LEAGUE", "OFFICIAL_CLUB", "BROADCASTER", "TRUSTED_MEDIA"]), priority: z.number().int().min(0).max(1000), lastVerifiedAt: z.iso.datetime().nullable(), notes: nullableText, reviewReference: adminUrl }).strict();
export const mappingEditSchema = z.object({ videoSourceId: z.uuid(), competitionId: z.uuid(), season: z.string().regex(/^20\d{2}\/20\d{2}$/).refine((v) => Number(v.slice(5)) === Number(v.slice(0,4)) + 1), market: z.literal("VN"), language: z.string().regex(/^[a-z]{2}$/), rightsType: z.enum(["AUTHORIZED_LINK", "OFFICIAL_LINK", "REVIEWED_FALLBACK"]), priority: z.number().int().min(0).max(1000), validFrom: z.iso.datetime(), validTo: z.iso.datetime(), enabled: z.boolean(), evidenceUrl: adminUrl }).strict().refine((v) => Date.parse(v.validFrom) < Date.parse(v.validTo));
export const storyEditSchema = z.object({ titleVi: adminText().min(1), summaryVi: adminText().min(1), storyType: z.enum(storyTypes), titleSourceText: adminText().min(12), summarySourceText: adminText().min(12), transfer: z.object({ playerId: z.uuid(), currentClubId: z.uuid().nullable(), targetClubId: z.uuid().nullable(), status: z.enum(["RUMOR", "INTEREST", "NEGOTIATION"]), evidenceId: z.uuid() }).strict().optional() }).strict();
export const evidenceReviewSchema = z.object({ evidenceIds: z.array(z.uuid()).min(1).max(30), kind: z.enum(["ARTICLE_SOURCE", "OFFICIAL_STATEMENT"]), authorityScope: entityScope.nullable(), lineageKey: adminText(300).min(5) }).strict();
const commandBase = { id: z.uuid(), reason: adminText(1000).min(5), confirm: z.literal(true), expectedUpdatedAt: z.iso.datetime().optional() };
export const adminCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...commandBase, action: z.literal("SOURCE_UPDATE"), data: sourceEditSchema }).strict(),
  z.object({ ...commandBase, action: z.literal("VIDEO_UPDATE"), data: videoEditSchema }).strict(),
  z.object({ ...commandBase, action: z.literal("MAPPING_SAVE"), data: mappingEditSchema }).strict(),
  z.object({ ...commandBase, action: z.literal("ARTICLE_EDIT"), data: storyEditSchema }).strict(),
  z.object({ ...commandBase, action: z.literal("EVIDENCE_REVIEW"), data: evidenceReviewSchema }).strict(),
  z.object({ ...commandBase, action: z.enum(["ARTICLE_APPROVE", "ARTICLE_REJECT", "ARTICLE_REVIEW", "BRIEF_PUBLISH"]) }).strict(),
  z.object({ ...commandBase, action: z.literal("CLUSTER_FLAGS"), data: z.object({ featured: z.boolean(), disputed: z.boolean() }).strict() }).strict(),
  z.object({ ...commandBase, action: z.literal("CLUSTER_MERGE"), data: z.object({ clusterIds: z.array(z.uuid()).min(2).max(10) }).strict() }).strict(),
  z.object({ ...commandBase, action: z.literal("CLUSTER_SPLIT"), data: z.object({ articleIds: z.array(z.uuid()).min(1).max(100) }).strict() }).strict(),
  z.object({ ...commandBase, action: z.literal("CLUSTER_UNMERGE") }).strict(),
  z.object({ ...commandBase, action: z.literal("TRANSFER_REVIEW"), data: z.object({ evidenceId: z.uuid(), status: z.enum(["CONFIRMED", "NEGOTIATION", "INTEREST", "RUMOR"]) }).strict() }).strict(),
  z.object({ ...commandBase, action: z.enum(["BRIEF_GENERATE", "WORKFLOW_RERUN"]), data: z.object({ date: z.iso.date() }).strict() }).strict(),
]);
export type AdminCommand = z.infer<typeof adminCommandSchema>;
export const adminListSchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), q: adminText(80).default(""), status: z.string().regex(/^[A-Z_]{1,40}$/).optional(), tier: z.string().regex(/^TIER_[0-3]_[A-Z]+$|^COMMUNITY$/).optional(), type: z.string().regex(/^[A-Z_]{1,50}$/).optional(), league: z.enum(["premier-league", "la-liga"]).optional(), certainty: z.enum(["CONFIRMED", "HIGH_CONFIDENCE", "REPORTED", "POSSIBLE", "SPECULATIVE", "DISPUTED"]).optional(), reliability: z.enum(["OFFICIAL", "RELIABLE", "SOCIAL", "RUMOR"]).optional(), enabled: z.enum(["true", "false"]).optional(), date: z.iso.date().optional() }).strict();
export type AdminFilters = z.infer<typeof adminListSchema>;
