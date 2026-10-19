import type { BriefCandidate } from "../../types/morning-brief";
import { briefHash } from "../../lib/brief-policy";
import { vidId } from "./videos";

export const briefNow = new Date("2026-10-18T02:00:00Z");
export function briefStory(n = 1, changes: Partial<BriefCandidate> = {}): BriefCandidate {
  return { key: `story:${vidId(n)}`, section: "TOP_STORIES", titleVi: "Câu lạc bộ công bố dự án cộng đồng", summaryVi: "Câu lạc bộ công bố dự án mới dành cho người hâm mộ.", leagues: ["premier-league"], entityKeys: [`club:${vidId(100 + n)}`], clusterId: vidId(n), transferId: null, articleIds: [vidId(n + 20)], match: null, highlightRef: null, transferStatus: null, reliability: { label: "RELIABLE", certainty: "REPORTED", evidenceStrength: "SUPPORTING", independentSourceCount: 1, labelVi: "Nguồn đáng tin", certaintyVi: "Theo nguồn tin" }, citations: [{ evidenceId: vidId(n + 30), articleId: vidId(n + 20), sourceName: "Fixture newsroom", url: "https://fixture.example.test/story", publishedAt: "2026-10-17T12:00:00Z", language: "en", tier: "TIER_1_HIGH", licenseName: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", attribution: "Test authors" }], sourceFingerprint: briefHash({ n }), contentUpdatedAt: "2026-10-17T12:00:00Z", dateOnly: false, featured: false, seenBefore: false, ...changes };
}
