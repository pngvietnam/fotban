import { load } from "cheerio";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { EntityCandidate } from "../../types/ai-provider";
import type { NewsProvider, NewsSourceConfig, NewsCursor, NewsPage, NormalizedArticle } from "../../types/news-provider";
import { publisherFeedAllowed } from "../../lib/publisher-feed-permission";
import { canIngest, type SourceDefinition } from "./sources";
import { NewsError } from "./errors";
import { NewsHttp, type NewsHttpOptions } from "./http";
import { normalizeNewsArticle, plainText } from "./normalization";
import { resolveEntities } from "../ai/rules";
import { vietnameseFeedOffset, vietnameseSource } from "./vietnamese-sources";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = (value: unknown): unknown[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const text = (value: unknown) => typeof value === "string" ? value : typeof object(value)["#text"] === "string" ? object(value)["#text"] as string : "";
// Livestream-link, betting-tip and odds pieces are not news and are excluded for every source.
const notNews = /link xem trực tiếp|xem trực tiếp bóng đá|trực tiếp bóng đá|soi kèo|tỷ lệ kèo|nhận định bóng đá|nhận định,? soi kèo|dự đoán tỷ số|nhà cái/iu;
export function relevantVietnameseFootball(title: string, excerpt: string | null, catalog: EntityCandidate[]) {
  const input = `${title}\n${excerpt ?? ""}`;
  if (/quần vợt|bóng rổ|bóng chuyền|cầu lông|pickleball|\btennis\b|\bgolf\b|\bF1\b/iu.test(title) || notNews.test(title)) return false;
  return /ngoại hạng anh|premier league|la\s?liga|bóng đá tây ban nha/iu.test(input) || resolveEntities(input, catalog).some((entity) => ["club", "player", "league"].includes(entity.kind));
}
export function parseVietnameseFeed(xml: string, source: NewsSourceConfig, definition: SourceDefinition, catalog: EntityCandidate[], now: Date, limit: number) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new NewsError("MALFORMED");
  const root = object(new XMLParser({ ignoreAttributes: false, parseTagValue: false, processEntities: false, removeNSPrefix: true }).parse(xml));
  const channel = object(object(root.rss).channel); if (!object(root.rss).channel) throw new NewsError("MALFORMED");
  const articles: NormalizedArticle[] = []; let rejected = 0; let irrelevant = 0; let stale = 0; let overLimit = 0;
  for (const entry of array(channel.item).slice(0, 200)) {
    const item = object(entry);
    try {
      // Feeds may repeat <link> as an atom self-link object; use the first plain article URL.
      const link = array(item.link).map(text).find(Boolean) ?? "";
      const article = normalizeNewsArticle({ title: text(item.title), url: link, published: text(item.pubDate), excerpt: source.permissionScope === "RSS_SUMMARY" ? text(item.description) : undefined }, source, definition, now, { naiveOffset: vietnameseFeedOffset });
      if (!article.publishedAt || article.publishedAt > now) { rejected++; continue; }
      if (article.publishedAt.getTime() < now.getTime() - 24 * 3600000) { stale++; continue; }
      if (!relevantVietnameseFootball(article.titleOriginal, article.excerptOriginal, catalog)) { irrelevant++; continue; }
      // Preserve actual feed references without fetching or treating them as verified authority.
      const $ = load(text(item.description)); const references: string[] = [];
      if (source.permissionScope === "RSS_SUMMARY") $('a[href]').each((_, node) => { try { const url = new URL($(node).attr("href")!); if (url.protocol === "https:" && !url.username && !url.password && !url.port && url.hostname !== source.domain && references.length < 10) references.push(url.href); } catch { /* Ignore invalid references. */ } });
      article.feed = { url: source.feedUrl!, termsUrl: source.permissionReference!, scope: source.permissionScope as "RSS_METADATA" | "RSS_SUMMARY", attribution: source.attributionRequirement!, reviewedAt: source.lastTermsReviewAt!, categories: array(item.category).slice(0, 10).map((value) => plainText(text(value)).slice(0, 100)).filter(Boolean), evidenceReferences: [...new Set(references)] };
      if (articles.length < limit) articles.push(article); else overLimit++;
    } catch { rejected++; }
  }
  const examined = Math.min(array(channel.item).length, 200);
  return { articles, rejected, irrelevant, stale, overLimit, stats: { examined, relevant: articles.length + overLimit, irrelevant, stale, overLimit } };
}
export class VietnameseRssNewsProvider implements NewsProvider {
  readonly sourceSlug: string;
  constructor(private source: NewsSourceConfig, private catalog: () => Promise<EntityCandidate[]>, private options: NewsHttpOptions = {}, private now = () => new Date()) { this.sourceSlug = source.slug; }
  async fetchLatestArticles(input: { cursor?: NewsCursor; limit: number }): Promise<NewsPage> {
    if (!this.source.enabled) throw new NewsError("DISABLED");
    if (!canIngest(this.source) || !publisherFeedAllowed(this.source)) throw new NewsError("RIGHTS_REQUIRED");
    const config = vietnameseSource(this.source.slug);
    if (!config || config.domain !== this.source.domain || this.source.language !== "vi" || !this.source.feedUrl) throw new NewsError("UNSUPPORTED");
    const definition: SourceDefinition = { slug: config.slug, name: config.name, domain: config.domain, language: "vi", country: "VN", endpoint: this.source.feedUrl, articlePath: /^\/(?!rss(?:\/|$)).+/, termsUrl: this.source.permissionReference!, restriction: "Publisher-permitted RSS fields only", linkSelector: "", titleSelector: "", cardSelector: "" };
    const response = await new NewsHttp(this.options).read(definition, input.cursor);
    if (response.status === 304) return { articles: [], rejected: 0, cursor: response.cursor, notModified: true };
    if (!/(?:xml|rss)/i.test(response.contentType)) throw new NewsError("MALFORMED");
    return { ...parseVietnameseFeed(response.text, this.source, definition, await this.catalog(), this.now(), Math.min(20, input.limit)), cursor: response.cursor, notModified: false };
  }
}
