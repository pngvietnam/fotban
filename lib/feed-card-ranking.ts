import { isRoundup } from "./feed-card-policy";

export type RankableGroup = { key: string; latestAt: string; leadTitle: string; leadPublisher: string; publishers: string[]; hasMedia: boolean };

/**
 * Editorial importance for publisher cards, not a truth or reliability score: wider independent
 * publisher coverage, media over community sources, then recency (halved weight every 6 hours).
 */
export function feedImportance(group: RankableGroup, now: Date) {
  const hours = Math.max(0, (now.getTime() - Date.parse(group.latestAt)) / 3600000);
  return new Set(group.publishers).size * 3 + (group.hasMedia ? 2 : 0) + 6 * Math.pow(0.5, hours / 6);
}

/**
 * Orders groups by importance with roundups (schedules/results/tables) last, then spreads
 * publishers: a lead publisher is not placed three times in a row while another candidate
 * is available within the next few positions. Deterministic for equal inputs.
 */
export function rankFeedGroups<T extends RankableGroup>(groups: T[], now: Date, lookahead = 6) {
  const scored = groups.map((group) => ({ group, roundup: isRoundup(group.leadTitle), score: feedImportance(group, now) }))
    .sort((a, b) => Number(a.roundup) - Number(b.roundup) || b.score - a.score || b.group.latestAt.localeCompare(a.group.latestAt) || a.group.key.localeCompare(b.group.key));
  const ordered: T[] = [];
  while (scored.length) {
    const recent = ordered.slice(-2).map((group) => group.leadPublisher);
    const crowded = (item: typeof scored[number]) => recent.length === 2 && recent.every((publisher) => publisher === item.group.leadPublisher);
    // Never pull a roundup ahead of real news just to diversify.
    const index = crowded(scored[0]) ? scored.slice(0, lookahead).findIndex((item) => !crowded(item) && item.roundup === scored[0].roundup) : 0;
    ordered.push(scored.splice(Math.max(index, 0), 1)[0].group);
  }
  return ordered;
}
