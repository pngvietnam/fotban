import type { BriefContentItem, BriefDocument } from "./morning-brief";
import type { NewsEntity } from "./news-ui";
import type { TransferFacts } from "./transfers";
import type { VerifiedHighlight } from "./video-provider";

export type HomeItem = {
  item: BriefContentItem; anchor: string; href: string; storyType: string | null; entities: NewsEntity[];
  highlight: VerifiedHighlight | null;
  transfer: { player: string | null; currentClub: string | null; targetClub: string | null; facts: TransferFacts } | null;
};
export type HomepageView = {
  date: string; updatedAt: string; preview: boolean; stale: boolean; partial: boolean; staleInputs: boolean;
  summary: { textVi: string; href: string }[];
  sections: { type: BriefDocument["sections"][number]["type"]; items: HomeItem[] }[];
};
export type HomepageResult = { kind: "ready"; view: HomepageView } | { kind: "empty" } | { kind: "error" };
