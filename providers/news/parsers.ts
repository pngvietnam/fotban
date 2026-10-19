import { load } from "cheerio";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { NewsSourceConfig, NormalizedArticle } from "../../types/news-provider";
import type { SourceDefinition } from "./sources";
import { normalizeNewsArticle } from "./normalization";
import { NewsError } from "./errors";

type RawArticle = Parameters<typeof normalizeNewsArticle>[0];
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = (value: unknown): unknown[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const text = (value: unknown): unknown => typeof value === "string" ? value : record(value)["#text"];
function normalizeBatch(raw: RawArticle[], source: NewsSourceConfig, definition: SourceDefinition, now: Date, limit: number) {
  const articles: NormalizedArticle[] = []; let rejected = 0;
  for (const item of raw.slice(0, 200)) {
    try { const parsed = normalizeNewsArticle(item, source, definition, now); if (articles.length < limit) articles.push(parsed); }
    catch { rejected++; }
  }
  if (raw.length && !articles.length) throw new NewsError("MALFORMED");
  return { articles, rejected };
}
export function parseNewsFeed(xml: string, source: NewsSourceConfig, definition: SourceDefinition, now: Date, limit: number) {
  // Reject declarations/entities before parsing; never resolve external or recursive entities.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new NewsError("MALFORMED");
  const doc = record(new XMLParser({ ignoreAttributes: false, parseTagValue: false, processEntities: false, removeNSPrefix: true }).parse(xml));
  const atom = record(doc.feed); const rss = record(record(doc.rss).channel);
  if (!doc.feed && !record(doc.rss).channel) throw new NewsError("MALFORMED");
  const entries = array(doc.feed ? atom.entry : rss.item);
  const raw = entries.map((entry): RawArticle => {
    const e = record(entry);
    const links = array(e.link).map(record);
    const alternate = links.find((link) => !link["@_rel"] || link["@_rel"] === "alternate");
    const canonical = links.find((link) => link["@_rel"] === "canonical");
    const rssLink = array(e.link).map(text).find((value) => typeof value === "string" && value.trim());
    return { url: doc.feed ? alternate?.["@_href"] : rssLink, canonical: canonical?.["@_href"], title: text(e.title), excerpt: text(doc.feed ? e.summary : e.description), published: text(doc.feed ? e.published : e.pubDate ?? e.date) };
  });
  return normalizeBatch(raw, source, definition, now, limit);
}
export function parseNewsIndex(html: string, source: NewsSourceConfig, definition: SourceDefinition, now: Date, limit: number) {
  const $ = load(html); const raw: RawArticle[] = [];
  // Read only article metadata; articleBody/content and framework hydration blobs are ignored.
  function visit(value: unknown, depth = 0) {
    if (depth > 8 || raw.length >= 200) return;
    if (Array.isArray(value)) { for (const child of value.slice(0, 200)) visit(child, depth + 1); return; }
    const object = record(value);
    const types = array(object["@type"]);
    if (types.some((type) => type === "NewsArticle" || type === "Article")) {
      const canonical = typeof object.mainEntityOfPage === "string" ? object.mainEntityOfPage : record(object.mainEntityOfPage)["@id"];
      raw.push({ url: object.url ?? canonical, canonical, title: object.headline, excerpt: object.description, published: object.datePublished });
    }
    for (const key of ["@graph", "itemListElement", "item"]) if (object[key]) visit(object[key], depth + 1);
  }
  $('script[type="application/ld+json"]').slice(0, 30).each((_, node) => { try { visit(JSON.parse($(node).text())); } catch { /* A malformed metadata block cannot invalidate other cards. */ } });
  // A single page canonical link belongs to the index, never to each discovered article.
  $(definition.linkSelector).slice(0, 200).each((_, node) => {
    const link = $(node); const card = link.closest(definition.cardSelector);
    const title = link.find(definition.titleSelector).first().text() || link.attr("title") || link.text();
    const published = card.find("time[datetime]").first().attr("datetime");
    const excerpt = card.find('[itemprop="description"],.description,.excerpt').first().text();
    raw.push({ url: link.attr("href"), canonical: link.attr("data-canonical-url"), title, excerpt, published });
  });
  if (!raw.length) throw new NewsError("MALFORMED"); // Layout drift/challenge pages must not look like successful empty feeds.
  const result = normalizeBatch(raw, source, definition, now, limit);
  const seen = new Set<string>();
  result.articles = result.articles.filter((article) => { if (seen.has(article.sourceUrl)) return false; seen.add(article.sourceUrl); return true; });
  return result;
}
