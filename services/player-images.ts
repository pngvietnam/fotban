import type { SqlExecutor } from "../lib/sync-database";
import { isFreeLicense, safePhotoUrl } from "../lib/player-photo";

/** Minimal Wikimedia API surface so the matching logic can be tested without the network. */
export type WikiApi = (site: "wikidata" | "commons", params: Record<string, string>) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export class WikiError extends Error { constructor(readonly code: "NETWORK" | "RATE_LIMITED" | "MALFORMED") { super(code); } }

const endpoints = { wikidata: "https://www.wikidata.org/w/api.php", commons: "https://commons.wikimedia.org/w/api.php" } as const;
/** Real client: identified User-Agent (required by Wikimedia policy), maxlag, a hard timeout and no retries. */
export function wikimediaApi(userAgent: string): WikiApi {
  return async (site, params) => {
    let response: Response;
    try { response = await fetch(`${endpoints[site]}?${new URLSearchParams({ format: "json", formatversion: "2", maxlag: "5", ...params })}`, { headers: { "User-Agent": userAgent, Accept: "application/json" }, signal: AbortSignal.timeout(10000), redirect: "error" }); }
    catch { throw new WikiError("NETWORK"); }
    if (response.status === 429 || response.status === 503) throw new WikiError("RATE_LIMITED");
    if (!response.ok) throw new WikiError("NETWORK");
    const body = await response.json().catch(() => null);
    if (!body || typeof body !== "object") throw new WikiError("MALFORMED");
    if (body.error?.code === "maxlag") throw new WikiError("RATE_LIMITED");
    return body;
  };
}
const fold = (value: string) => value.normalize("NFD").replace(/\p{M}+/gu, "").normalize("NFC");
const entities: Record<string, string> = { "&amp;": "&", "&quot;": "\"", "&#39;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " };
export const plainCredit = (html: unknown) => typeof html === "string" ? html.replace(/<[^>]+>/g, " ").replace(/&(?:amp|quot|#39|lt|gt|nbsp);/g, (match) => entities[match]).replace(/\s+/g, " ").trim().slice(0, 160) : "";
const FOOTBALLER = "Q937857";

export type PlayerLookup = { status: "FOUND"; wikidataId: string; fileName: string; thumbUrl: string; descriptionUrl: string; author: string; licenseName: string; licenseUrl: string | null } | { status: "NOT_FOUND"; reason: string };

/** Finds a free-licence photo for one player. A wrong person is worse than no photo, so any doubt means NOT_FOUND. */
export async function lookupPlayerPhoto(api: WikiApi, player: { name: string; birthDate: string | null }, sleep: () => Promise<void>): Promise<PlayerLookup> {
  if (!player.birthDate) return { status: "NOT_FOUND", reason: "NO_BIRTH_DATE" };
  const found = new Map<string, any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const query of [...new Set([player.name, fold(player.name)])]) {
    const search = await api("wikidata", { action: "wbsearchentities", search: query, language: "en", type: "item", limit: "10" });
    await sleep();
    const ids: string[] = (search.search ?? []).map((item: { id: string }) => item.id).filter((id: string) => /^Q\d+$/.test(id) && !found.has(id));
    if (!ids.length) continue;
    const loaded = await api("wikidata", { action: "wbgetentities", ids: ids.join("|"), props: "claims", languages: "en" });
    await sleep();
    for (const entity of Object.values(loaded.entities ?? {}) as any[]) found.set(entity.id, entity); // eslint-disable-line @typescript-eslint/no-explicit-any
    // Same person found under the first spelling: no need to widen the search.
    if (matching(found, player.birthDate).length) break;
  }
  const matches = matching(found, player.birthDate);
  if (matches.length === 0) return { status: "NOT_FOUND", reason: "NO_MATCH" };
  if (matches.length > 1) return { status: "NOT_FOUND", reason: "AMBIGUOUS" };
  const entity = matches[0];
  const claims = (entity.claims?.P18 ?? []) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  const claim = claims.find((item) => item.rank === "preferred") ?? claims.find((item) => item.rank !== "deprecated");
  const fileName = claim?.mainsnak?.datavalue?.value;
  if (typeof fileName !== "string" || !fileName) return { status: "NOT_FOUND", reason: "NO_IMAGE" };
  const info = await api("commons", { action: "query", prop: "imageinfo", titles: `File:${fileName}`, iiprop: "extmetadata|url", iiurlwidth: "320", iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Credit|NonFree|UsageTerms" });
  await sleep();
  const image = info.query?.pages?.[0]?.imageinfo?.[0];
  if (!image) return { status: "NOT_FOUND", reason: "NO_FILE" };
  const meta = image.extmetadata ?? {};
  const licenseName = plainCredit(meta.LicenseShortName?.value);
  const author = plainCredit(meta.Artist?.value) || plainCredit(meta.Credit?.value);
  const thumbUrl = safePhotoUrl(image.thumburl);
  const nonFree = String(meta.NonFree?.value ?? "").toLowerCase() === "true";
  if (nonFree || !isFreeLicense(licenseName)) return { status: "NOT_FOUND", reason: "LICENSE" };
  if (!author) return { status: "NOT_FOUND", reason: "NO_AUTHOR" };
  if (!thumbUrl) return { status: "NOT_FOUND", reason: "NO_THUMBNAIL" };
  const licenseUrl = typeof meta.LicenseUrl?.value === "string" && /^https:\/\//.test(meta.LicenseUrl.value) ? meta.LicenseUrl.value : null;
  return { status: "FOUND", wikidataId: entity.id, fileName, thumbUrl, descriptionUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName.replace(/ /g, "_"))}`, author, licenseName, licenseUrl };
}
function matching(found: Map<string, any>, birthDate: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return [...found.values()].filter((entity) => {
    const claims = entity.claims ?? {};
    const human = (claims.P31 ?? []).some((claim: any) => claim.mainsnak?.datavalue?.value?.id === "Q5"); // eslint-disable-line @typescript-eslint/no-explicit-any
    const footballer = (claims.P106 ?? []).some((claim: any) => claim.mainsnak?.datavalue?.value?.id === FOOTBALLER); // eslint-disable-line @typescript-eslint/no-explicit-any
    const dates = (claims.P569 ?? []).map((claim: any) => String(claim.mainsnak?.datavalue?.value?.time ?? "").slice(1, 11)); // eslint-disable-line @typescript-eslint/no-explicit-any
    return human && footballer && dates.includes(birthDate);
  });
}

export type ImageSyncResult = { examined: number; found: number; notFound: number; stopped: "DONE" | "BUDGET" | "RATE_LIMITED" | "NETWORK" };
/**
 * Resumable batch: players in a current squad with no result yet, then not-found ones after 30 days and found
 * ones after 90 days (licences can change). Stops at the time budget or at the first Wikimedia error.
 */
export async function syncPlayerImages(db: SqlExecutor, deps: { api: WikiApi; limit: number; timeBudgetMs: number; sleep?: () => Promise<void>; now?: () => number }): Promise<ImageSyncResult> {
  const sleep = deps.sleep ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 700)));
  const now = deps.now ?? Date.now; const startedAt = now();
  const players = await db.query<{ id: string; name: string; birthDate: string | null }>(
    `SELECT p.id,p.name,to_char(p."birthDate",'YYYY-MM-DD') AS "birthDate" FROM "Player" p JOIN "PlayerClub" pc ON pc."playerId"=p.id AND pc."endsAt" IS NULL LEFT JOIN "PlayerImage" i ON i."playerId"=p.id
     WHERE i."playerId" IS NULL OR (i.status='NOT_FOUND' AND i."checkedAt"<now()-interval '30 days') OR (i.status='FOUND' AND i."checkedAt"<now()-interval '90 days')
     GROUP BY p.id,i."checkedAt" ORDER BY i."checkedAt" NULLS FIRST,p.id LIMIT $1`, [deps.limit]);
  const result: ImageSyncResult = { examined: 0, found: 0, notFound: 0, stopped: "DONE" };
  for (const player of players) {
    if (now() - startedAt >= deps.timeBudgetMs) { result.stopped = "BUDGET"; break; }
    let lookup: PlayerLookup;
    try { lookup = await lookupPlayerPhoto(deps.api, player, sleep); }
    catch (error) { result.stopped = error instanceof WikiError && error.code === "RATE_LIMITED" ? "RATE_LIMITED" : "NETWORK"; break; }
    const values = lookup.status === "FOUND" ? [lookup.wikidataId, lookup.fileName, lookup.thumbUrl, lookup.descriptionUrl, lookup.author, lookup.licenseName, lookup.licenseUrl] : [null, null, null, null, null, null, null];
    await db.query(`INSERT INTO "PlayerImage" ("playerId",status,"wikidataId","fileName","thumbUrl","descriptionUrl",author,"licenseName","licenseUrl","checkedAt","updatedAt") VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())
      ON CONFLICT ("playerId") DO UPDATE SET status=EXCLUDED.status,"wikidataId"=EXCLUDED."wikidataId","fileName"=EXCLUDED."fileName","thumbUrl"=EXCLUDED."thumbUrl","descriptionUrl"=EXCLUDED."descriptionUrl",author=EXCLUDED.author,"licenseName"=EXCLUDED."licenseName","licenseUrl"=EXCLUDED."licenseUrl","checkedAt"=now(),"updatedAt"=now()`,
      [player.id, lookup.status, ...values]);
    result.examined++; if (lookup.status === "FOUND") result.found++; else result.notFound++;
  }
  return result;
}
