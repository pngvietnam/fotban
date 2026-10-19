import type { ReliabilityResult } from "./reliability";

export type NewsFilters = { league: "all" | "premier-league" | "la-liga"; offset: number };
export type NewsEntity = { id?: string; kind: "club" | "player" | "league"; name: string; initials: string; crestUrl?: string | null; tla?: string | null };
export type NewsSourceView = {
  key: string; sourceId?: string; name: string; originalTitle: string; url: string | null;
  publishedAt: string | null; dateOnly: boolean; language: string; tier: string;
  licenseName: string; licenseUrl: string | null; attribution: string; revisionUrl: string | null;
};
export type NewsStory = {
  slug: string; titleVi: string; summaryVi: string; storyType: string;
  publishedAt: string; updatedAt: string; dateOnly: boolean; featured: boolean;
  entities: NewsEntity[]; leagueSlugs: string[]; sources: NewsSourceView[]; sourceCount: number; independentSourceCount: number;
  reliability: Pick<ReliabilityResult, "label" | "certainty" | "disputed" | "evidenceStrength" | "badge">;
  transfer: { status: NonNullable<ReliabilityResult["transferStatus"]>; player: string | null; currentClub: string | null; targetClub: string | null } | null;
  summaryMethod: "AI" | "EXTRACTIVE";
};
export type NewsListData = { stories: NewsStory[]; nextOffset: number | null };
export type NewsListResult = { kind: "ready"; data: NewsListData } | { kind: "error" };
export type NewsDetailResult = { kind: "ready"; story: NewsStory } | { kind: "not-found" } | { kind: "error" };
