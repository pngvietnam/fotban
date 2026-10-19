import { describe, expect, it } from "vitest";
import { candidatePairs, normalizedStoryUrl, partitionStories, scoreStories, transferStage } from "../services/story-similarity";
import { canonicalizeStory, publicStoryCandidate } from "../services/story-canonicalization";
import { defaultClusterPolicy } from "../types/story-clustering";
import { clusterFixture, clusterId, refreshFixture } from "./fixtures/clustering";

describe("deterministic story similarity and canonicalization", () => {
  it("normalizes safe duplicate URLs without discarding meaningful query parameters", () => {
    expect(normalizedStoryUrl("https://news.example.test/a?b=2&utm_source=test&a=1#part")).toBe("https://news.example.test/a?a=1&b=2");
    expect(normalizedStoryUrl("https://news.example.test/a?id=2")).not.toBe(normalizedStoryUrl("https://news.example.test/a?id=3"));
    expect(normalizedStoryUrl("javascript:alert(1)")).toBeNull();
    expect(normalizedStoryUrl("https://user:password@example.test/")).toBeNull();
  });
  it("exact normalized URLs cluster without deleting either source record", () => {
    const a = clusterFixture(1); const b = clusterFixture(2); b.urls = [`${a.urls[0]}?utm_source=fixture`];
    expect(scoreStories(a, b)).toMatchObject({ merge: true, exact: true, reasons: ["SAME_NORMALIZED_URL"] });
    expect(partitionStories([a, b])[0]).toHaveLength(2);
  });
  it("title hashes and same-source duplicates are explicit signals", () => {
    const a = clusterFixture(1); const b = clusterFixture(2, "ARSENAL interested in Player X!");
    expect(scoreStories(a, b)).toMatchObject({ merge: true, exact: true, reasons: ["SAME_TITLE_HASH"] });
    b.input.source.id = a.input.source.id;
    expect(scoreStories(a, b).reasons).toContain("SAME_SOURCE_TITLE_HASH");
  });
  it("exact URL bundles are established before near-duplicate grouping", () => {
    const a = clusterFixture(1, "Arsenal Player X knee injury update"); const b = clusterFixture(2, "Arsenal Player X knee injury recovery"); const c = clusterFixture(3);
    a.input.article.storyType = "INJURY"; b.input.article.storyType = "INJURY"; c.urls = [...a.urls];
    const groups = partitionStories([a, b, c]);
    expect(groups).toHaveLength(2); expect(groups.find((group) => group.includes(a))).toContain(c); expect(groups.find((group) => group.includes(a))).not.toContain(b);
  });
  it("near headlines for the same transfer interest cluster deterministically", () => {
    const articles = [clusterFixture(1), clusterFixture(2, "Arsenal monitoring Player X"), clusterFixture(3, "Arsenal contact Player X agent")];
    expect(partitionStories(articles)).toHaveLength(1);
    expect(partitionStories([...articles].reverse()).map((group) => group.map((member) => member.input.article.id))).toEqual(partitionStories(articles).map((group) => group.map((member) => member.input.article.id)));
    expect(candidatePairs(articles)).toHaveLength(3);
  });
  it("same player with unrelated event/type does not cluster", () => {
    const a = clusterFixture(1); const b = clusterFixture(2, "Player X suffers ankle injury at Arsenal"); b.input.article.storyType = "INJURY";
    expect(scoreStories(a, b).merge).toBe(false);
  });
  it("same club without matching event meaning is insufficient", () => {
    const a = clusterFixture(1, "Arsenal launch charity project"); const b = clusterFixture(2, "Arsenal announce stadium expansion");
    for (const item of [a, b]) { item.input.article.storyType = "CLUB"; item.input.article.entityScopes = [item.input.article.entityScopes[0]]; }
    expect(scoreStories(a, b).merge).toBe(false);
  });
  it("entity names themselves do not masquerade as shared event words", () => {
    const a = clusterFixture(1, "Arsenal Player X suffers knee injury"); const b = clusterFixture(2, "Arsenal Player X suffers ankle injury");
    a.input.article.storyType = "INJURY"; b.input.article.storyType = "INJURY";
    expect(scoreStories(a, b).merge).toBe(false);
  });
  it("the same league is not a shared story identity", () => {
    const a = clusterFixture(1, "Arsenal launches charity project"); const b = clusterFixture(2, "Chelsea launches charity project");
    for (const item of [a, b]) item.input.article.storyType = "CLUB";
    a.input.article.entityScopes = [`club:${clusterId(900)}`, `league:${clusterId(950)}`]; b.input.article.entityScopes = [`club:${clusterId(902)}`, `league:${clusterId(950)}`]; b.identityNames = ["Chelsea"];
    expect(scoreStories(a, b).merge).toBe(false);
  });
  it("different players at the same club do not merge for the same generic event wording", () => {
    const a = clusterFixture(1, "Arsenal Player X suffers knee injury"); const b = clusterFixture(2, "Arsenal Player Y suffers knee injury");
    a.input.article.storyType = "INJURY"; b.input.article.storyType = "INJURY"; b.input.article.entityScopes[1] = `player:${clusterId(902)}`; b.identityNames = ["Arsenal", "Player Y"];
    expect(scoreStories(a, b).reasons).toContain("DIFFERENT_PLAYER");
  });
  it.each(["Arsenal submit bid for Player X", "Arsenal in talks with Player X", "Arsenal has signed Player X"])("transfer stages stay separate: %s", (title) => {
    expect(scoreStories(clusterFixture(1), clusterFixture(2, title))).toMatchObject({ merge: false, reasons: ["TRANSFER_STAGE_DIFFERS"] });
  });
  it("different target clubs never merge because the player matches", () => {
    const a = clusterFixture(1); const b = clusterFixture(2, "Chelsea interested in Player X"); b.transferPair.targetClub = clusterId(902); b.input.article.entityScopes[0] = `club:${clusterId(902)}`;
    expect(scoreStories(a, b).merge).toBe(false);
  });
  it("old stories do not merge solely because their identity/title matches", () => {
    const a = clusterFixture(1); const b = clusterFixture(2); b.input.article.publishedAt = "2026-09-01T00:00:00Z";
    expect(scoreStories(a, b).reasons).toContain("OUTSIDE_TIME_WINDOW");
    expect(partitionStories([a, b])).toHaveLength(2);
  });
  it("windows are configurable and missing publication time is conservative", () => {
    const a = clusterFixture(1); const b = clusterFixture(2); b.input.article.publishedAt = "2026-10-14T06:00:00Z";
    expect(scoreStories(a, b).merge).toBe(true);
    expect(scoreStories(a, b, { ...defaultClusterPolicy, windows: { TRANSFER: 24 } }).merge).toBe(false);
    b.input.article.publishedAt = null; expect(scoreStories(a, b).merge).toBe(false);
  });
  it("different linked matches cannot merge via shared clubs", () => {
    const a = clusterFixture(1, "Arsenal wins match 2-1"); const b = clusterFixture(2, "Arsenal wins match 2-1");
    for (const [index, article] of [a, b].entries()) { article.input.article.storyType = "MATCH"; article.input.article.entityScopes.push(`match:${clusterId(300 + index)}`); }
    expect(scoreStories(a, b).merge).toBe(false);
  });
  it("copied origins count once; independent publishers are still distinct sources", () => {
    const a = clusterFixture(1); const b = clusterFixture(2);
    expect(canonicalizeStory([a, b])).toMatchObject({ articleCount: 2, sourceCount: 2, independentSourceCount: 2, strongestEvidence: "STRONG" });
    b.input.evidence.forEach((item) => { item.lineageKey = a.input.evidence[0].lineageKey; }); refreshFixture(b);
    expect(canonicalizeStory([a, b])).toMatchObject({ sourceCount: 2, independentSourceCount: 1, strongestEvidence: "SUPPORTING", certainty: "POSSIBLE" });
  });
  it("canonical title and summary are an exact paired copy, never synthesized facts", () => {
    const a = clusterFixture(1); const b = clusterFixture(2); b.input.article.titleVi = "Arsenal được cho là theo dõi Player X";
    b.input.evidence[0].claim = b.input.article.titleVi; refreshFixture(b);
    const snapshot = canonicalizeStory([a, b]);
    const member = [a, b].find((item) => item.input.article.id === snapshot.representativeArticleId)!;
    expect(snapshot.headlineVi).toBe(member.input.article.titleVi); expect(snapshot.summaryVi).toBe(member.input.article.summaryVi);
    expect(snapshot.decisions[0].factors).toHaveProperty("title");
    expect(publicStoryCandidate(clusterId(500), snapshot)?.clusterId).toBe(clusterId(500));
  });
  it("restricted articles cannot lend canonical text, eligibility or source links", () => {
    const a = clusterFixture(1); const b = clusterFixture(2); b.input.source.permissionStatus = "RESTRICTED"; refreshFixture(b);
    const snapshot = canonicalizeStory([a, b]);
    expect(snapshot).toMatchObject({ articleCount: 2, sourceCount: 1, representativeArticleId: a.input.article.id });
    expect(snapshot.sources).toHaveLength(1); expect(snapshot.sources[0].articleId).toBe(a.input.article.id);
    a.input.source.permissionStatus = "RESTRICTED"; refreshFixture(a);
    expect(canonicalizeStory([a, b])).toMatchObject({ headlineVi: null, summaryVi: null, eligible: false });
  });
  it("an allowed but untranslated/unreviewed article does not inherit eligibility from a cluster", () => {
    const a = clusterFixture(1); a.input.article.titleVi = null; a.input.article.summaryVi = null; refreshFixture(a);
    const snapshot = canonicalizeStory([a]); expect(snapshot.eligible).toBe(false); expect(publicStoryCandidate(clusterId(500), snapshot)).toBeNull();
  });
  it("opposed departure reports group but create DISPUTED without selecting a factual winner", () => {
    const a = clusterFixture(1, "Arsenal Player X will leave"); const b = clusterFixture(2, "Arsenal Player X staying");
    expect(scoreStories(a, b).merge).toBe(true);
    expect(canonicalizeStory([a, b])).toMatchObject({ disputed: true, certainty: "DISPUTED", headlineVi: null, summaryVi: null, eligible: false });
  });
  it("reviewed conflicting evidence also marks the cluster disputed", () => {
    const a = clusterFixture(1); a.input.evidence[0].stance = "CONTRADICTS"; refreshFixture(a);
    expect(canonicalizeStory([a])).toMatchObject({ disputed: true, certainty: "DISPUTED", eligible: false });
  });
  it("a manual mixed-stage merge cannot silently erase the stage distinction", () => {
    const a = clusterFixture(1); const b = clusterFixture(2, "Arsenal submits bid for Player X");
    const snapshot = canonicalizeStory([a, b]);
    expect(snapshot.transferStages).toEqual(["BID", "INTEREST"]); expect(snapshot.blockers).toContain("MIXED_TRANSFER_STAGES"); expect(snapshot.eligible).toBe(false);
    expect(transferStage(a)).toBe("INTEREST");
  });
  it("manager mentions can generate candidates without creating manager entities", () => {
    const a = clusterFixture(1, "Arthur Coach discusses tactical pressing system"); const b = clusterFixture(2, "Arthur Coach discusses tactical pressing system today");
    for (const item of [a, b]) { item.input.article.storyType = "TACTICAL"; item.input.article.entityScopes = []; item.managers = ["arthur coach"]; }
    expect(candidatePairs([a, b])).toHaveLength(1); expect(scoreStories(a, b).merge).toBe(true);
  });
});
