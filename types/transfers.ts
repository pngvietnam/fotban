import { z } from "zod";
import type { NewsStory } from "./news-ui";

export const transferStatusSchema = z.enum(["CONFIRMED", "NEGOTIATION", "INTEREST", "RUMOR"]);
export type TransferStatus = z.infer<typeof transferStatusSchema>;
export const transferTypes = ["PERMANENT", "LOAN", "FREE_TRANSFER", "CONTRACT_EXTENSION", "RELEASE", "UNKNOWN"] as const;
const fact = z.object({ value: z.string().trim().min(1).max(160), currency: z.string().regex(/^[A-Z]{3}$/).optional(), evidenceId: z.uuid(), articleId: z.uuid() }).strict();
export const transferFactsSchema = z.object({
  confirmedFee: fact.nullable(), reportedFee: fact.nullable(), contractDuration: fact.nullable(), contractExpiry: fact.nullable(), extensionDuration: fact.nullable(),
  transferType: z.object({ value: z.enum(transferTypes), sourceText: z.string().max(160), evidenceId: z.uuid(), articleId: z.uuid() }).strict().nullable(),
}).strict();
export type TransferFacts = z.infer<typeof transferFactsSchema>;
export const emptyTransferFacts = (): TransferFacts => ({ confirmedFee: null, reportedFee: null, contractDuration: null, contractExpiry: null, extensionDuration: null, transferType: null });
export const transferSnapshotSchema = z.object({
  version: z.literal("transfer-v1"), reliabilityPolicyVersion: z.string().min(1), articleId: z.uuid(), clusterId: z.uuid(), inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  playerId: z.uuid(), currentClubId: z.uuid().nullable(), targetClubId: z.uuid().nullable(), status: transferStatusSchema,
  headlineVi: z.string().min(1), summaryVi: z.string().min(1), publishedAt: z.iso.datetime(), disputed: z.boolean(),
  facts: transferFactsSchema, evidenceIds: z.array(z.uuid()).min(1),
}).strict();
export type TransferSnapshot = z.infer<typeof transferSnapshotSchema>;
export type TransferFilters = { league: "all" | "premier-league" | "la-liga"; status: "all" | TransferStatus; page: number };
export type TransferView = {
  slug: string | null; story: NewsStory; status: TransferStatus; disputed: boolean; facts: TransferFacts;
  firstSeenAt: string; lastUpdatedAt: string; firstSeenDateOnly?: boolean; lastUpdatedDateOnly?: boolean;
  timeline: { headlineVi: string; summaryVi: string; status: TransferStatus; publishedAt: string; dateOnly?: boolean; newsSlug: string; sources: NewsStory["sources"] }[];
};
export type TransferListResult = { kind: "ready"; transfers: TransferView[]; nextPage: number | null } | { kind: "error" };
export type TransferDetailResult = { kind: "ready"; transfer: TransferView } | { kind: "not-found" } | { kind: "error" };
