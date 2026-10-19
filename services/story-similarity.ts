import { createHash } from "node:crypto";
import type { ClusterArticle, ClusterPolicy, SimilarityDecision } from "../types/story-clustering";
import { defaultClusterPolicy } from "../types/story-clustering";

export const normalizeStoryText = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
export const titleHash = (text: string) => createHash("sha256").update(normalizeStoryText(text)).digest("hex");
export function normalizedStoryUrl(value: string) {
  try {
    const url = new URL(value); if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || ["fbclid", "gclid", "mc_cid", "mc_eid"].includes(key.toLowerCase())) url.searchParams.delete(key);
    url.searchParams.sort(); return url.href;
  } catch { return null; }
}
const words = (text: string) => new Set(normalizeStoryText(text).split(" ").filter(Boolean));
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((value) => b.has(value)).length;
const jaccard = (a: Set<string>, b: Set<string>) => a.size + b.size ? overlap(a, b) / new Set([...a, ...b]).size : 0;
const stop = new Set("a an the to of in on at for with as and or from is are be has have been player club football reportedly may could el la los del de en para un una được cho là có thể của đang cầu thủ câu lạc bộ một với và về".split(" "));
export function eventTokens(article: ClusterArticle) {
  let title = normalizeStoryText(article.input.article.titleOriginal);
  for (const name of [...article.identityNames, ...article.managers].sort((a, b) => b.length - a.length)) {
    const normalized = normalizeStoryText(name);
    if (normalized.length >= 3) title = ` ${title} `.split(` ${normalized} `).join(" ").trim();
  }
  const normalized = title
    .replace(/interested in|interest in|monitoring|monitor|keen on|quan tâm|theo dõi|interés en|contact(?:s|ed)? .*?agent/gu, " interest ")
    .replace(/negotiations?|talks|đàm phán|thương lượng/gu, " negotiation ")
    .replace(/bids?|offers?|đề nghị|ra giá/gu, " bid ")
    .replace(/staying|stays?|remains?|leaving|leaves?|exit|ra đi|ở lại/gu, " departure ")
    .replace(/injur(?:y|ies|ed)|lesión|chấn thương/gu, " injury ")
    .replace(/charity|từ thiện/gu, " charity ");
  return new Set([...words(normalized)].filter((word) => !stop.has(word)));
}
export function transferStage(article: ClusterArticle) {
  const title = article.input.article.titleOriginal;
  if (article.reliability.transferStatus === "CONFIRMED") return "CONFIRMED";
  if (/\bbids?\b|\boffers?\b|ra giá|đề nghị/iu.test(title)) return "BID";
  if (/has signed|officially signed|đã ký|chính thức gia nhập/iu.test(title)) return "REPORTED_COMPLETION";
  if (/negotiat|\btalks\b|đàm phán|thương lượng/iu.test(title)) return "NEGOTIATION";
  if (/interested|monitor|keen on|contact.*agent|quan tâm|theo dõi|interés/iu.test(title)) return "INTEREST";
  if (/leav|stay|remain|exit|ra đi|ở lại/iu.test(title)) return "DEPARTURE";
  return article.reliability.transferStatus ?? "RUMOR";
}
export function claimKeys(article: ClusterArticle) {
  const valid = new Set(article.reliability.explanation.evidenceIds);
  return new Set(article.input.evidence.filter((row) => valid.has(row.id) && row.claimKey).map((row) => row.claimKey!));
}
function lineageKeys(article: ClusterArticle) {
  const valid = new Set(article.reliability.explanation.evidenceIds);
  return new Set(article.input.evidence.filter((row) => valid.has(row.id) && row.lineageKey).map((row) => row.lineageKey!));
}
function timestamp(article: ClusterArticle) { return Date.parse(article.input.article.publishedAt ?? ""); }

