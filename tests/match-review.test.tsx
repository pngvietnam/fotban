import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { pickMatchReview } from "../lib/match-review";
import { MatchDetailView } from "../components/matches/match-detail";
import type { FeedCardView, FeedGroupView } from "../types/feed-card";
import type { MatchDetail } from "../types/match-ui";
import { uiDetail, uiMatch, uiNow } from "./fixtures/match-ui";

const home = "11111111-1111-4111-8111-111111111111"; const away = "22222222-2222-4222-8222-222222222222";
const kickoff = "2026-10-17T10:30:00Z";
const card = (title: string, publishedAt: string, overrides: Partial<FeedCardView> = {}): FeedCardView => ({
  slug: `bao-${title.length}`, articleId: title, title, description: "Mô tả", publisher: "VnExpress Sport", publisherSlug: "vnexpress-sport", attribution: "VnExpress", url: null, publishedAt,
  label: "MEDIA", certainty: "REPORTED", storyType: "MATCH", transferStage: null, originHint: null, officialWording: false, image: null,
  entities: [{ id: home, kind: "club", name: "Everton", initials: "EVE" }, { id: away, kind: "club", name: "Chelsea", initials: "CHE" }], leagueSlugs: ["premier-league"], match: null, ...overrides,
});
const group = (key: string, lead: FeedCardView, others: FeedCardView[] = []): FeedGroupView => ({ key, lead, others, latestAt: lead.publishedAt });
const match = { slug: "everton-chelsea", kickoffAt: kickoff, status: "FINISHED", homeClubId: home, awayClubId: away };

describe("pickMatchReview", () => {
  it("prefers a result-like report about both clubs after the match over commentary with more publishers", () => {
    const commentary = group("a", card("Alonso khen hàng thủ Chelsea", "2026-10-17T14:00:00Z"), [card("Alonso khen hàng thủ", "2026-10-17T15:00:00Z", { publisher: "Dân trí" })]);
    const report = group("b", card("Neto lập cú đúp, Chelsea thắng Everton 2-0", "2026-10-17T12:40:00Z"));
    expect(pickMatchReview([commentary, report], match)?.group.key).toBe("b");
    expect(pickMatchReview([commentary, report], match)?.kind).toBe("review");
  });
  it("puts a story linked to the match first and ignores roundups, stories outside the window and stories about one club", () => {
    const linked = group("linked", card("Nhìn lại trận đấu", "2026-10-17T13:00:00Z", { match: { slug: "everton-chelsea", home: "Everton", away: "Chelsea", kickoffAt: kickoff } }));
    const result = group("result", card("Chelsea thắng 2-0", "2026-10-17T12:40:00Z"));
    expect(pickMatchReview([result, linked], match)?.group.key).toBe("linked");
    const roundup = group("roundup", card("Kết quả bóng đá hôm nay: Everton 0-2 Chelsea", "2026-10-17T13:00:00Z"));
    const tooEarly = group("early", card("Chelsea thắng 2-0", "2026-10-17T10:50:00Z"));
    const oneClub = group("one", card("Chelsea thắng 2-0", "2026-10-17T13:00:00Z", { entities: [{ id: away, kind: "club", name: "Chelsea", initials: "CHE" }] }));
    expect(pickMatchReview([roundup, tooEarly, oneClub], match)).toBeNull();
  });
  it("shows a preview from the three days before an upcoming match", () => {
    const preview = group("p", card("Everton đón Chelsea: thử thách lớn", "2026-10-16T08:00:00Z"));
    expect(pickMatchReview([preview], { ...match, status: "SCHEDULED" })).toMatchObject({ kind: "preview" });
    expect(pickMatchReview([group("old", card("Everton gặp Chelsea", "2026-10-12T08:00:00Z"))], { ...match, status: "SCHEDULED" })).toBeNull();
  });
});

describe("facts tab", () => {
  const stat = (metric: string, value: string, club: string) => ({ metric, value, unit: null, club: { id: club, name: club }, player: null });
  const detail = (overrides: Partial<MatchDetail> = {}) => uiDetail({ ...uiMatch({ homeClub: { id: home, name: "Everton FC", shortName: "Everton" }, awayClub: { id: away, name: "Chelsea FC", shortName: "Chelsea" } }), events: [], stats: [], ...overrides });
  it("leads with the match review, then the top statistics with a possession bar", () => {
    const review = { kind: "review" as const, group: group("b", card("Neto lập cú đúp, Chelsea thắng Everton 2-0", "2026-10-15T23:00:00Z"), [card("Chelsea thắng", "2026-10-15T23:10:00Z", { publisher: "Dân trí" })]) };
    const stats = [stat("possession", "0.47", home), stat("possession", "0.53", away), stat("expected_goals", "0.43", home), stat("expected_goals", "1.47", away),
      stat("total_passes", "400", home), stat("successful_passes", "320", home), stat("total_passes", "500", away), stat("successful_passes", "450", away), stat("fouls", "12", home), stat("fouls", "9", away)];
    const $ = load(renderToStaticMarkup(<MatchDetailView match={detail({ stats })} now={uiNow} review={review} />));
    const headings = $("h2").map((_, node) => $(node).text()).get();
    expect(headings.slice(0, 2)).toEqual(["Tường thuật trận đấu", "Thông số nổi bật"]);
    expect($("#match-review").parent().text()).toContain("Cùng đưa tin: Dân trí");
    expect($("[aria-label='Kiểm soát bóng: 47% - 53%']")).toHaveLength(1);
    expect($("[aria-label='Bàn thắng kỳ vọng (xG): 0.43 - 1.47']")).toHaveLength(1);
    expect($("[aria-label='Chuyền thành công: 320 (80%) - 450 (90%)']")).toHaveLength(1);
    expect($("#match-top-stats").parent().find("a").attr("href")).toBe("/match/fixture-alpha-beta?tab=thong-ke");
  });
  it("leaves both blocks out when there is no story and no figures", () => {
    const $ = load(renderToStaticMarkup(<MatchDetailView match={detail()} now={uiNow} />));
    expect($("#match-review")).toHaveLength(0); expect($("#match-top-stats")).toHaveLength(0);
  });
});
