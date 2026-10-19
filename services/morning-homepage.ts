import type { SyncDatabase, SqlExecutor } from "../lib/sync-database";
import { briefDate } from "../lib/brief-policy";
import { developmentPreview, homeItemIdentity } from "../lib/homepage-presentation";
import { newsSlug } from "../lib/news-presentation";
import { transferSlug } from "../lib/transfer-presentation";
import { readLatestBrief, type BriefView } from "./brief-query";
import { readPublishedStory } from "./news-ui-data";
import { readTransferEvent } from "./transfer-query";
import type { HomeItem, HomepageResult, HomepageView } from "../types/morning-homepage";
import type { BriefContentItem } from "../types/morning-brief";

const order = ["RESULTS", "TOP_STORIES", "HIGHLIGHTS", "CLUB_PLAYER", "TRANSFERS", "OFF_FIELD", "COMMUNITY", "UPCOMING"] as const;
export type HomeEnrichment = Pick<HomeItem, "storyType" | "entities" | "transfer">;
/** Presentation-only projection: order/ranking/reliability/content come from M12.
 * Never fills a missing section, promotes certainty or creates a factual claim.
 */
export function composeHomepage(brief: BriefView, enrichment: Map<string, HomeEnrichment>, state: { partial: boolean; staleInputs: boolean }, now: Date): HomepageView {
  const raw = brief.document.sections.flatMap((section) => section.items);
  const transferClusters = new Set(raw.filter((item) => item.transferId).map((item) => item.clusterId));
  const seen = new Set<string>();
  const sections = order.flatMap((type) => {
    const items: HomeItem[] = [];
    for (const item of raw.filter((entry) => entry.section === type)) {
      const identity = homeItemIdentity(item);
      if (seen.has(identity) || !item.titleVi.trim() || !item.summaryVi.trim() || !item.transferId && item.clusterId && transferClusters.has(item.clusterId)) continue;
      // M12 stores highlights on result items, not duplicate narrative cards.
      if (type === "HIGHLIGHTS") continue;
      const extra = enrichment.get(item.key);
      if (!item.match && !extra) continue;
      if (item.match && (type === "RESULTS" && (item.match.status !== "FINISHED" || item.match.homeScore === null || item.match.awayScore === null) || type === "UPCOMING" && item.match.status !== "SCHEDULED")) continue;
      seen.add(identity);
      const href = item.match ? `/match/${encodeURIComponent(item.match.slug)}` : item.transferId ? `/transfers/${transferSlug(item.transferId)}` : `/news/${newsSlug(item.clusterId!)}`;
      items.push({ item, href, anchor: `morning-${type.toLowerCase()}-${items.length + 1}`, highlight: brief.highlights[item.key] ?? null, storyType: extra?.storyType ?? null, entities: extra?.entities ?? [], transfer: extra?.transfer ?? null });
    }
    return items.length ? [{ type, items }] : [];
  });
  const selected = new Map(sections.flatMap((section) => section.items).map((entry) => [entry.item.key, entry]));
  const summaries = new Set<string>();
  return { date: brief.document.date, updatedAt: brief.publishedAt ?? brief.generatedAt, preview: brief.status === "READY", stale: brief.document.date !== briefDate(now), ...state,
    summary: brief.document.summary.flatMap((point) => { const item = selected.get(point.itemKey); if (!item || summaries.has(homeItemIdentity(item.item))) return []; summaries.add(homeItemIdentity(item.item)); return [{ textVi: point.textVi, href: `#${item.anchor}` }]; }).slice(0, 6), sections };
}
async function enrich(tx: SqlExecutor, items: BriefContentItem[], now: Date) {
  const result = new Map<string, HomeEnrichment>();
  for (const item of items.filter((item) => !item.match)) {
    if (result.has(item.key)) continue;
    if (item.transferId) {
      const transfer = await readTransferEvent(tx, item.transferId, now);
      if (transfer && transfer.story.titleVi === item.titleVi && transfer.story.summaryVi === item.summaryVi && transfer.status === item.transferStatus) result.set(item.key, { storyType: "TRANSFER", entities: transfer.story.entities, transfer: { player: transfer.story.transfer?.player ?? null, currentClub: transfer.story.transfer?.currentClub ?? null, targetClub: transfer.story.transfer?.targetClub ?? null, facts: transfer.facts } });
    } else if (item.clusterId) {
      const story = await readPublishedStory(tx, item.clusterId, now);
      if (story && story.titleVi === item.titleVi && story.summaryVi === item.summaryVi) result.set(item.key, { storyType: story.storyType, entities: story.entities, transfer: null });
    }
  }
  return result;
}
export class MorningHomepageService {
  constructor(private db: SyncDatabase, private environment = "production") {}
  async read(previewRequested: unknown, now = new Date()): Promise<HomepageResult> {
    return this.db.transaction(async (tx) => {
      await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const brief = await readLatestBrief(tx, now, developmentPreview(previewRequested, this.environment));
      if (!brief || !["PUBLISHED", ...(developmentPreview(previewRequested, this.environment) ? ["READY"] : [])].includes(brief.status)) return { kind: "empty" };
      // Select only scheduler attempts tied to this exact revision. Another day's
      // failure must not mislabel the brief. Audit internals never enter the DTO.
      const attempts = await tx.query<{ status: string; freshness: { stale?: boolean; health?: string }[] | null }>(`SELECT status,checkpoint->'freshness' AS freshness FROM "JobRun" WHERE "jobName"='scheduler:morning-attempt' AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(checkpoint->'steps','[]'::jsonb)) s WHERE s->'outcome'->'brief'->>'id'=$1) ORDER BY "finishedAt" DESC LIMIT 1`, [brief.id]);
      const attempt = attempts[0];
      const state = { partial: attempt?.status === "PARTIAL", staleInputs: Array.isArray(attempt?.freshness) && attempt.freshness.some((entry) => entry.stale === true && entry.health !== "DISABLED") };
      const extra = await enrich(tx, brief.document.sections.flatMap((section) => section.items), now);
      const view = composeHomepage(brief, extra, state, now);
      return view.sections.length ? { kind: "ready", view } : { kind: "empty" };
    });
  }
}
export async function loadHomepage(read: () => Promise<HomepageResult>, onError?: () => void): Promise<HomepageResult> {
  try { return await read(); } catch { onError?.(); return { kind: "error" }; }
}