/** Inverted keys generate candidates; full scoring/guards decide whether to merge. */
export function candidatePairs(articles: ClusterArticle[]) {
  const index = new Map<string, number[]>(); const pairs = new Set<string>();
  articles.forEach((article, position) => {
    const keys = [...article.urls.map(normalizedStoryUrl).filter((url): url is string => Boolean(url)).map((url) => `url:${url}`), `title:${titleHash(article.input.article.titleOriginal)}`, ...article.input.article.entityScopes.map((scope) => `entity:${scope}`), ...article.managers.map((name) => `manager:${normalizeStoryText(name)}`), ...[...claimKeys(article)].map((key) => `claim:${key}`)];
    for (const key of new Set(keys)) { const previous = index.get(key) ?? []; for (const other of previous) pairs.add(`${other}:${position}`); previous.push(position); index.set(key, previous); }
  });
  return [...pairs].map((pair) => pair.split(":").map(Number) as [number, number]);
}
export function scoreStories(a: ClusterArticle, b: ClusterArticle, policy: ClusterPolicy = defaultClusterPolicy): SimilarityDecision {
  const scopesA = new Set(a.input.article.entityScopes); const scopesB = new Set(b.input.article.entityScopes);
  const hours = Math.abs(timestamp(a) - timestamp(b)) / 3600000;
  const type = a.input.article.storyType === b.input.article.storyType;
  const title = jaccard(eventTokens(a), eventTokens(b));
  const sameClaim = overlap(claimKeys(a), claimKeys(b)) > 0;
  const lineage = overlap(lineageKeys(a), lineageKeys(b)) > 0;
  const roles = ["player", "currentClub", "targetClub"] as const;
  const pairMatch = roles.every((role) => !a.transferPair[role] || !b.transferPair[role] || a.transferPair[role] === b.transferPair[role]);
  const factors = { title, entities: jaccard(scopesA, scopesB), hours: Number.isFinite(hours) ? hours : null, type, transferPair: pairMatch, lineage, claim: sameClaim };
  const result = (merge: boolean, exact: boolean, reasons: string[]): SimilarityDecision => ({ merge, exact, score: Math.round((title * 0.55 + factors.entities * 0.25 + Number(type) * 0.1 + Number(lineage || sameClaim) * 0.1) * 1000) / 1000, reasons, factors });
  const urlsA = new Set(a.urls.map(normalizedStoryUrl).filter(Boolean));
  if (b.urls.some((url) => { const value = normalizedStoryUrl(url); return value && urlsA.has(value); })) return result(true, true, ["SAME_NORMALIZED_URL"]);
  if (!Number.isFinite(hours) || hours > (policy.windows[a.input.article.storyType ?? ""] ?? policy.defaultWindowHours)) return result(false, false, ["OUTSIDE_TIME_WINDOW"]);
  if (!type) return result(false, false, ["STORY_TYPE_DIFFERS"]);
  if (a.input.article.storyType === "INJURY") {
    const details = (article: ClusterArticle) => new Set([...eventTokens(article)].filter((word) => ["knee", "ankle", "hamstring", "calf", "shoulder", "groin", "hip", "gối"].includes(word)));
    const left = details(a); const right = details(b);
    if (left.size && right.size && overlap(left, right) === 0) return result(false, false, ["DIFFERENT_INJURY_DETAIL"]);
  }
  const matchesA = [...scopesA].filter((key) => key.startsWith("match:")); const matchesB = [...scopesB].filter((key) => key.startsWith("match:"));
  if (matchesA.length && matchesB.length && !matchesA.some((key) => scopesB.has(key))) return result(false, false, ["DIFFERENT_MATCH"]);
  const playersA = [...scopesA].filter((key) => key.startsWith("player:")); const playersB = [...scopesB].filter((key) => key.startsWith("player:"));
  if (playersA.length && playersB.length && !playersA.some((key) => scopesB.has(key)) && !matchesA.some((key) => scopesB.has(key))) return result(false, false, ["DIFFERENT_PLAYER"]);
  if (a.input.article.storyType === "TRANSFER") {
    if (!pairMatch) return result(false, false, ["TRANSFER_IDENTITIES_DIFFER"]);
    if (transferStage(a) !== transferStage(b)) return result(false, false, ["TRANSFER_STAGE_DIFFERS"]);
  }
  if (titleHash(a.input.article.titleOriginal) === titleHash(b.input.article.titleOriginal)) return result(true, true, [a.input.source.id === b.input.source.id ? "SAME_SOURCE_TITLE_HASH" : "SAME_TITLE_HASH"]);
  if (a.input.article.storyType === "TRANSFER" && (factors.entities < 1 || ![...scopesA].some((key) => key.startsWith("player:")))) return result(false, false, ["TRANSFER_IDENTITIES_DIFFER"]);
  const numbersA = [...a.input.article.titleOriginal.matchAll(/\d+(?:[-:]\d+)?/g)].map((match) => match[0]).sort();
  const numbersB = [...b.input.article.titleOriginal.matchAll(/\d+(?:[-:]\d+)?/g)].map((match) => match[0]).sort();
  if (numbersA.length && numbersB.length && JSON.stringify(numbersA) !== JSON.stringify(numbersB)) return result(false, false, ["DIFFERENT_NUMERIC_CONTEXT"]);
  const shared = [...scopesA].filter((key) => !key.startsWith("league:") && scopesB.has(key));
  const strongIdentity = shared.some((key) => key.startsWith("match:") || key.startsWith("player:")) || a.managers.some((name) => b.managers.includes(name));
  const specificWords = overlap(eventTokens(a), eventTokens(b));
  if (!shared.length && !strongIdentity) return result(false, false, ["NO_SHARED_IDENTITY"]);
  if (!a.input.article.storyType || ["OTHER", "SOCIAL", "COMMUNITY"].includes(a.input.article.storyType)) return result(false, false, ["INSUFFICIENT_STORY_TYPE"]);
  const threshold = strongIdentity ? 0.48 : 0.72;
  const enoughEventWords = specificWords >= 2 || (a.input.article.storyType === "TRANSFER" && strongIdentity && specificWords >= 1);
  return result(sameClaim || (title >= threshold && enoughEventWords), false, [sameClaim ? "REVIEWED_SHARED_PROPOSITION" : title >= threshold && enoughEventWords ? "TITLE_ENTITIES_TYPE_TIME" : "INSUFFICIENT_SIMILARITY"]);
}

