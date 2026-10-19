import { briefDocumentSchema, type BriefCandidate, type BriefContentItem, type BriefDocument, type BriefInputs, type BriefRequest, type BriefWindow } from "../types/morning-brief";
import { briefHash, briefLimits, sectionLabels } from "../lib/brief-policy";

const priority = { OFFICIAL: 1, RELIABLE: .8, RUMOR: .3, SOCIAL: .1, DISPUTED: 0 };
const stages = { CONFIRMED: 4, NEGOTIATION: 3, INTEREST: 2, RUMOR: 1 };
export function rankBriefCandidate(candidate: BriefCandidate, window: BriefWindow): BriefContentItem {
  const components = { source: priority[candidate.reliability.label], recency: Math.max(0, 1 - Math.abs(Date.parse(window.cutoffAt) - Date.parse(candidate.contentUpdatedAt)) / (48 * 3600000)), relevance: 1, prominence: candidate.featured ? 1 : candidate.entityKeys.some((key) => key.startsWith("player:")) ? .5 : 0, novelty: candidate.seenBefore ? .2 : 1, corroboration: Math.min(1, candidate.reliability.independentSourceCount / 3) };
  const importanceScore = Math.round(10000 * (components.source * .3 + components.recency * .25 + components.relevance * .15 + components.prominence * .1 + components.novelty * .1 + components.corroboration * .1)) / 100;
  const { featured: _featured, seenBefore: _seen, ...item } = candidate; void _featured; void _seen;
  return { ...item, components, importanceScore };
}
function balanced(items: BriefContentItem[], limit: number, diversify: boolean) {
  const result: BriefContentItem[] = []; const remaining = [...items]; const clubs = new Map<string, number>(); const leagues = new Map<string, number>();
  while (remaining.length && result.length < limit) {
    const viable = remaining.filter((item) => !diversify || item.entityKeys.filter((key) => key.startsWith("club:")).every((key) => (clubs.get(key) ?? 0) < briefLimits.maxPerClub));
    const pool = viable.length ? viable : remaining;
    // Within similarly important stories, prefer meaningful coverage of the other league.
    const topScore = pool[0].importanceScore;
    const near = pool.filter((item) => item.importanceScore >= topScore - 10);
    const chosen = near.sort((a, b) => Math.min(...a.leagues.map((league) => leagues.get(league) ?? 0)) - Math.min(...b.leagues.map((league) => leagues.get(league) ?? 0)) || b.importanceScore - a.importanceScore || a.key.localeCompare(b.key))[0];
    result.push(chosen); remaining.splice(remaining.indexOf(chosen), 1);
    for (const key of chosen.entityKeys.filter((key) => key.startsWith("club:"))) clubs.set(key, (clubs.get(key) ?? 0) + 1);
    for (const league of chosen.leagues) leagues.set(league, (leagues.get(league) ?? 0) + 1);
  }
  return result;
}
export function buildMorningBrief(request: BriefRequest, window: BriefWindow, inputs: BriefInputs): BriefDocument {
  const unique = new Map<string, BriefCandidate>();
  for (const item of inputs.candidates) if (!unique.has(item.key)) unique.set(item.key, item);
  const ranked = [...unique.values()].map((item) => rankBriefCandidate(item, window)).sort((a, b) => b.importanceScore - a.importanceScore || b.contentUpdatedAt.localeCompare(a.contentUpdatedAt) || a.key.localeCompare(b.key));
  const sections: BriefDocument["sections"] = [];
  for (const type of ["RESULTS", "TOP_STORIES", "CLUB_PLAYER", "OFF_FIELD", "TRANSFERS", "UPCOMING"] as const) {
    let pool = ranked.filter((item) => item.section === type);
    if (type === "TRANSFERS") pool = pool.sort((a, b) => stages[b.transferStatus!] - stages[a.transferStatus!] || b.importanceScore - a.importanceScore || a.key.localeCompare(b.key));
    if (type === "RESULTS") pool.sort((a, b) => a.match!.kickoffAt.localeCompare(b.match!.kickoffAt) || a.key.localeCompare(b.key));
    if (type === "RESULTS" && pool.length > briefLimits.RESULTS) throw new Error("BRIEF_RESULTS_BOUND_EXCEEDED");
    const items = type === "RESULTS" || type === "TRANSFERS" ? pool.slice(0, briefLimits[type]) : balanced(pool, briefLimits[type], true);
    if (items.length) sections.push({ type, labelVi: sectionLabels[type], items });
  }
  const summaries = sections.flatMap((section) => section.items).filter((item) => item.section !== "UPCOMING").sort((a, b) => b.importanceScore - a.importanceScore || a.key.localeCompare(b.key));
  if (!summaries.length) summaries.push(...sections.flatMap((section) => section.items));
  const summary = balanced(summaries, briefLimits.SUMMARY, true).map((item) => ({ itemKey: item.key, textVi: item.titleVi }));
  return briefDocumentSchema.parse({ schemaVersion: "brief-v1", rankingVersion: "brief-ranking-v1", date: request.date, timezone: request.timezone, locale: "vi-VN", titleVi: `Bản tin bóng đá sáng ${request.date.split("-").reverse().join("/")}`, ...window, summary, sections, warnings: [...(summary.length < 3 ? ["SPARSE_CONTENT"] : []), ...(inputs.excluded ? ["INELIGIBLE_CONTENT_OMITTED"] : []), ...(sections.some((section) => section.type === "RESULTS") ? ["COMPLETION_TIME_UNAVAILABLE_KICKOFF_WINDOW"] : [])], method: "DETERMINISTIC" });
}
/** Exact extractive reproduction is the hallucination guard; no AI is called or trusted. */
export function validateMorningBrief(value: unknown, request: BriefRequest, window: BriefWindow, inputs: BriefInputs): BriefDocument {
  const parsed = briefDocumentSchema.parse(value); const expected = buildMorningBrief(request, window, inputs);
  if (briefHash(parsed) !== briefHash(expected)) throw new Error("UNSUPPORTED_BRIEF_CONTENT");
  const items = parsed.sections.flatMap((section) => section.items);
  const clusters = items.flatMap((item) => item.clusterId ? [item.clusterId] : []);
  if (new Set(items.map((item) => item.key)).size !== items.length || new Set(clusters).size !== clusters.length) throw new Error("DUPLICATE_BRIEF_STORY");
  for (const item of items) {
    if (!/[à-ỹđ]/iu.test(`${item.titleVi} ${item.summaryVi}`) || item.reliability.certainty === "DISPUTED" || ["DISPUTED", "SOCIAL"].includes(item.reliability.label)) throw new Error("UNPUBLISHABLE_BRIEF_ITEM");
    if (item.match?.status === "FINISHED" && (item.match.homeScore === null || item.match.awayScore === null)) throw new Error("MISSING_MATCH_SCORE");
  }
  return parsed;
}
