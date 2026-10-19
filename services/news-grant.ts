import { randomUUID } from "node:crypto";
import type { SqlExecutor, SyncDatabase } from "../lib/sync-database";
import { publisherFeedAllowed } from "../lib/publisher-feed-permission";
import { vietnameseSources } from "../providers/news/vietnamese-sources";
import { adminAudit } from "./admin-access";

export type GrantInput = { slugs: string[] | "all"; reviewer: string; reason: string; maxExcerptChars?: number };
export type GrantResult = { slug: string; status: "granted" | "revoked" | "unchanged" | "skipped"; code?: "NO_FEED" | "NOT_REGISTERED" | "UNKNOWN_SOURCE" };
export class NewsGrantError extends Error { constructor(readonly code: "INVALID_INPUT" | "PERMISSION_BLOCKED") { super(code); } }

const selected = (slugs: GrantInput["slugs"]) => {
  if (slugs === "all") return vietnameseSources.map((source) => source.slug as string);
  if (!slugs.length) throw new NewsGrantError("INVALID_INPUT");
  return slugs;
};
function validate(input: GrantInput) {
  if (!/^[\p{L}\p{N} ._@-]{2,80}$/u.test(input.reviewer.trim()) || input.reason.trim().length < 10 || input.reason.length > 1000) throw new NewsGrantError("INVALID_INPUT");
  const max = input.maxExcerptChars ?? 280;
  if (!Number.isInteger(max) || max < 1 || max > 280) throw new NewsGrantError("INVALID_INPUT");
  return max;
}
/** The CLI operator is an audit identity only: no AuthAccount, so it can never sign in, and role USER. */
async function operator(tx: SqlExecutor, reviewer: string) {
  const subject = `operator:${reviewer.trim()}`;
  const existing = await tx.query<{ id: string }>('SELECT id FROM "User" WHERE "authProvider"=\'operator\' AND "authSubject"=$1', [subject]);
  if (existing[0]) return existing[0].id;
  const id = randomUUID();
  await tx.query('INSERT INTO "User" (id,"authProvider","authSubject","displayName","updatedAt") VALUES ($1::uuid,\'operator\',$2,$3,now())', [id, subject, reviewer.trim()]);
  return id;
}
const summary = (row: Record<string, unknown>) => Object.fromEntries(["enabled", "termsReviewed", "ingestionAllowed", "permissionStatus", "commercialReuseAllowed", "permissionScope", "maxExcerptChars", "feedUrl", "attributionRequirement", "permissionReference", "reviewer", "lastTermsReviewAt"].map((key) => [key, row[key] instanceof Date ? (row[key] as Date).toISOString() : row[key] ?? null]));

/**
 * Records the owner's publisher grant (RSS title + description, attributed) for Vietnamese
 * sources whose feed URL is verified in the registry. Every change is audited; sources
 * without a verified feed are reported and left untouched.
 */
