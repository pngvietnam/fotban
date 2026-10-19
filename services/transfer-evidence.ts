import { createHash } from "node:crypto";
import { z } from "zod";
import type { ClusterArticle } from "../types/story-clustering";
import type { ReliabilityEvidence } from "../types/reliability";
import { emptyTransferFacts, transferFactsSchema, transferTypes, type TransferFacts, type TransferStatus } from "../types/transfers";
import { completedTransfer } from "../lib/transfer-claims";
import { publicSourceUrl, sourceClassification, sourceUsageAllowed } from "./reliability-engine";

function authority(item: ReliabilityEvidence, member: ClusterArticle) {
  const source = item.sourceArticle?.source;
  const scopes = [`player:${member.transferPair.player}`, `club:${member.transferPair.currentClub}`, `club:${member.transferPair.targetClub}`, ...member.input.article.entityScopes.filter((scope) => scope.startsWith("league:"))];
  return Boolean(source && sourceClassification(source) === "OFFICIAL" && item.kind === "OFFICIAL_STATEMENT" && item.authorityScope && source.authorityScopes.includes(item.authorityScope) && scopes.includes(item.authorityScope));
}
export function confirmationEvidenceIds(member: ClusterArticle) {
  const permitted = new Set(member.reliability.explanation.evidenceIds);
  return member.input.evidence.filter((item) => permitted.has(item.id) && item.stance === "SUPPORTS" && authority(item, member) && completedTransfer(item.excerpt ?? "")).map((item) => item.id);
}
export function transferStatusFor(member: ClusterArticle): TransferStatus {
  const result = member.reliability;
  if (result.transferStatus !== "CONFIRMED") return result.transferStatus ?? "RUMOR";
  return confirmationEvidenceIds(member).length && result.label === "OFFICIAL" && result.certainty === "CONFIRMED" && !result.disputed ? "CONFIRMED" : "RUMOR";
}

const factClaim = z.object({ playerId: z.uuid(), targetClubId: z.uuid().nullable(), value: z.string().trim().min(1).max(160), currency: z.string().regex(/^[A-Z]{3}$/).optional(), type: z.enum(transferTypes).optional() }).strict();
const currencyTokens: Record<string, RegExp> = { EUR: /€|\bEUR\b|euros?/iu, GBP: /£|\bGBP\b|pounds?/iu, USD: /\bUSD\b|US\$/iu };
const dealTokens: Record<string, RegExp> = { PERMANENT: /permanent|vĩnh viễn/iu, LOAN: /loan|cho mượn/iu, FREE_TRANSFER: /free transfer|chuyển nhượng tự do/iu, CONTRACT_EXTENSION: /extension|gia hạn/iu, RELEASE: /released|thanh lý/iu };

/** Only explicit, field-specific, reviewed source spans. Never mine arbitrary monetary numbers. */
export function transferFacts(member: ClusterArticle, now: Date): TransferFacts {
  const facts = emptyTransferFacts();
  const ambiguous = new Set<string>();
  for (const item of member.input.evidence) {
    if (!item.fieldPath?.startsWith("transfer.") || !member.transferPair.player || item.sourceArticleId !== member.input.article.id || !item.sourceArticle) continue;
    const source = item.sourceArticle.source;
    if (!item.reviewedBy?.trim() || !item.claimKey?.trim() || !item.lineageKey?.trim() || !item.reviewedAt || Date.parse(item.reviewedAt) > now.getTime() || Date.parse(item.reviewedAt) < Date.parse(member.input.processing.createdAt ?? "") || item.stance !== "SUPPORTS") continue;
    if (!sourceUsageAllowed(source) || !item.sourceArticle.usageAllowed || !publicSourceUrl(item.sourceArticle.sourceUrl) || !item.locator || !item.excerpt || !item.sourceArticle.text.includes(item.excerpt)) continue;
    let raw: unknown; try { raw = JSON.parse(item.claim); } catch { continue; }
    const parsed = factClaim.safeParse(raw); if (!parsed.success) continue;
    const claim = parsed.data;
    if (claim.playerId !== member.transferPair.player || claim.targetClubId !== member.transferPair.targetClub || !item.excerpt.includes(claim.value)) continue;
    const field = item.fieldPath.slice("transfer.".length) as keyof TransferFacts;
    if (!Object.hasOwn(facts, field) || ambiguous.has(field)) continue;
    const official = authority(item, member);
    if (!official && sourceClassification(source) !== "RELIABLE") continue;
    if (field === "confirmedFee" || field === "reportedFee") {
      if (!member.transferPair.targetClub || !claim.currency || !(currencyTokens[claim.currency] ?? new RegExp(`\\b${claim.currency}\\b`, "u")).test(claim.value) || !/\d/.test(claim.value)) continue;
      const qualifiers = item.excerpt.match(/up to|including add-ons|could reach|could be worth|at least|estimated|lên tới|bao gồm phụ phí|ước tính|hasta/giu) ?? [];
      if (qualifiers.some((qualifier) => !claim.value.toLocaleLowerCase().includes(qualifier.toLocaleLowerCase()))) continue;
      if (field === "confirmedFee" && (!official || transferStatusFor(member) !== "CONFIRMED" || /\?|could|may|reported|reportedly|believed|alleged|rumou?r|estimated|up to|including add-ons|có thể|dự kiến|ước tính|lên tới|podría|hasta/iu.test(item.excerpt))) continue;
      if (!/fee|transfer|deal|phí|chuyển nhượng/iu.test(item.excerpt)) continue;
    }
    if (field.startsWith("contract") || field === "extensionDuration") {
      if (!/contract|extension|hợp đồng|gia hạn/iu.test(item.excerpt) || !/year|month|năm|tháng|\b\d{4}-\d{2}-\d{2}\b/iu.test(claim.value)) continue;
      const uncertainty = /could|may|reportedly|estimated|có thể|dự kiến|ước tính|podría/iu;
      if (uncertainty.test(item.excerpt) && !uncertainty.test(claim.value)) continue;
    }
    if (field === "transferType") {
      if (!claim.type || claim.type === "UNKNOWN" || !dealTokens[claim.type]?.test(claim.value)) continue;
      if (facts.transferType && facts.transferType.value !== claim.type) { facts.transferType = null; ambiguous.add(field); continue; }
      facts.transferType = { value: claim.type, sourceText: claim.value, evidenceId: item.id, articleId: member.input.article.id }; continue;
    }
    if (facts[field] && facts[field]!.value !== claim.value) { facts[field] = null; ambiguous.add(field); continue; }
    facts[field] = { value: claim.value, ...(claim.currency ? { currency: claim.currency } : {}), evidenceId: item.id, articleId: member.input.article.id };
  }
  return transferFactsSchema.parse(facts);
}

export function transferInputHash(member: ClusterArticle, facts: TransferFacts, disputed = member.reliability.disputed) {
  const article = { ...member.input.article, updatedAt: undefined, publicationStatus: undefined };
  // Publication and wall-clock freshness do not create a new factual revision.
  return createHash("sha256").update(JSON.stringify({ input: { ...member.input, article }, clusterId: member.clusterId, pair: member.transferPair, status: transferStatusFor(member), disputed, facts })).digest("hex");
}

