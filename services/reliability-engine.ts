import type { ReliabilityEvidence, ReliabilityInput, ReliabilityResult, ReliabilitySource } from "../types/reliability";
import { reliabilityResultSchema, sourceSchema } from "../types/reliability";
import { uncertainty } from "../providers/ai/rules";
import { completedTransfer, transferInterest, transferStopped, transferTalks } from "../lib/transfer-claims";

export const reliabilityPolicyVersion = "reliability-v1.1.0" as const;
const nonempty = (text: string | null) => Boolean(text?.trim());
export function publicSourceUrl(value: string) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
function registeredUrl(value: string, source: ReliabilitySource) {
  try { return publicSourceUrl(value) && new URL(value).hostname.toLowerCase().replace(/^www\./, "") === source.domain.toLowerCase().replace(/^www\./, ""); } catch { return false; }
}
export function sourceClassification(source: ReliabilitySource): ReliabilityResult["source"]["classification"] {
  if (source.type === "SOCIAL" || source.sourceTier === "COMMUNITY") return "SOCIAL";
  const reviewed = nonempty(source.rationale) && nonempty(source.reviewer) && Number.isFinite(Date.parse(source.reviewedAt ?? ""));
  if (!reviewed) return "UNVERIFIED";
  if (source.official && source.type === "OFFICIAL" && source.sourceTier === "TIER_0_OFFICIAL") return "OFFICIAL";
  return ["TIER_1_HIGH", "TIER_2_ESTABLISHED"].includes(source.sourceTier) ? "RELIABLE" : "UNVERIFIED";
}
export function sourceUsageAllowed(source: ReliabilitySource) {
  return source.enabled && source.permissionStatus === "ALLOWED" && source.termsReviewed && source.ingestionAllowed && nonempty(source.permissionReference) && nonempty(source.reviewer) && Boolean(source.reviewedAt);
}
function sourceProof(evidence: ReliabilityEvidence) {
  const article = evidence.sourceArticle;
  return Boolean(article && article.id === evidence.sourceArticleId && registeredUrl(article.sourceUrl, article.source) && nonempty(evidence.locator) && evidence.excerpt && evidence.excerpt.trim().length >= 8 && article.text.includes(evidence.excerpt));
}
function reviewed(evidence: ReliabilityEvidence, now: Date) {
  const date = evidence.reviewedAt ? Date.parse(evidence.reviewedAt) : NaN;
  return nonempty(evidence.reviewedBy) && nonempty(evidence.claimKey) && Number.isFinite(date) && date <= now.getTime();
}
function directMatch(evidence: ReliabilityEvidence, input: ReliabilityInput) {
  const match = evidence.match;
  if (!match || match.id !== evidence.matchId || !match.provider || !match.mapped || input.article.storyType !== "MATCH" || !input.article.entityScopes.includes(`match:${match.id}`) || match.status !== "FINISHED" || match.homeScore === null || match.awayScore === null) return false;
  // Only the score tuple itself is authoritative, not injuries, transfers or appearances.
  const score = `${match.homeScore}-${match.awayScore}`;
  return ["MATCH_DATA", "STRUCTURED_PROVIDER"].includes(evidence.kind) && evidence.fieldPath === "fullTimeScore" && evidence.excerpt === score && evidence.claim.includes(score) && `${input.article.titleOriginal} ${input.article.excerptOriginal}`.includes(score) && /\b\d+-\d+\b/.test(evidence.claim);
}
function official(evidence: ReliabilityEvidence, input: ReliabilityInput) {
  const source = evidence.sourceArticle?.source;
  return Boolean(source && sourceClassification(source) === "OFFICIAL" && evidence.kind === "OFFICIAL_STATEMENT" && evidence.authorityScope && input.article.entityScopes.includes(evidence.authorityScope) && source.authorityScopes.includes(evidence.authorityScope));
}
export function independentGroups(evidence: ReliabilityEvidence[]) {
  // Union common publisher AND declared origin transitively; copied chains count once.
  const groups: Set<string>[] = [];
  for (const item of evidence) {
    const source = item.sourceArticle!.source;
    const keys = new Set([`publisher:${source.domain.toLowerCase().replace(/^www\./, "")}`, `origin:${item.lineageKey!.trim().toLowerCase()}`]);
    for (let index = groups.length - 1; index >= 0; index--) if ([...groups[index]].some((key) => keys.has(key))) { for (const key of groups[index]) keys.add(key); groups.splice(index, 1); }
    groups.push(keys);
  }
  return groups.length;
}

