import { createHash } from "node:crypto";
import type { ClusterArticle } from "../../types/story-clustering";
import { ReliabilityEngine } from "../../services/reliability-engine";
import { relInput, relNow } from "./reliability";

export const clusterId = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const clubScope = `club:${clusterId(900)}`; export const playerScope = `player:${clusterId(901)}`;
export function clusterFixture(n: number, title = "Arsenal interested in Player X"): ClusterArticle {
  const input = relInput(); const id = clusterId(n); const sourceId = clusterId(n + 100);
  input.source = { ...input.source, id: sourceId, name: `Fixture newsroom ${n}`, domain: `news-${n}.example.test` };
  input.article = { ...input.article, id, sourceUrl: `https://news-${n}.example.test/story/${n}`, canonicalUrl: `https://news-${n}.example.test/story/${n}`, titleOriginal: title, excerptOriginal: `${title}. Arsenal are interested in a possible transfer involving Player X.`, titleVi: "Arsenal đang quan tâm đến Player X", summaryVi: "Arsenal được cho là đang quan tâm đến Player X.", storyType: "TRANSFER", entityScopes: [clubScope, playerScope] };
  input.processing.id = clusterId(n + 1000); input.processing.uncertainty = true;
  input.evidence = input.evidence.map((item, index) => ({ ...item, id: clusterId(n + 10000 + index * 1000), articleId: id, sourceArticleId: id, claim: index ? input.article.summaryVi! : input.article.titleVi!, excerpt: input.article.excerptOriginal, claimKey: `fixture-proposition-${n}`, lineageKey: `source:${sourceId}`, sourceArticle: { id, sourceUrl: input.article.sourceUrl, text: `${title}\n${input.article.excerptOriginal}`, usageAllowed: true, source: input.source } }));
  return refreshFixture({ input, reliability: new ReliabilityEngine().assess(input, relNow), fingerprint: "", clusterId: null, collectedAt: "2026-10-17T06:00:00Z", urls: [input.article.sourceUrl], transferPair: { player: clusterId(901), currentClub: null, targetClub: clusterId(900) }, managers: [], identityNames: ["Arsenal", "Player X"] });
}
export function refreshFixture(article: ClusterArticle) {
  article.reliability = new ReliabilityEngine().assess(article.input, relNow);
  article.fingerprint = createHash("sha256").update(JSON.stringify(article.input)).digest("hex");
  return article;
}