/** Complete-link guards prevent A~B~C chains from joining unrelated endpoints. */
export function partitionStories(articles: ClusterArticle[], policy: ClusterPolicy = defaultClusterPolicy) {
  const sorted = [...articles].sort((a, b) => (timestamp(a) || 0) - (timestamp(b) || 0) || a.input.article.id.localeCompare(b.input.article.id));
  const positions = new Map(sorted.map((article, index) => [article.input.article.id, index]));
  const candidates = new Set(candidatePairs(sorted).map(([a, b]) => `${a}:${b}`));
  const decisions = new Map<string, SimilarityDecision>();
  const decision = (a: ClusterArticle, b: ClusterArticle) => {
    const left = positions.get(a.input.article.id)!; const right = positions.get(b.input.article.id)!;
    const key = `${Math.min(left, right)}:${Math.max(left, right)}`;
    if (!candidates.has(key)) return null;
    if (!decisions.has(key)) decisions.set(key, scoreStories(sorted[Math.min(left, right)], sorted[Math.max(left, right)], policy));
    return decisions.get(key)!;
  };
  const groupPass = (input: ClusterArticle[][], exactOnly: boolean) => {
    const groups: ClusterArticle[][] = [];
    for (const incoming of input) {
      const compatible = groups.filter((group) => group.every((a) => incoming.every((b) => { const result = decision(a, b); return result?.merge && (!exactOnly || result.exact); })));
      const rank = (group: ClusterArticle[]) => {
        const results = group.flatMap((a) => incoming.map((b) => decision(a, b)!));
        return Math.max(...results.map((result) => result.reasons.includes("SAME_NORMALIZED_URL") ? 2 : result.exact ? 1 : 0)) * 10 + results.reduce((sum, result) => sum + result.score, 0) / results.length;
      };
      compatible.sort((a, b) => rank(b) - rank(a) || a[0].input.article.id.localeCompare(b[0].input.article.id));
      if (compatible[0]) compatible[0].push(...incoming); else groups.push([...incoming]);
    }
    return groups;
  };
  // Establish exact identity/title bundles before comparing any near-duplicates.
  return groupPass(groupPass(sorted.map((article) => [article]), true), false);
}