/** Pure deterministic policy. AI output is a signal, never source authority. */
export class ReliabilityEngine {
  assess(input: ReliabilityInput, now = new Date()): ReliabilityResult {
    sourceSchema.parse(input.source);
    const article = input.article; const source = input.source; const reasons = new Set<string>(); const blockers = new Set<string>();
    const sourceClass = sourceClassification(source);
    const primaryText = `${article.titleOriginal}\n${article.excerptOriginal ?? ""}`;
    const generated = `${article.titleVi ?? ""}\n${article.summaryVi ?? ""}`;
    const interest = transferInterest.test(primaryText);
    const talks = transferTalks.test(primaryText);
    const speculative = /\b(?:may|could|reportedly|believed to|considering|linked with|rumou?r|anonymous|unnamed)\b|có thể|được cho|cân nhắc|tin đồn|ẩn danh|podría/iu.test(primaryText);
    const uncertain = uncertainty.test(primaryText) || input.processing.uncertainty || interest || speculative;
    const valid = input.evidence.filter((item) => item.articleId === article.id && [article.titleVi, article.summaryVi].includes(item.claim) && reviewed(item, now) && (!input.processing.createdAt || Date.parse(item.reviewedAt!) >= Date.parse(input.processing.createdAt)) && (sourceProof(item) || directMatch(item, input)));
    const superseded = new Set<string>();
    for (const item of valid.filter((row) => row.supersedesId)) {
      const prior = valid.find((row) => row.id === item.supersedesId);
      if (prior && prior.claimKey === item.claimKey && official(item, input) && Date.parse(item.reviewedAt!) > Date.parse(prior.reviewedAt!)) { superseded.add(prior.id); reasons.add("REVIEWED_OFFICIAL_CORRECTION"); }
      else blockers.add("INVALID_CORRECTION");
    }
    const active = valid.filter((item) => !superseded.has(item.id));
    const supporting = active.filter((item) => item.stance === "SUPPORTS");
    // A reviewed contradiction to any assessed claim is retained as a dispute.
    const disputed = active.some((item) => item.stance === "CONTRADICTS");
    const socialOnly = supporting.length > 0 && supporting.every((item) => item.kind === "SOCIAL_POST" || (item.sourceArticle && sourceClassification(item.sourceArticle.source) === "SOCIAL"));
    const social = sourceClass === "SOCIAL" || article.storyType === "SOCIAL" || article.storyType === "COMMUNITY" || socialOnly;
    const officialEvidence = supporting.filter((item) => official(item, input));
    const matchEvidence = supporting.filter((item) => directMatch(item, input));
    const credible = supporting.filter((item) => item.sourceArticle && ["OFFICIAL", "RELIABLE"].includes(sourceClassification(item.sourceArticle.source)) && item.kind !== "SOCIAL_POST" && nonempty(item.lineageKey));
    const independent = independentGroups(credible);
    const direct = officialEvidence.length > 0 || matchEvidence.length > 0;
    const trusted = sourceClass === "RELIABLE" || sourceClass === "OFFICIAL";
    let label: ReliabilityResult["label"] = social ? "SOCIAL" : !trusted || uncertain ? "RUMOR" : "RELIABLE";
    let certainty: ReliabilityResult["certainty"] = interest && trusted ? "POSSIBLE" : uncertain || !trusted ? "SPECULATIVE" : independent >= 2 ? "HIGH_CONFIDENCE" : "REPORTED";
    // Uncertain source text must be revised/processed before any confirmation badge.
    if (direct && !uncertain && !social) { label = "OFFICIAL"; certainty = "CONFIRMED"; reasons.add(matchEvidence.length ? "EXACT_STRUCTURED_MATCH_RESULT" : "REVIEWED_SCOPED_OFFICIAL_EVIDENCE"); }
    if (talks && trusted && !speculative && !social) { certainty = independent >= 2 ? "HIGH_CONFIDENCE" : "REPORTED"; if (!direct) label = "RELIABLE"; }
    if (disputed) { certainty = "DISPUTED"; if (label === "OFFICIAL") label = trusted ? "RELIABLE" : "RUMOR"; reasons.add("CONFLICTING_REVIEWED_EVIDENCE"); blockers.add("DISPUTED"); }
    let transferStatus: ReliabilityResult["transferStatus"] = null;
    if (article.storyType === "TRANSFER") {
      const signed = completedTransfer(primaryText);
      transferStatus = direct && signed && !uncertain && !disputed && !social ? "CONFIRMED" : interest && trusted && !social ? "INTEREST" : talks && trusted && !speculative && !social ? "NEGOTIATION" : "RUMOR";
      if (transferStopped.test(primaryText)) transferStatus = "RUMOR";
      if (transferStatus !== "CONFIRMED" && certainty === "CONFIRMED") { certainty = "REPORTED"; label = "RELIABLE"; reasons.add("TRANSFER_COMPLETION_NOT_EVIDENCED"); }
    }
    if (certainty !== "CONFIRMED" && label === "OFFICIAL") label = "RELIABLE";
    if (trusted) reasons.add("SOURCE_TIER_EDITORIALLY_REVIEWED");
    if (label === "RELIABLE") reasons.add("REPORTING_NOT_OFFICIAL_CONFIRMATION");
    const evidenceStrength: ReliabilityResult["evidenceStrength"] = social ? "SOCIAL_ONLY" : direct ? "DIRECT" : independent >= 2 ? "STRONG" : independent === 1 ? "SUPPORTING" : "WEAK";
    if (!trusted && !social) { reasons.add("SOURCE_TIER_REQUIRES_REVIEW"); blockers.add("SOURCE_TIER_REQUIRES_REVIEW"); }
    if (uncertain) reasons.add("SOURCE_UNCERTAINTY_PRESERVED");
    if (social) { reasons.add("COMMUNITY_IS_NOT_FACTUAL_CONFIRMATION"); blockers.add("SOCIAL_NOT_FACTUAL_NEWS"); }
    if (independent >= 2) reasons.add("INDEPENDENT_CREDIBLE_CORROBORATION");
    if (credible.length > independent) reasons.add("SHARED_ORIGIN_COUNTED_ONCE");
    if (sourceClass === "OFFICIAL" && !officialEvidence.length) reasons.add("OFFICIAL_SOURCE_WITHOUT_CLAIM_AUTHORITY");
    const allowed = article.permissionAllowed && sourceUsageAllowed(source);
    if (!allowed) blockers.add("USAGE_NOT_ALLOWED");
    if (active.some((item) => item.sourceArticle && (!item.sourceArticle.usageAllowed || !sourceUsageAllowed(item.sourceArticle.source)))) blockers.add("EVIDENCE_USAGE_NOT_ALLOWED");
    if (!publicSourceUrl(article.sourceUrl) || !publicSourceUrl(article.canonicalUrl)) blockers.add("MISSING_SOURCE_URL");
    if (!registeredUrl(article.sourceUrl, source)) blockers.add("SOURCE_URL_MISMATCH");
    if (!article.titleVi?.trim() || !article.summaryVi?.trim()) blockers.add("VIETNAMESE_REQUIRED");
    if (!article.storyType || !input.processing.validated) blockers.add("VALIDATED_PROCESSING_REQUIRED");
    if (!supporting.length) blockers.add("REVIEWED_EVIDENCE_REQUIRED");
    for (const field of [article.titleVi, article.summaryVi]) if (field && !supporting.some((item) => item.claim === field)) blockers.add("GENERATED_CLAIM_NOT_REVIEWED");
    if (article.publicationStatus === "HIDDEN" || article.manualOverrideAt) blockers.add("EDITORIAL_LOCK");
    if (uncertain && /đã xác nhận|đã hoàn tất|chính thức gia nhập|đã ký hợp đồng/iu.test(generated)) blockers.add("CERTAINTY_UPGRADE_REJECTED");
    const published = article.publishedAt ? Date.parse(article.publishedAt) : NaN;
    const age = (now.getTime() - published) / 3600000;
    const bucket = !Number.isFinite(age) ? "UNKNOWN" : age < -5 / 60 ? "FUTURE" : age <= 24 ? "FRESH" : age <= 72 ? "AGING" : "STALE";
    if (bucket === "UNKNOWN" || bucket === "FUTURE") blockers.add("INVALID_PUBLICATION_TIME");
    const evidenceSources = active.flatMap((item) => item.sourceArticle ? [{ id: item.sourceArticle.source.id, name: item.sourceArticle.source.name, url: item.sourceArticle.sourceUrl, official: official(item, input), tier: item.sourceArticle.source.sourceTier }] : []);
    const distinctSources = evidenceSources.filter((item, index, all) => all.findIndex((other) => other.id === item.id && other.url === item.url) === index);
    const labelVi = { OFFICIAL: "Chính thức / Đã xác nhận", RELIABLE: "Nguồn tin đáng tin cậy", SOCIAL: "Cộng đồng", RUMOR: "Tin đồn / Chưa xác nhận" }[label];
    const certaintyVi = { CONFIRMED: "Đã xác nhận", HIGH_CONFIDENCE: "Có nhiều nguồn độc lập", REPORTED: "Được đưa tin", POSSIBLE: "Có khả năng", SPECULATIVE: "Chưa xác nhận", DISPUTED: "Thông tin mâu thuẫn" }[certainty];
    return reliabilityResultSchema.parse({
      policyVersion: reliabilityPolicyVersion, evaluatedAt: now.toISOString(),
      source: { id: source.id, tier: source.sourceTier, score: source.reliabilityScore, classification: sourceClass, rationale: source.rationale, reviewer: source.reviewer, reviewedAt: source.reviewedAt },
      label, certainty, evidenceStrength, transferStatus, disputed,
      permission: { status: source.permissionStatus, usageAllowed: allowed },
      freshness: { ageHours: Number.isFinite(age) ? Math.max(0, Math.round(age * 100) / 100) : null, bucket },
      publishability: { eligible: blockers.size === 0, blockers: [...blockers].sort() },
      explanation: { reasons: [...reasons].sort(), evidenceIds: active.map((item) => item.id).sort(), supersededEvidenceIds: [...superseded].sort(), independentSources: independent, sources: distinctSources, structuredSources: matchEvidence.map((item) => ({ evidenceId: item.id, matchId: item.match!.id, provider: item.match!.provider, fieldPath: "fullTimeScore", value: item.excerpt! })), updatedAt: article.updatedAt },
      badge: { labelVi, certaintyVi, disputedVi: disputed ? "Thông tin mâu thuẫn" : null },
    });
  }
}
