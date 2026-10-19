import type { NewsStory } from "../../types/news-ui";
import { clusterId } from "./clustering";

export const newsNow = new Date("2026-10-17T08:00:00Z");
export function newsStory(override: Partial<NewsStory> = {}): NewsStory {
  return {
    slug: `tin-${clusterId(1)}`, titleVi: "Arsenal đang quan tâm đến Player X", summaryVi: "Arsenal được cho là đang quan tâm đến Player X. Chưa có thông báo hoàn tất thương vụ.", storyType: "TRANSFER",
    publishedAt: "2026-10-16T19:00:00Z", updatedAt: "2026-10-17T07:35:00Z", dateOnly: false, featured: false,
    entities: [{ kind: "club", name: "Arsenal", initials: "ARS" }, { kind: "player", name: "Player X", initials: "PX" }], leagueSlugs: ["premier-league"],
    sources: [{ key: "fixture-source", name: "Fixture newsroom", originalTitle: "Arsenal interested in Player X", url: "https://news.example.test/story", publishedAt: "2026-10-16T19:00:00Z", dateOnly: false, language: "en", tier: "TIER_1_HIGH", licenseName: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", attribution: "Fixture authors · CC BY 4.0", revisionUrl: "https://news.example.test/revision" }],
    sourceCount: 1, independentSourceCount: 1,
    reliability: { label: "RUMOR", certainty: "POSSIBLE", evidenceStrength: "SUPPORTING", disputed: false, badge: { labelVi: "Tin đồn / Chưa xác nhận", certaintyVi: "Có khả năng", disputedVi: null } },
    transfer: { status: "INTEREST", player: "Player X", currentClub: null, targetClub: "Arsenal" }, summaryMethod: "AI", ...override,
  };
}
