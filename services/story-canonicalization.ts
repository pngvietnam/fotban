import type { ClusterArticle, ClusterPolicy, ClusterSnapshot, ExistingCluster } from "../types/story-clustering";
import { clusterSnapshotSchema, defaultClusterPolicy } from "../types/story-clustering";
import { independentGroups, sourceClassification, sourceUsageAllowed } from "./reliability-engine";
import { claimKeys, eventTokens, transferStage, scoreStories } from "./story-similarity";

const labelRank = { OFFICIAL: 4, RELIABLE: 3, RUMOR: 2, SOCIAL: 1 };
const evidenceRank = { DIRECT: 5, STRONG: 4, SUPPORTING: 3, WEAK: 2, SOCIAL_ONLY: 1 };
const vietnamesePriority = (member: ClusterArticle) => member.input.source.language === "vi" && member.input.source.country === "VN" ? member.input.source.newsPriority ?? 500 : 1000;
function orderMembers(a: ClusterArticle, b: ClusterArticle) {
  return labelRank[b.reliability.label] - labelRank[a.reliability.label] || evidenceRank[b.reliability.evidenceStrength] - evidenceRank[a.reliability.evidenceStrength] || vietnamesePriority(a) - vietnamesePriority(b) || Date.parse(b.input.article.publishedAt ?? b.collectedAt) - Date.parse(a.input.article.publishedAt ?? a.collectedAt) || a.input.article.id.localeCompare(b.input.article.id);
}
function opposite(a: ClusterArticle, b: ClusterArticle) {
  const negative = (article: ClusterArticle) => /\b(?:not|denies|denied|staying|stays|remains|won't)\b|không|phủ nhận|ở lại/iu.test(article.input.article.titleOriginal);
  const sameClaim = [...claimKeys(a)].some((key) => claimKeys(b).has(key));
  const departure = eventTokens(a).has("departure") && eventTokens(b).has("departure");
  return negative(a) !== negative(b) && (sameClaim || departure);
}
export function canonicalizeStory(members: ClusterArticle[], existing?: ExistingCluster, policy: ClusterPolicy = defaultClusterPolicy): ClusterSnapshot {
  const sorted = [...members].sort((a, b) => a.input.article.id.localeCompare(b.input.article.id));
  const permitted = sorted.filter((member) => member.reliability.permission.usageAllowed && !member.reliability.publishability.blockers.includes("EVIDENCE_USAGE_NOT_ALLOWED") && member.input.article.publicationStatus !== "HIDDEN");
  const eligible = permitted.filter((member) => member.reliability.publishability.eligible).sort(orderMembers);
  let representative: ClusterArticle | null = eligible[0] ?? null;
  if (existing?.manualOverrideAt && existing.representativeArticleId) representative = eligible.find((member) => member.input.article.id === existing.representativeArticleId && member.input.article.titleVi === existing.headline && member.input.article.summaryVi === existing.summary) ?? null;
  const disputed = Boolean(existing?.manualDisputed || sorted.some((member) => member.reliability.disputed) || permitted.some((member, index) => permitted.slice(index + 1).some((other) => opposite(member, other))));
  const blockers = new Set<string>();
  const types = [...new Set(permitted.map((member) => member.input.article.storyType).filter((type): type is string => Boolean(type)))].sort();
  const stages = [...new Set(permitted.filter((member) => member.input.article.storyType === "TRANSFER").map(transferStage))].sort();
  if (!representative) blockers.add("NO_ELIGIBLE_CANONICAL_ARTICLE");
  if (types.length > 1) blockers.add("MIXED_STORY_TYPES");
  if (stages.length > 1) blockers.add("MIXED_TRANSFER_STAGES");
  if (disputed) { blockers.add("DISPUTED"); representative = null; }
  const metadataMember = representative ?? [...permitted].sort(orderMembers)[0] ?? null;
  const reviewedEvidence = permitted.flatMap((member) => {
    const valid = new Set(member.reliability.explanation.evidenceIds);
    return member.input.evidence.filter((item) => valid.has(item.id) && item.stance === "SUPPORTS" && item.lineageKey?.trim() && item.kind !== "SOCIAL_POST" && item.sourceArticle?.usageAllowed && sourceUsageAllowed(item.sourceArticle.source) && ["OFFICIAL", "RELIABLE"].includes(sourceClassification(item.sourceArticle.source)));
  });
  const dates = sorted.map((member) => member.collectedAt).sort();
  const updated = sorted.map((member) => member.input.article.updatedAt).sort();
  const independentSourceCount = independentGroups(reviewedEvidence);
  let strongestEvidence = [...permitted].sort((a, b) => evidenceRank[b.reliability.evidenceStrength] - evidenceRank[a.reliability.evidenceStrength])[0]?.reliability.evidenceStrength ?? null;
  if (independentSourceCount >= 2 && strongestEvidence && evidenceRank[strongestEvidence] < evidenceRank.STRONG) strongestEvidence = "STRONG";
  const sourceLinks = [...permitted.map((member) => ({ articleId: member.input.article.id, sourceId: member.input.source.id, url: member.input.article.sourceUrl, eligible: member.reliability.publishability.eligible })), ...reviewedEvidence.map((item) => ({ articleId: item.sourceArticle!.id, sourceId: item.sourceArticle!.source.id, url: item.sourceArticle!.sourceUrl, eligible: permitted.some((member) => member.input.article.id === item.sourceArticle!.id && member.reliability.publishability.eligible) }))];
  const sources = sourceLinks.filter((link, index, all) => all.findIndex((other) => other.articleId === link.articleId && other.url === link.url) === index).sort((a, b) => a.articleId.localeCompare(b.articleId));
  return clusterSnapshotSchema.parse({
    algorithmVersion: policy.version, articleIds: sorted.map((member) => member.input.article.id), articleCount: sorted.length,
    windowHours: { default: policy.defaultWindowHours, byStoryType: policy.windows },
    sourceCount: new Set(sources.map((source) => source.sourceId)).size, independentSourceCount,
    representativeArticleId: representative?.input.article.id ?? null, headlineVi: representative?.input.article.titleVi ?? null, summaryVi: representative?.input.article.summaryVi ?? null,
    storyType: types.length === 1 ? types[0] : null, primaryEntities: [...new Set(permitted.flatMap((member) => member.input.article.entityScopes))].sort(),
    firstSeen: dates[0] ?? null, lastUpdated: updated.at(-1) ?? null,
    reliabilityLabel: metadataMember?.reliability.label ?? null, certainty: disputed ? "DISPUTED" : metadataMember?.reliability.certainty ?? null,
    strongestEvidence,
    transferStages: stages, disputed, eligible: blockers.size === 0, blockers: [...blockers].sort(), featured: existing?.featured ?? false,
    sources,
    decisions: sorted.slice(1).map((member) => ({ articleId: member.input.article.id, withArticleId: sorted[0].input.article.id, ...scoreStories(sorted[0], member, policy) })),
    memberFingerprints: sorted.map((member) => ({ articleId: member.input.article.id, hash: member.fingerprint })),
  });
}

/** Future feed adapter: one candidate per cluster; restricted internal membership is omitted. */
export function publicStoryCandidate(clusterId: string, snapshot: ClusterSnapshot) {
  if (!snapshot.eligible) return null;
  return { clusterId, headlineVi: snapshot.headlineVi!, summaryVi: snapshot.summaryVi!, storyType: snapshot.storyType, primaryEntities: snapshot.primaryEntities, reliabilityLabel: snapshot.reliabilityLabel, certainty: snapshot.certainty, strongestEvidence: snapshot.strongestEvidence, disputed: snapshot.disputed, sourceCount: snapshot.sourceCount, independentSourceCount: snapshot.independentSourceCount, firstSeen: snapshot.firstSeen, lastUpdated: snapshot.lastUpdated, featured: snapshot.featured, sources: snapshot.sources };
}
