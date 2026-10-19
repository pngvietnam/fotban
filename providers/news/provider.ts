import type { NewsProvider, NewsSourceConfig, NewsCursor } from "../../types/news-provider";
import { canIngest, type SourceDefinition } from "./sources";
import { NewsError } from "./errors";
import { NewsHttp, type NewsHttpOptions } from "./http";
import { parseNewsFeed, parseNewsIndex } from "./parsers";

export class OfficialNewsProvider implements NewsProvider {
  readonly sourceSlug: string;
  private readonly http: NewsHttp;
  constructor(private readonly source: NewsSourceConfig, private readonly definition: SourceDefinition, options: NewsHttpOptions = {}, private readonly now = () => new Date()) {
    this.sourceSlug = source.slug; this.http = new NewsHttp(options);
  }
  async fetchLatestArticles(input: { cursor?: NewsCursor; limit: number }) {
    if (!this.source.enabled) throw new NewsError("DISABLED");
    if (!canIngest(this.source)) throw new NewsError("RIGHTS_REQUIRED");
    if (this.source.slug !== this.definition.slug || this.source.domain !== this.definition.domain || !["RSS", "ATOM", "HTML_INDEX", "OFFICIAL_PAGE"].includes(this.source.ingestionMethod)) throw new NewsError("UNSUPPORTED");
    const response = await this.http.read(this.definition, input.cursor);
    if (response.status === 304) return { articles: [], rejected: 0, cursor: response.cursor, notModified: true };
    const feed = this.source.ingestionMethod === "RSS" || this.source.ingestionMethod === "ATOM";
    if (feed ? !/(?:xml|rss|atom)/i.test(response.contentType) : !/text\/html/i.test(response.contentType)) throw new NewsError("MALFORMED");
    const parse = feed ? parseNewsFeed : parseNewsIndex;
    return { ...parse(response.text, this.source, this.definition, this.now(), Math.min(20, Math.max(1, input.limit))), cursor: response.cursor, notModified: false };
  }
}
