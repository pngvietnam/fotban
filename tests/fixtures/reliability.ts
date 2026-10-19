import type { ReliabilityEvidence, ReliabilityInput, ReliabilitySource } from "../../types/reliability";

// Entirely synthetic test-only records, not registry entries or production data.
export const relNow = new Date("2026-10-17T08:00:00Z");
export const relIds = {
  article: "331b2632-2b61-4c09-855a-76338893097e", source: "c21f2caa-a423-44ba-b497-aa3e169cc335", club: "366a1ae4-c928-4714-99bd-5a64539dedf2",
  match: "cfba229b-d0b8-462e-8eb6-9a3f1acf60e2", run: "48042e78-1b58-4bbc-9863-a5da15129de5", evidence: "24c8a2c5-e70e-4f2d-bbfe-61fdca13e1a9", summaryEvidence: "83c64d55-235e-43cc-829d-7f4c9ec1a5f9",
  otherSource: "cb76f4b8-3b52-47cf-b094-1edc4e199a7a", otherArticle: "0436f1d3-b923-4410-8bab-2b162e3d25ea", otherEvidence: "252fb03e-6598-46bc-aef8-8d803783dd14",
};
export const relSource = (override: Partial<ReliabilitySource> = {}): ReliabilitySource => ({ id: relIds.source, name: "Fixture trusted newsroom", domain: "news.example.test", type: "PUBLICATION", sourceTier: "TIER_1_HIGH", reliabilityScore: 95, official: false, enabled: true, rationale: "Fixture-only editorial review", reviewer: "Fixture editor", reviewedAt: "2026-10-16T00:00:00Z", authorityScopes: [], permissionStatus: "ALLOWED", termsReviewed: true, ingestionAllowed: true, permissionReference: "https://news.example.test/terms", language: "en", country: "GB", ...override });
export function relInput(): ReliabilityInput {
  const source = relSource();
  const article: ReliabilityInput["article"] = { id: relIds.article, sourceUrl: "https://news.example.test/story", canonicalUrl: "https://news.example.test/story", titleOriginal: "The club has announced a community project", excerptOriginal: "The club has announced a community project for local supporters. The project opens this season.", titleVi: "Câu lạc bộ công bố dự án cộng đồng", summaryVi: "Câu lạc bộ công bố dự án mới dành cho người hâm mộ địa phương.", storyType: "OFF_FIELD", publishedAt: "2026-10-17T06:00:00Z", updatedAt: "2026-10-17T06:10:00Z", entityScopes: [`club:${relIds.club}`], permissionAllowed: true, publicationStatus: "DRAFT", manualOverrideAt: null };
  const base: ReliabilityEvidence = { id: relIds.evidence, articleId: article.id, claim: article.titleVi!, sourceArticleId: article.id, matchId: null, fieldPath: null, locator: "lead", excerpt: article.excerptOriginal, kind: "ARTICLE_SOURCE", stance: "SUPPORTS", claimKey: "fixture-project-announcement", lineageKey: `source:${source.id}`, authorityScope: null, reviewedBy: "Fixture editor", reviewedAt: "2026-10-17T07:00:00Z", supersedesId: null, sourceArticle: { id: article.id, sourceUrl: article.sourceUrl, text: `${article.titleOriginal}\n${article.excerptOriginal}`, usageAllowed: true, source }, match: null };
  return { article, source, processing: { id: relIds.run, createdAt: "2026-10-17T06:05:00Z", validated: true, uncertainty: false, errors: [] }, evidence: [base, { ...base, id: relIds.summaryEvidence, claim: article.summaryVi! }] };
}
export function makeOfficial(input: ReliabilityInput) {
  input.source = relSource({ type: "OFFICIAL", official: true, sourceTier: "TIER_0_OFFICIAL", authorityScopes: [...input.article.entityScopes] });
  input.evidence = input.evidence.map((item) => ({ ...item, kind: "OFFICIAL_STATEMENT", authorityScope: input.article.entityScopes[0], sourceArticle: { ...item.sourceArticle!, source: input.source } }));
  return input;
}
export function changeText(input: ReliabilityInput, titleOriginal: string, excerptOriginal: string, titleVi: string, summaryVi: string) {
  input.article = { ...input.article, titleOriginal, excerptOriginal, titleVi, summaryVi };
  input.evidence = input.evidence.map((item, index) => ({ ...item, claim: index === 0 ? titleVi : summaryVi, excerpt: excerptOriginal, sourceArticle: { ...item.sourceArticle!, text: `${titleOriginal}\n${excerptOriginal}` } }));
  return input;
}
