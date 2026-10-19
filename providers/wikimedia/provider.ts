import { z } from "zod";
import type { NewsProvider, NewsSourceConfig } from "../../types/news-provider";
import { canIngest } from "../news/sources";
import { NewsError } from "../news/errors";
import { wikinewsConfig } from "./config";
import { WikimediaHttp, type WikimediaHttpOptions } from "./http";
import { normalizeWikinewsPage, verifyWikinewsPolicy, wikinewsPageSchema } from "./normalization";

const querySchema = z.object({ query: z.object({ rightsinfo: z.object({ text: z.string(), url: z.string() }), general: z.object({ lang: z.literal("en") }), pages: z.array(z.unknown()).max(20) }) });
const parseSchema = z.object({ parse: z.object({ pageid: z.number().int().positive(), revid: z.number().int().positive(), text: z.string().min(1) }) });
export class WikinewsNewsProvider implements NewsProvider {
  readonly sourceSlug = wikinewsConfig.slug;
  private readonly http: WikimediaHttp;
  constructor(private readonly source: NewsSourceConfig, userAgent: string | undefined, options: WikimediaHttpOptions = {}, private readonly now = () => new Date()) { this.http = new WikimediaHttp(userAgent, options); }
  async fetchLatestArticles(input: { limit: number }) {
    if (!this.source.enabled) throw new NewsError("DISABLED");
    if (!canIngest(this.source)) throw new NewsError("RIGHTS_REQUIRED");
    if (this.source.slug !== this.sourceSlug || this.source.domain !== wikinewsConfig.domain || this.source.ingestionMethod !== "API" || !this.source.requiresReusableLicense) throw new NewsError("UNSUPPORTED");
    const response = querySchema.safeParse(await this.http.get({ action: "query", meta: "siteinfo", siprop: "general|rightsinfo", generator: "search", gsrsearch: wikinewsConfig.search, gsrsort: "create_timestamp_desc", gsrnamespace: "0", gsrlimit: String(Math.min(20, Math.max(1, input.limit))), prop: "info|categories", inprop: "url", cllimit: "100" }));
    if (!response.success) throw new NewsError("MALFORMED");
    const policy = parseSchema.safeParse(await this.http.get({ action: "parse", page: wikinewsConfig.policyTitle, prop: "text|revid", disableeditsection: "1" }));
    if (!policy.success) throw new NewsError("MALFORMED");
    verifyWikinewsPolicy(policy.data.parse.text, response.data.query.rightsinfo);
    const evidenceUrl = `https://en.wikinews.org/w/index.php?oldid=${policy.data.parse.revid}`;
    const articles = []; let rejected = 0;
    for (const candidate of response.data.query.pages) {
      const page = wikinewsPageSchema.safeParse(candidate);
      if (!page.success) { rejected++; continue; }
      const parsed = parseSchema.safeParse(await this.http.get({ action: "parse", oldid: String(page.data.lastrevid), prop: "text|revid", disableeditsection: "1" }));
      if (!parsed.success || parsed.data.parse.pageid !== page.data.pageid || parsed.data.parse.revid !== page.data.lastrevid) throw new NewsError("MALFORMED");
      try { articles.push(normalizeWikinewsPage(page.data, parsed.data.parse.text, this.source, evidenceUrl, this.now())); }
      catch (error) { if (error instanceof NewsError && ["INVALID_ARTICLE", "UNSUPPORTED_LICENSE"].includes(error.code)) rejected++; else throw new NewsError("MALFORMED"); }
    }
    return { articles, rejected, cursor: {}, notModified: false };
  }
}
