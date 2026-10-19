import type { FeedCertainty, FeedLabel, FeedTransferStage } from "../lib/feed-card-policy";
import type { ClubContext } from "../services/feed-context";
import type { NewsEntity, NewsFilters } from "./news-ui";

/** Public projection of an attributed publisher card: original headline/description, never rewritten. */
export type FeedCardView = {
  slug: string; articleId: string; title: string; description: string | null;
  publisher: string; publisherSlug: string; attribution: string; url: string | null; publishedAt: string;
  label: FeedLabel; certainty: FeedCertainty; storyType: string; transferStage: FeedTransferStage | null;
  originHint: string | null; officialWording: boolean;
  entities: NewsEntity[]; leagueSlugs: string[];
  match: { slug: string; home: string; away: string; kickoffAt: string } | null;
};
export type FeedGroupView = { key: string; lead: FeedCardView; others: FeedCardView[]; latestAt: string };
export type FeedFilters = Pick<NewsFilters, "league"> & { offset: number; /** Keep only groups with a card of this story type (e.g. TRANSFER). */ storyType?: string };
export type FeedListData = { groups: FeedGroupView[]; nextOffset: number | null };
export type FeedListResult = { kind: "ready"; data: FeedListData } | { kind: "error" };
export type FeedDetailResult = { kind: "ready"; card: FeedCardView; others: FeedCardView[]; related: FeedCardView[]; context: ClubContext[] } | { kind: "not-found" } | { kind: "error" };
