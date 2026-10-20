import type { FeedCardView, FeedGroupView } from "../types/feed-card";
import { isRoundup } from "./feed-card-policy";

export type MatchReview = { kind: "review" | "preview"; group: FeedGroupView };
type ReviewMatch = { slug: string; kickoffAt: Date | string; status: string; homeClubId?: string; awayClubId?: string };

const minute = 60_000;
/** Headlines that read like a result report: a score ("2-5") or a result verb. */
const reportLike = /\b\d{1,2}\s*[-–]\s*\d{1,2}\b|thắng|hòa|hoà|thua|đánh bại|vượt qua|vượt ải|ngược dòng|cầm chân|gục ngã|đè bẹp|hủy diệt|chia điểm|bất phân thắng bại/iu;
/**
 * The publisher story to lead the match page with, like FotMob's "Match review": a story about
 * this match (linked to it, or naming both clubs) published after kickoff for a finished match,
 * or in the three days before kickoff otherwise. Schedule/result roundups never qualify.
 * Ranked by link to the match, then (for a finished match) a result-like headline, then how many
 * publishers carried it, then recency.
 */
export function pickMatchReview(groups: FeedGroupView[], match: ReviewMatch): MatchReview | null {
  const kickoff = new Date(match.kickoffAt).getTime();
  const finished = match.status === "FINISHED";
  const about = (card: FeedCardView) => card.match?.slug === match.slug
    || Boolean(match.homeClubId && match.awayClubId && card.entities.some((entity) => entity.id === match.homeClubId) && card.entities.some((entity) => entity.id === match.awayClubId));
  const inWindow = (card: FeedCardView) => {
    const at = Date.parse(card.publishedAt);
    return finished ? at >= kickoff + 45 * minute && at <= kickoff + 48 * 60 * minute : at < kickoff && at >= kickoff - 72 * 60 * minute;
  };
  const scored = groups.flatMap((group) => {
    const cards = [group.lead, ...group.others].filter((card) => about(card) && inWindow(card) && !isRoundup(card.title));
    if (!cards.length) return [];
    const linked = cards.some((card) => card.match?.slug === match.slug);
    const report = finished && cards.some((card) => reportLike.test(card.title));
    return [{ group, linked, report, publishers: new Set([group.lead, ...group.others].map((card) => card.publisher)).size, latest: Math.max(...cards.map((card) => Date.parse(card.publishedAt))) }];
  }).sort((a, b) => Number(b.linked) - Number(a.linked) || Number(b.report) - Number(a.report) || b.publishers - a.publishers || b.latest - a.latest || a.group.key.localeCompare(b.group.key));
  return scored[0] ? { kind: finished ? "review" : "preview", group: scored[0].group } : null;
}
