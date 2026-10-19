import { z } from "zod";
import { parseEnvironment } from "../lib/config";
import { createDatabaseClient } from "../lib/database-client";
import { prismaSyncDatabase } from "../lib/sync-database";
import { ReliabilityService } from "../services/reliability-service";

async function main() {
  const [mode, value, ...extra] = process.argv.slice(2);
  if (extra.length || !["article", "batch"].includes(mode) || (mode === "article" ? !z.uuid().safeParse(value).success : !/^([1-9]|[1-4][0-9]|50)$/.test(value ?? ""))) {
    console.error("Usage: npm.cmd run reliability:assess -- article <uuid> | batch <1-50>"); process.exitCode = 1; return;
  }
  const env = parseEnvironment(process.env);
  if (!env.DATABASE_URL) { console.error("DATABASE_URL is required."); process.exitCode = 1; return; }
  const db = createDatabaseClient(env.DATABASE_URL);
  try {
    const service = new ReliabilityService(prismaSyncDatabase(db));
    const articles = mode === "article" ? [{ id: value }] : await db.article.findMany({ where: { publicationStatus: "DRAFT" }, select: { id: true }, orderBy: [{ collectedAt: "asc" }, { id: "asc" }], take: Number(value) });
    for (const article of articles) {
      const assessment = await service.assessArticle(article.id);
      console.log(JSON.stringify({ articleId: article.id, ...(assessment ? { cached: assessment.cached, label: assessment.result.label, certainty: assessment.result.certainty, evidenceStrength: assessment.result.evidenceStrength, eligible: assessment.result.publishability.eligible, blockers: assessment.result.publishability.blockers } : { status: "not_found" }) }));
    }
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error("Reliability assessment failed. Check database, migrations and configuration. Raw errors are withheld."); process.exitCode = 1; });
