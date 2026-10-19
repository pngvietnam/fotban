import { z } from "zod";
import type { ReliabilityInput, ReliabilityResult } from "./reliability";

export type ClusterArticle = {
  input: ReliabilityInput;
  reliability: ReliabilityResult;
  fingerprint: string;
  clusterId: string | null;
  collectedAt: string;
  urls: string[];
  // Canonical internal identities, never free-text club/player aliases.
  transferPair: { player: string | null; currentClub: string | null; targetClub: string | null };
  managers: string[];
  identityNames: string[];
};
export type SimilarityDecision = {
  merge: boolean; exact: boolean; score: number; reasons: string[];
  factors: { title: number; entities: number; hours: number | null; type: boolean; transferPair: boolean; lineage: boolean; claim: boolean };
};
export type ClusterPolicy = { version: string; defaultWindowHours: number; windows: Record<string, number>; maxArticles: number };
export const defaultClusterPolicy: ClusterPolicy = { version: "story-clustering-v1.0.0", defaultWindowHours: 48, windows: { MATCH: 36, TRANSFER: 96, INJURY: 48, CONTRACT: 72, FINANCIAL: 72 }, maxArticles: 200 };

export const clusterSnapshotSchema = z.object({
  algorithmVersion: z.string(), articleIds: z.array(z.uuid()), articleCount: z.number().int().nonnegative(), sourceCount: z.number().int().nonnegative(), independentSourceCount: z.number().int().nonnegative(),
  windowHours: z.object({ default: z.number(), byStoryType: z.record(z.string(), z.number()) }).strict(),
  representativeArticleId: z.uuid().nullable(), headlineVi: z.string().nullable(), summaryVi: z.string().nullable(), storyType: z.string().nullable(),
  primaryEntities: z.array(z.string()), firstSeen: z.string().nullable(), lastUpdated: z.string().nullable(),
  reliabilityLabel: z.enum(["OFFICIAL", "RELIABLE", "SOCIAL", "RUMOR"]).nullable(),
  certainty: z.enum(["CONFIRMED", "HIGH_CONFIDENCE", "REPORTED", "POSSIBLE", "SPECULATIVE", "DISPUTED"]).nullable(),
  strongestEvidence: z.enum(["DIRECT", "STRONG", "SUPPORTING", "WEAK", "SOCIAL_ONLY"]).nullable(),
  transferStages: z.array(z.string()), disputed: z.boolean(), eligible: z.boolean(), blockers: z.array(z.string()), featured: z.boolean(),
  sources: z.array(z.object({ articleId: z.uuid(), sourceId: z.uuid(), url: z.string(), eligible: z.boolean() }).strict()),
  decisions: z.array(z.object({ articleId: z.uuid(), withArticleId: z.uuid(), merge: z.boolean(), exact: z.boolean(), score: z.number(), reasons: z.array(z.string()), factors: z.object({ title: z.number(), entities: z.number(), hours: z.number().nullable(), type: z.boolean(), transferPair: z.boolean(), lineage: z.boolean(), claim: z.boolean() }).strict() }).strict()),
  memberFingerprints: z.array(z.object({ articleId: z.uuid(), hash: z.string() }).strict()),
}).strict();
export type ClusterSnapshot = z.infer<typeof clusterSnapshotSchema>;
export type ExistingCluster = { id: string; headline: string | null; summary: string | null; representativeArticleId: string | null; manualOverrideAt: string | null; manualDisputed: boolean; featured: boolean; publishedReferenced: boolean };