export async function grantVietnameseSources(db: SyncDatabase, input: GrantInput) {
  const maxExcerptChars = validate(input);
  return db.transaction(async (tx) => {
    // Same locks as the admin source editor, so CLI and console edits serialize.
    await tx.query("SELECT 1 AS locked FROM pg_advisory_xact_lock(91531108)");
    await tx.query("SELECT 1 AS locked FROM pg_advisory_xact_lock(91531112)");
    const actorId = await operator(tx, input.reviewer);
    const results: GrantResult[] = [];
    for (const slug of selected(input.slugs)) {
      const definition = vietnameseSources.find((source) => source.slug === slug);
      if (!definition) { results.push({ slug, status: "skipped", code: "UNKNOWN_SOURCE" }); continue; }
      if (!definition.feedUrl) { results.push({ slug, status: "skipped", code: "NO_FEED" }); continue; }
      const [before] = await tx.query<Record<string, unknown>>('SELECT * FROM "NewsSource" WHERE slug=$1 FOR UPDATE', [slug]);
      if (!before) { results.push({ slug, status: "skipped", code: "NOT_REGISTERED" }); continue; }
      const attribution = String(before.attributionRequirement ?? "").trim() || definition.attribution;
      const after = { ...before, enabled: true, termsReviewed: true, ingestionAllowed: true, permissionStatus: "ALLOWED", commercialReuseAllowed: true, ingestionMethod: "RSS", permissionScope: "RSS_SUMMARY", maxExcerptChars, feedUrl: definition.feedUrl, attributionRequirement: attribution, permissionReference: definition.termsUrl, reviewer: input.reviewer.trim(), reviewedAt: new Date(), lastTermsReviewAt: new Date(), language: "vi" };
      if (!publisherFeedAllowed(after as unknown as Parameters<typeof publisherFeedAllowed>[0])) throw new NewsGrantError("PERMISSION_BLOCKED");
      const unchanged = before.enabled && before.ingestionAllowed && before.permissionStatus === "ALLOWED" && before.commercialReuseAllowed && before.permissionScope === "RSS_SUMMARY" && before.maxExcerptChars === maxExcerptChars && before.feedUrl === definition.feedUrl && before.permissionReference === definition.termsUrl && before.reviewer === after.reviewer;
      if (unchanged) { results.push({ slug, status: "unchanged" }); continue; }
      const notes = `${definition.notes} | Owner grant ${new Date().toISOString().slice(0, 10)} by ${after.reviewer}: ${input.reason.trim()}`.slice(0, 4000);
      await tx.query(`UPDATE "NewsSource" SET enabled=true,"termsReviewed"=true,"ingestionAllowed"=true,"permissionStatus"='ALLOWED',"commercialReuseAllowed"=true,"ingestionMethod"='RSS',"permissionScope"='RSS_SUMMARY',"maxExcerptChars"=$2,"feedUrl"=$3,"attributionRequirement"=$4,"permissionReference"=$5,reviewer=$6,"reviewedAt"=now(),"lastTermsReviewAt"=now(),language='vi',"ingestionNotes"=$7,"updatedAt"=now() WHERE id=$1::uuid`,
        [before.id, maxExcerptChars, definition.feedUrl, attribution, definition.termsUrl, after.reviewer, notes]);
      const [current] = await tx.query<Record<string, unknown>>('SELECT * FROM "NewsSource" WHERE id=$1::uuid', [before.id]);
      await adminAudit(tx, actorId, "SOURCE_GRANT", "NewsSource", String(before.id), input.reason.trim(), summary(before), summary(current));
      results.push({ slug, status: "granted" });
    }
    return results;
  });
}

/** Withdraws a publisher grant. Public reads recheck the grant, so existing stories disappear immediately. */
export async function revokeVietnameseSource(db: SyncDatabase, input: Omit<GrantInput, "maxExcerptChars">) {
  validate(input);
  return db.transaction(async (tx) => {
    await tx.query("SELECT 1 AS locked FROM pg_advisory_xact_lock(91531108)");
    await tx.query("SELECT 1 AS locked FROM pg_advisory_xact_lock(91531112)");
    const actorId = await operator(tx, input.reviewer);
    const results: GrantResult[] = [];
    for (const slug of selected(input.slugs)) {
      const [before] = await tx.query<Record<string, unknown>>('SELECT * FROM "NewsSource" WHERE slug=$1 FOR UPDATE', [slug]);
      if (!before || !vietnameseSources.some((source) => source.slug === slug)) { results.push({ slug, status: "skipped", code: before ? "UNKNOWN_SOURCE" : "NOT_REGISTERED" }); continue; }
      if (!before.enabled && !before.ingestionAllowed && before.permissionScope === "NONE") { results.push({ slug, status: "unchanged" }); continue; }
      await tx.query(`UPDATE "NewsSource" SET enabled=false,"ingestionAllowed"=false,"permissionStatus"='RESTRICTED',"commercialReuseAllowed"=false,"permissionScope"='NONE',reviewer=$2,"reviewedAt"=now(),"lastTermsReviewAt"=now(),"updatedAt"=now() WHERE id=$1::uuid`, [before.id, input.reviewer.trim()]);
      const [current] = await tx.query<Record<string, unknown>>('SELECT * FROM "NewsSource" WHERE id=$1::uuid', [before.id]);
      await adminAudit(tx, actorId, "SOURCE_REVOKE", "NewsSource", String(before.id), input.reason.trim(), summary(before), summary(current));
      results.push({ slug, status: "revoked" });
    }
    return results;
  });
}
