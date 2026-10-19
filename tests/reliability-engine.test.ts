import { describe, expect, it } from "vitest";
import { ReliabilityEngine } from "../services/reliability-engine";
import { changeText, makeOfficial, relIds, relInput, relNow, relSource } from "./fixtures/reliability";

const engine = new ReliabilityEngine();
describe("deterministic evidence-aware reliability", () => {
  it("official announcement within reviewed authority is confirmed", () => {
    const result = engine.assess(makeOfficial(relInput()), relNow);
    expect(result).toMatchObject({ label: "OFFICIAL", certainty: "CONFIRMED", evidenceStrength: "DIRECT", publishability: { eligible: true } });
    expect(result.explanation.reasons).toContain("REVIEWED_SCOPED_OFFICIAL_EVIDENCE");
  });
  it("official source outside its authority cannot confirm", () => {
    const input = makeOfficial(relInput()); input.source.authorityScopes = [`club:${relIds.otherSource}`];
    expect(engine.assess(input, relNow)).toMatchObject({ label: "RELIABLE", certainty: "REPORTED" });
  });
  it("trusted media interest remains a rumor story and possible interest, not a truth percentage", () => {
    const input = changeText(relInput(), "The club is interested in a transfer", "The club is interested in a transfer. There is no completed deal or contract announcement.", "Câu lạc bộ đang quan tâm đến chuyển nhượng", "Câu lạc bộ được cho là đang quan tâm đến chuyển nhượng."); input.article.storyType = "TRANSFER"; input.processing.uncertainty = true;
    expect(engine.assess(input, relNow)).toMatchObject({ source: { classification: "RELIABLE", score: 95 }, label: "RUMOR", certainty: "POSSIBLE", transferStatus: "INTEREST" });
  });
  it("credible active talks allow negotiation, never completion", () => {
    const input = changeText(relInput(), "The club is in talks about a transfer", "The club is in talks about a transfer, with negotiations ongoing.", "Câu lạc bộ đang đàm phán chuyển nhượng", "Câu lạc bộ đang đàm phán về thương vụ."); input.article.storyType = "TRANSFER";
    expect(engine.assess(input, relNow)).toMatchObject({ label: "RELIABLE", certainty: "REPORTED", transferStatus: "NEGOTIATION" });
  });
  it("an official signing requires new authoritative evidence", () => {
    const input = makeOfficial(changeText(relInput(), "The club has signed the player", "The club has signed the player and officially announced the completed transfer.", "Câu lạc bộ đã ký hợp đồng với cầu thủ", "Câu lạc bộ chính thức công bố hợp đồng với cầu thủ.")); input.article.storyType = "TRANSFER";
    expect(engine.assess(input, relNow).transferStatus).toBe("CONFIRMED");
    for (const item of input.evidence) item.reviewedBy = null;
    expect(engine.assess(input, relNow).transferStatus).toBe("RUMOR");
  });
  it.each(["could move", "may move", "reportedly moving", "believed to move", "considering a move", "linked with a move"])("rumor language remains speculative even with official evidence: %s", (phrase) => {
    const input = makeOfficial(changeText(relInput(), `The club ${phrase} in a transfer`, `The club ${phrase} in a transfer. No official completion is announced.`, "Câu lạc bộ có thể thực hiện chuyển nhượng", "Câu lạc bộ được cho là đang cân nhắc chuyển nhượng.")); input.article.storyType = "TRANSFER";
    expect(engine.assess(input, relNow)).toMatchObject({ label: "RUMOR", certainty: "SPECULATIVE", transferStatus: "RUMOR" });
  });
  it("rejects confirmed Vietnamese wording hiding behind an uncertainty marker", () => {
    const input = changeText(relInput(), "The club could move", "The club could move but no announcement is confirmed.", "Theo nguồn tin, câu lạc bộ đã ký hợp đồng", "Câu lạc bộ có thể chuyển nhượng.");
    expect(engine.assess(input, relNow).publishability.blockers).toContain("CERTAINTY_UPGRADE_REJECTED");
  });
  it("social content cannot confirm factual news regardless of engagement or score", () => {
    const input = makeOfficial(relInput()); input.source.type = "SOCIAL"; input.source.sourceTier = "COMMUNITY"; input.source.reliabilityScore = 100;
    const viral = { ...input, engagement: 1000000000 };
    expect(engine.assess(viral, relNow)).toMatchObject({ label: "SOCIAL", evidenceStrength: "SOCIAL_ONLY", publishability: { eligible: false } });
    expect(engine.assess(viral, relNow)).toEqual(engine.assess(input, relNow));
  });
  it("anonymous weak sources remain rumor even with high configured score", () => {
    const input = relInput(); input.source.sourceTier = "TIER_3_UNVERIFIED"; input.source.reliabilityScore = 100;
    expect(engine.assess(input, relNow)).toMatchObject({ label: "RUMOR", certainty: "SPECULATIVE", publishability: { eligible: false } });
  });
  it("a trusted publisher citing only social posts cannot launder them into factual reporting", () => {
    const input = relInput(); for (const item of input.evidence) item.kind = "SOCIAL_POST";
    expect(engine.assess(input, relNow)).toMatchObject({ label: "SOCIAL", evidenceStrength: "SOCIAL_ONLY", publishability: { eligible: false } });
  });
  it("multiple weak publishers cannot manufacture credible corroboration", () => {
    const input = relInput();
    input.evidence = input.evidence.map((item, index) => ({ ...item, lineageKey: `weak-origin:${index}`, sourceArticle: { ...item.sourceArticle!, sourceUrl: `https://weak-${index}.example.test/story`, source: relSource({ sourceTier: "TIER_3_UNVERIFIED", domain: `weak-${index}.example.test` }) } }));
    expect(engine.assess(input, relNow)).toMatchObject({ evidenceStrength: "WEAK", certainty: "REPORTED", explanation: { independentSources: 0 } });
  });
  it("multiple copied publishers count as one origin", () => {
    const input = relInput(); input.evidence.push({ ...input.evidence[0], id: relIds.otherEvidence, sourceArticleId: relIds.otherArticle, sourceArticle: { ...input.evidence[0].sourceArticle!, id: relIds.otherArticle, sourceUrl: "https://copied.example.test/story", source: relSource({ id: relIds.otherSource, domain: "copied.example.test" }) } });
    const result = engine.assess(input, relNow);
    expect(result.explanation.independentSources).toBe(1); expect(result.evidenceStrength).toBe("SUPPORTING"); expect(result.explanation.reasons).toContain("SHARED_ORIGIN_COUNTED_ONCE");
  });
  it("independent credible coverage strengthens evidence but is not confirmation", () => {
    const input = relInput(); input.evidence.push({ ...input.evidence[0], id: relIds.otherEvidence, lineageKey: `source:${relIds.otherSource}`, sourceArticleId: relIds.otherArticle, sourceArticle: { ...input.evidence[0].sourceArticle!, id: relIds.otherArticle, sourceUrl: "https://independent.example.test/story", source: relSource({ id: relIds.otherSource, domain: "independent.example.test" }) } });
    expect(engine.assess(input, relNow)).toMatchObject({ label: "RELIABLE", certainty: "HIGH_CONFIDENCE", evidenceStrength: "STRONG", explanation: { independentSources: 2 } });
  });
  it("missing lineage and unreviewed evidence never manufacture corroboration", () => {
    const input = relInput(); for (const item of input.evidence) item.lineageKey = null;
    expect(engine.assess(input, relNow).explanation.independentSources).toBe(0);
    for (const item of input.evidence) item.reviewedAt = null;
    expect(engine.assess(input, relNow).publishability.blockers).toContain("REVIEWED_EVIDENCE_REQUIRED");
  });
  it("permission-denied sources remain reliable in quality but cannot publish", () => {
    const input = makeOfficial(relInput()); input.source.permissionStatus = "RESTRICTED";
    expect(engine.assess(input, relNow)).toMatchObject({ source: { classification: "OFFICIAL", score: 95 }, label: "OFFICIAL", certainty: "CONFIRMED", permission: { usageAllowed: false }, publishability: { eligible: false } });
  });
  it("old reporting changes freshness, never source quality", () => {
    const input = relInput(); const fresh = engine.assess(input, relNow); input.article.publishedAt = "2026-10-13T00:00:00Z";
    const stale = engine.assess(input, relNow);
    expect(stale.freshness.bucket).toBe("STALE"); expect(stale.source).toEqual(fresh.source); expect(stale.label).toBe(fresh.label);
  });
  it("conflicting evidence is disputed and retains both sides", () => {
    const input = makeOfficial(relInput()); input.evidence.push({ ...input.evidence[0], id: relIds.otherEvidence, stance: "CONTRADICTS" });
    const result = engine.assess(input, relNow);
    expect(result).toMatchObject({ certainty: "DISPUTED", disputed: true, publishability: { eligible: false } });
    expect(result.explanation.evidenceIds).toContain(relIds.otherEvidence); expect(result.explanation.evidenceIds).toContain(relIds.evidence);
  });
  it("a scoped official correction can supersede a prior contradiction without deleting history", () => {
    const input = makeOfficial(relInput()); input.evidence[0].stance = "CONTRADICTS";
    input.evidence.push({ ...input.evidence[0], id: relIds.otherEvidence, stance: "SUPPORTS", supersedesId: relIds.evidence, reviewedAt: "2026-10-17T07:30:00Z" });
    const result = engine.assess(input, relNow);
    expect(result).toMatchObject({ certainty: "CONFIRMED", disputed: false, explanation: { supersededEvidenceIds: [relIds.evidence] } });
    expect(input.evidence).toHaveLength(3);
  });
  it("official denial of a reported story disputes that story, not silently confirms it", () => {
    const input = makeOfficial(relInput()); input.evidence.push({ ...input.evidence[0], id: relIds.otherEvidence, stance: "CONTRADICTS", supersedesId: relIds.evidence, reviewedAt: "2026-10-17T07:30:00Z" });
    expect(engine.assess(input, relNow)).toMatchObject({ certainty: "DISPUTED", publishability: { eligible: false } });
  });
  it("an unscoped or older correction cannot suppress inconvenient evidence", () => {
    const input = relInput(); input.evidence[0].supersedesId = relIds.summaryEvidence;
    expect(engine.assess(input, relNow).publishability.blockers).toContain("INVALID_CORRECTION");
  });
  it("an unrelated URL cannot impersonate a configured official publisher", () => {
    const input = makeOfficial(relInput());
    for (const item of input.evidence) item.sourceArticle!.sourceUrl = "https://impostor.example.test/statement";
    expect(engine.assess(input, relNow)).toMatchObject({ certainty: "REPORTED", publishability: { eligible: false } });
  });
  it("structured match result evidence stays within its mapped match domain", () => {
    const input = changeText(relInput(), "The match finished 2-1", "The match finished 2-1 after full time.", "Trận đấu kết thúc 2-1", "Trận đấu kết thúc với tỷ số 2-1."); input.article.storyType = "MATCH"; input.article.entityScopes.push(`match:${relIds.match}`);
    input.evidence = input.evidence.map((item) => ({ ...item, kind: "MATCH_DATA", sourceArticleId: null, sourceArticle: null, matchId: relIds.match, fieldPath: "fullTimeScore", excerpt: "2-1", match: { id: relIds.match, provider: "FIXTURE_PROVIDER", mapped: true, status: "FINISHED", homeScore: 2, awayScore: 1 } }));
    expect(engine.assess(input, relNow)).toMatchObject({ certainty: "CONFIRMED", evidenceStrength: "DIRECT" });
    input.article.storyType = "INJURY"; expect(engine.assess(input, relNow).certainty).not.toBe("CONFIRMED");
    input.article.storyType = "TRANSFER"; expect(engine.assess(input, relNow).transferStatus).not.toBe("CONFIRMED");
    input.article.storyType = "MATCH"; input.evidence[0].match!.mapped = false; input.evidence[1].match!.mapped = false;
    expect(engine.assess(input, relNow).evidenceStrength).toBe("WEAK");
  });
  it.each(["missing URL", "missing Vietnamese", "stale processing", "unreviewed generated claim", "manual override", "future time"])("publication gate blocks %s", (caseName) => {
    const input = relInput();
    if (caseName === "missing URL") input.article.sourceUrl = "";
    if (caseName === "missing Vietnamese") input.article.summaryVi = null;
    if (caseName === "stale processing") input.processing.validated = false;
    if (caseName === "unreviewed generated claim") input.evidence.pop();
    if (caseName === "manual override") input.article.manualOverrideAt = relNow.toISOString();
    if (caseName === "future time") input.article.publishedAt = "2030-01-01T00:00:00Z";
    expect(engine.assess(input, relNow).publishability.eligible).toBe(false);
  });
});
