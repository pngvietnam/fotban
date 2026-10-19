import { describe, expect, it } from "vitest";
import { briefDate, briefHash, briefWindow, resolveBriefRequest, prominentBriefClub } from "../lib/brief-policy";
import { buildMorningBrief, rankBriefCandidate, validateMorningBrief } from "../services/brief-builder";
import { briefNow, briefStory } from "./fixtures/briefs";
import { briefTransactionConflict } from "../services/morning-brief";

const request = resolveBriefRequest({ date: "2026-10-18" }); const window = briefWindow(request, briefNow);
describe("deterministic Vietnamese brief selection", () => {
  it("uses Vietnam 08:00 cutoff, 24-hour lookback and 24-hour upcoming horizon in UTC", () => {
    expect(window).toEqual({ windowStart: "2026-10-17T01:00:00.000Z", windowEnd: "2026-10-18T01:00:00.000Z", cutoffAt: "2026-10-18T01:00:00.000Z", upcomingEnd: "2026-10-19T01:00:00.000Z" });
    expect(briefDate(new Date("2026-10-17T18:00:00Z"))).toBe("2026-10-18");
  });
  it("supports explicit regeneration cutoff and rejects future/mismatched dates", () => {
    expect(briefWindow(resolveBriefRequest({ date: "2026-10-18", asOf: "2026-10-18T01:20:00Z" }), briefNow).windowEnd).toBe("2026-10-18T01:20:00Z");
    expect(() => briefWindow(resolveBriefRequest({ date: "2026-10-19" }), briefNow)).toThrow();
    expect(() => briefWindow(resolveBriefRequest({ date: "2026-10-18", asOf: "2026-10-17T01:20:00Z" }), briefNow)).toThrow();
    expect(() => resolveBriefRequest({ date: "2026-10-18", competitions: ["bundesliga"] })).toThrow();
  });
  it("canonical stories appear once and empty sections/community are omitted", () => {
    const story = briefStory(); const result = buildMorningBrief(request, window, { candidates: [story, story], excluded: 0 });
    expect(result.sections).toHaveLength(1); expect(result.sections[0].items).toHaveLength(1); expect(result.sections[0].type).toBe("TOP_STORIES");
    expect(result.summary).toEqual([{ itemKey: story.key, textVi: story.titleVi }]); expect(result.sections.some((section) => section.type === "COMMUNITY")).toBe(false);
  });
  it("official evidence outranks similarly fresh weak rumor and preserves uncertainty", () => {
    const rumor = briefStory(1, { titleVi: "Arsenal có thể chiêu mộ cầu thủ", summaryVi: "Arsenal được cho là đang quan tâm đến cầu thủ.", reliability: { ...briefStory().reliability, label: "RUMOR", certainty: "POSSIBLE" } });
    const official = briefStory(2, { reliability: { ...briefStory().reliability, label: "OFFICIAL", certainty: "CONFIRMED" } });
    const result = validateMorningBrief(buildMorningBrief(request, window, { candidates: [rumor, official], excluded: 0 }), request, window, { candidates: [rumor, official], excluded: 0 });
    expect(result.sections[0].items[0].key).toBe(official.key); expect(result.sections[0].items[1].titleVi).toContain("có thể");
  });
  it("provides league balance when similarly meaningful stories exist", () => {
    const candidates = [briefStory(1), briefStory(2), briefStory(3, { leagues: ["la-liga"] })];
    const result = buildMorningBrief(request, window, { candidates, excluded: 0 });
    expect(result.sections[0].items.slice(0,2).flatMap((item) => item.leagues)).toContain("la-liga");
  });
  it("preserves source provenance and has no mandatory AI dependency", () => {
    const story = briefStory(); const result = buildMorningBrief(request, window, { candidates: [story], excluded: 0 });
    expect(result.method).toBe("DETERMINISTIC"); expect(result.sections[0].items[0].citations).toEqual(story.citations);
    expect(result.sections.find((section) => section.type === "TRANSFERS")).toBeUndefined();
  });
  it("rejects malformed, invented, duplicated or rumor-upgraded generated output", () => {
    const inputs = { candidates: [briefStory()], excluded: 0 }; const result = buildMorningBrief(request, window, inputs);
    for (const mutate of [(copy: typeof result) => { copy.summary[0].textVi = "Arsenal thắng 9–0"; }, (copy: typeof result) => { copy.sections[0].items[0].summaryVi = "Nguồn tin đã xác nhận thương vụ."; }, (copy: typeof result) => { copy.sections[0].items.push(copy.sections[0].items[0]); }]) {
      const copy = structuredClone(result); mutate(copy); expect(() => validateMorningBrief(copy, request, window, inputs)).toThrow();
    }
    expect(() => validateMorningBrief({ arbitrary: true }, request, window, inputs)).toThrow();
  });
  it("does not pad sparse data or fabricate community/transfer activity", () => {
    const result = buildMorningBrief(request, window, { candidates: [], excluded: 2 });
    expect(result.sections).toEqual([]); expect(result.summary).toEqual([]); expect(result.warnings).toContain("SPARSE_CONTENT");
    expect(JSON.stringify(result)).not.toContain("người hâm mộ cho rằng");
  });
  it("uses explainable normalized ranking and a novelty penalty, never a truth percentage", () => {
    const first = rankBriefCandidate(briefStory(), window); const repeated = rankBriefCandidate(briefStory(1, { seenBefore: true }), window);
    expect(first.importanceScore).toBeGreaterThan(repeated.importanceScore); expect(first.components).toHaveProperty("corroboration");
    expect(briefHash(first)).toBe(briefHash(rankBriefCandidate(briefStory(), window)));
    expect(prominentBriefClub("club-internal-uuid", "Manchester United FC")).toBe(true);
    expect(prominentBriefClub("unknown", "Unreviewed Fixture Club")).toBe(false);
  });
  it("recognizes nested Prisma adapter serialization conflicts without retrying ordinary failures", () => {
    expect(briefTransactionConflict({ code: "P2010", meta: { driverAdapterError: { cause: { kind: "TransactionWriteConflict" } } } })).toBe(true);
    expect(briefTransactionConflict({ cause: { originalCode: "40001" } })).toBe(true);
    expect(briefTransactionConflict({ code: "42804" })).toBe(false);
    expect(briefTransactionConflict(new Error("secret connection details"))).toBe(false);
  });
});
