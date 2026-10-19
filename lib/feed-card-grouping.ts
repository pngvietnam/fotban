import { isMatchReport } from "./feed-card-policy";

export type GroupableCard = {
  articleId: string; sourceId: string; publishedAt: Date; title: string;
  /** Linked club/player IDs (league links are too broad to identify a story). */
  entityIds: string[]; matchId: string | null; transferStage: string | null;
};

const stop = new Set("và của cho với trong tại khi đã đang sẽ được bị là có không này đó một những các từ trên dưới sau trước về để vì nhưng còn thì mà lại vẫn rất hơn nhất cũng chỉ như the a of".split(" "));
const words = (text: string) => new Set(text.normalize("NFKC").toLocaleLowerCase("vi").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter((word) => word && !stop.has(word)));
const jaccard = (a: Set<string>, b: Set<string>) => {
  const shared = [...a].filter((word) => b.has(word)).length;
  return a.size + b.size ? shared / (a.size + b.size - shared) : 0;
};
const normalizedTitle = (title: string) => [...words(title)].join(" ");

/**
 * Whether two publisher cards report the same event. Conservative: different angles on one
 * match (interview, controversy, ratings) stay separate; only plain result reports are merged
 * by match, otherwise a shared club/player plus clearly overlapping headline wording is needed.
 */
export function sameFeedStory(a: GroupableCard, b: GroupableCard, maxHours = 36) {
  // One publisher's two articles are two angles, never duplicates of each other.
  if (a.sourceId === b.sourceId) return false;
  if (Math.abs(a.publishedAt.getTime() - b.publishedAt.getTime()) > maxHours * 3600000) return false;
  if (a.transferStage !== b.transferStage) return false;
  if (normalizedTitle(a.title) === normalizedTitle(b.title)) return true;
  if (a.matchId && a.matchId === b.matchId && isMatchReport(a.title) && isMatchReport(b.title)) return true;
  const sharedEntity = a.entityIds.some((id) => b.entityIds.includes(id));
  return sharedEntity && jaccard(words(a.title), words(b.title)) >= 0.34;
}

/**
 * Complete-linkage grouping in stable time/ID order: a card joins a group only if it matches
 * every member (A~B and B~C does not imply A~C). The group key is its earliest member's ID.
 */
export function groupFeedCards(cards: GroupableCard[]) {
  const ordered = [...cards].sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime() || a.articleId.localeCompare(b.articleId));
  const groups: GroupableCard[][] = [];
  for (const card of ordered) {
    const group = groups.find((members) => members.every((member) => sameFeedStory(member, card)));
    if (group) group.push(card); else groups.push([card]);
  }
  return new Map(groups.flatMap((members) => members.map((member) => [member.articleId, members[0].articleId] as const)));
}
