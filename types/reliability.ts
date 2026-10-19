import { z } from "zod";

export const sourceTierSchema = z.enum(["TIER_0_OFFICIAL", "TIER_1_HIGH", "TIER_2_ESTABLISHED", "TIER_3_UNVERIFIED", "COMMUNITY"]);
export const sourceSchema = z.object({
  id: z.uuid(), name: z.string(), domain: z.string(), type: z.string(), sourceTier: sourceTierSchema,
  reliabilityScore: z.number().int().min(0).max(100), official: z.boolean(), enabled: z.boolean(),
  rationale: z.string().nullable(), reviewer: z.string().nullable(), reviewedAt: z.string().nullable(),
  authorityScopes: z.array(z.string()), permissionStatus: z.enum(["UNREVIEWED", "ALLOWED", "RESTRICTED"]),
  termsReviewed: z.boolean(), ingestionAllowed: z.boolean(), permissionReference: z.string().nullable(),
  language: z.string().nullable(), country: z.string().nullable(),
  newsPriority: z.number().int().min(0).max(1000).optional(),
});
export type ReliabilitySource = z.infer<typeof sourceSchema>;
export type EvidenceKind = "ARTICLE_SOURCE" | "OFFICIAL_STATEMENT" | "SECONDARY_SOURCE" | "SOCIAL_POST" | "QUOTE" | "MATCH_DATA" | "STRUCTURED_PROVIDER";
export type ReliabilityEvidence = {
  id: string; articleId: string | null; claim: string; sourceArticleId: string | null; matchId: string | null;
  fieldPath: string | null; locator: string | null; excerpt: string | null; kind: EvidenceKind; stance: "SUPPORTS" | "CONTRADICTS";
  claimKey: string | null; lineageKey: string | null; authorityScope: string | null; reviewedBy: string | null; reviewedAt: string | null; supersedesId: string | null;
  sourceArticle: { id: string; sourceUrl: string; text: string; usageAllowed: boolean; source: ReliabilitySource } | null;
  match: { id: string; provider: string; mapped: boolean; status: string; homeScore: number | null; awayScore: number | null } | null;
};
export type ReliabilityInput = {
  article: { id: string; sourceUrl: string; canonicalUrl: string; titleOriginal: string; excerptOriginal: string | null; titleVi: string | null; summaryVi: string | null; storyType: string | null; publishedAt: string | null; updatedAt: string; entityScopes: string[]; permissionAllowed: boolean; publicationStatus: string; manualOverrideAt: string | null };
  source: ReliabilitySource;
  processing: { id: string | null; createdAt: string | null; validated: boolean; uncertainty: boolean; errors: string[] };
  evidence: ReliabilityEvidence[];
};
export const reliabilityResultSchema = z.object({
  policyVersion: z.literal("reliability-v1.1.0"), evaluatedAt: z.iso.datetime(),
  source: z.object({ id: z.uuid(), tier: sourceTierSchema, score: z.number().min(0).max(100), classification: z.enum(["OFFICIAL", "RELIABLE", "SOCIAL", "UNVERIFIED"]), rationale: z.string().nullable(), reviewer: z.string().nullable(), reviewedAt: z.string().nullable() }).strict(),
  label: z.enum(["OFFICIAL", "RELIABLE", "SOCIAL", "RUMOR"]),
  certainty: z.enum(["CONFIRMED", "HIGH_CONFIDENCE", "REPORTED", "POSSIBLE", "SPECULATIVE", "DISPUTED"]),
  evidenceStrength: z.enum(["DIRECT", "STRONG", "SUPPORTING", "WEAK", "SOCIAL_ONLY"]),
  transferStatus: z.enum(["CONFIRMED", "NEGOTIATION", "INTEREST", "RUMOR"]).nullable(), disputed: z.boolean(),
  permission: z.object({ status: z.enum(["UNREVIEWED", "ALLOWED", "RESTRICTED"]), usageAllowed: z.boolean() }).strict(),
  freshness: z.object({ ageHours: z.number().nonnegative().nullable(), bucket: z.enum(["FRESH", "AGING", "STALE", "UNKNOWN", "FUTURE"]) }).strict(),
  publishability: z.object({ eligible: z.boolean(), blockers: z.array(z.string()) }).strict(),
  explanation: z.object({ reasons: z.array(z.string()), evidenceIds: z.array(z.uuid()), supersededEvidenceIds: z.array(z.uuid()), independentSources: z.number().int().nonnegative(), sources: z.array(z.object({ id: z.uuid(), name: z.string(), url: z.string(), official: z.boolean(), tier: sourceTierSchema }).strict()), structuredSources: z.array(z.object({ evidenceId: z.uuid(), matchId: z.uuid(), provider: z.string(), fieldPath: z.literal("fullTimeScore"), value: z.string() }).strict()), updatedAt: z.string() }).strict(),
  badge: z.object({ labelVi: z.string(), certaintyVi: z.string(), disputedVi: z.string().nullable() }).strict(),
}).strict();
export type ReliabilityResult = z.infer<typeof reliabilityResultSchema>;
