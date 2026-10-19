import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { wikinewsConfig } from "../providers/wikimedia/config";
import { validateWikimediaUserAgent } from "../providers/wikimedia/http";

async function main() {
  const output = "docs/samples/wikinews-coverage-live.json";
  const url = new URL(wikinewsConfig.endpoint);
  url.search = new URLSearchParams({ action: "query", format: "json", formatversion: "2", maxlag: "5", generator: "search", gsrsearch: wikinewsConfig.search, gsrsort: "create_timestamp_desc", gsrnamespace: "0", gsrlimit: "5", prop: "revisions|info", inprop: "url", rvprop: "timestamp" }).toString();
  const agent = validateWikimediaUserAgent(process.env.WIKIMEDIA_USER_AGENT);
  let report: Record<string, unknown>;
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20000), headers: { "User-Agent": agent, "Api-User-Agent": agent, Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const raw: unknown = await response.json();
    const apiError = z.object({ error: z.object({ code: z.string().regex(/^[a-z0-9_-]{1,50}$/i) }) }).safeParse(raw);
    if (apiError.success) throw new Error(`WIKIMEDIA_${apiError.data.error.code}`);
    const parsed = z.object({ query: z.object({ pages: z.array(z.object({ title: z.string(), fullurl: z.url(), revisions: z.array(z.object({ timestamp: z.iso.datetime() })).max(1) })) }).optional(), batchcomplete: z.boolean().optional() }).parse(raw);
    if (!parsed.query && !parsed.batchcomplete) throw new Error("INVALID_RESPONSE");
    report = { checkedAt: new Date().toISOString(), status: "succeeded", query: wikinewsConfig.search, limit: 5, dateMeaning: "Latest revision timestamp; query ordered by page creation, not asserted publication time", pages: (parsed.query?.pages ?? []).map((page) => ({ title: page.title, url: page.fullurl, lastRevisionAt: page.revisions[0]?.timestamp ?? null })) };
  } catch (error) {
    const network = error instanceof Error && error.cause && typeof error.cause === "object" && "code" in error.cause ? error.cause.code : null;
    const code = typeof network === "string" && /^[A-Z_]{2,50}$/.test(network) ? network : error instanceof Error && /^(?:HTTP_\d+|WIKIMEDIA_[a-z0-9_-]+|INVALID_RESPONSE)$/.test(error.message) ? error.message : error instanceof z.ZodError ? "MALFORMED_RESPONSE" : "NETWORK_OR_INVALID_RESPONSE";
    report = { checkedAt: new Date().toISOString(), status: "failed", code, query: wikinewsConfig.search }; process.exitCode = 1;
  }
  const text = JSON.stringify(report, null, 2); console.log(text); await writeFile(output, text + "\n", "utf8");
}
main().catch(() => { console.error("Coverage check requires valid server-side Wikimedia identification. Sensitive details withheld."); process.exitCode = 1; });
