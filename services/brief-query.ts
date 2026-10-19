import { z } from "zod";
import type { SyncDatabase, SqlExecutor } from "../lib/sync-database";
import { readBriefRecord } from "./brief-store";
import { assertBriefCurrent } from "./morning-brief";
import { executorDatabase } from "./brief-inputs";
import { readVerifiedHighlight } from "./video-query";
import { VideoStore } from "./video-store";
import type { BriefDocument } from "../types/morning-brief";
import type { VerifiedHighlight } from "../types/video-provider";

export type BriefView = { id: string; briefId: string; revision: number; status: string; generatedAt: string; publishedAt: string | null; document: BriefDocument; highlights: Record<string, VerifiedHighlight | null>; highlightFallbackVi: string };
/** Internal read boundary shared by the homepage inside its read-only snapshot.
 * allowReady is supplied only by the server's development preview policy.
 */
export async function readLatestBrief(tx: SqlExecutor, now: Date, allowReady = false): Promise<BriefView | null> {
  const rows = await tx.query<{ id: string }>(`SELECT r.id FROM "BriefRevision" r JOIN "DailyBrief" b ON b.id=r."briefId" WHERE b.locale='vi-VN' AND ((r.status='PUBLISHED' AND r."publishedAt"<=$1::timestamptz) OR ($2::boolean AND r.status='READY')) AND r."generatedAt"<=$1::timestamptz AND r."generationMetadata" IS NOT NULL ORDER BY b.date DESC,r.revision DESC LIMIT 10`, [now, allowReady]);
  for (const row of rows) { const result = await view(tx, row.id, now, allowReady); if (result) return result; }
  return null;
}
async function view(tx: SqlExecutor, id: string, now: Date, internal: boolean): Promise<BriefView | null> {
  const record = await readBriefRecord(tx, id); if (!record || !internal && record.status !== "PUBLISHED") return null;
  // This same gate covers internal previews; frozen snapshots never bypass revoked rights.
  try { await assertBriefCurrent(tx, record, now); } catch { return null; }
  const highlights: BriefView["highlights"] = {};
  for (const item of record.document.sections.flatMap((section) => section.items).filter((item) => item.section === "RESULTS")) {
    let highlight = item.highlightRef ? await readVerifiedHighlight(new VideoStore(executorDatabase(tx)), item.match!.id, now) : null;
    if (highlight && !(await tx.query('SELECT id FROM "Video" WHERE id=$1::uuid AND url=$2', [item.highlightRef, highlight.url])).length) highlight = null;
    highlights[item.key] = highlight;
  }
  return { id: record.id, briefId: record.briefId, revision: record.revision, status: record.status, generatedAt: record.generatedAt, publishedAt: record.publishedAt, document: record.document, highlights, highlightFallbackVi: "Chưa tìm thấy highlight từ nguồn được xác minh." };
}
export class BriefQueryService {
  constructor(private db: SyncDatabase) {}
  async getRevision(id: string, options: { internal?: boolean; now?: Date } = {}) {
    if (!z.uuid().safeParse(id).success) return null;
    return this.db.transaction(async (tx) => { await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"); return view(tx, id, options.now ?? new Date(), Boolean(options.internal)); });
  }
  async getByDate(date: string, options: { internal?: boolean; now?: Date } = {}) {
    if (!z.iso.date().safeParse(date).success) return null;
    return this.db.transaction(async (tx) => {
      await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const rows = await tx.query<{ id: string }>(`SELECT r.id FROM "BriefRevision" r JOIN "DailyBrief" b ON b.id=r."briefId" WHERE b.date=$1::date AND b.locale='vi-VN' AND r."generationMetadata" IS NOT NULL ${options.internal ? "" : "AND r.status='PUBLISHED'"} ORDER BY r.revision DESC LIMIT 1`, [date]);
      return rows.length ? view(tx, rows[0].id, options.now ?? new Date(), Boolean(options.internal)) : null;
    });
  }
  async getLatest(now = new Date()) {
    return this.db.transaction(async (tx) => {
      await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      return readLatestBrief(tx, now);
    });
  }
}
