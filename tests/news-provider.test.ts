import { describe, expect, it, vi } from "vitest";
import { OfficialNewsProvider } from "../providers/news/provider";
import { NewsError } from "../providers/news/errors";
import { articleUrl } from "../providers/news/normalization";
import { parseNewsFeed, parseNewsIndex } from "../providers/news/parsers";
import { officialNewsSources } from "../providers/news/sources";
import { fixtureDefinition, fixtureSource, rssFixture, atomFixture, indexFixture, newsNow } from "./fixtures/news";

const options = { sleep: async () => {}, timeoutMs: 30 };
const feed = (xml: string) => parseNewsFeed(xml, fixtureSource(), fixtureDefinition, newsNow, 20);
const allowRobots = () => new Response("User-agent: *\nAllow: /", { headers: { "Content-Type": "text/plain" } });
const rssResponse = () => new Response(rssFixture, { headers: { "Content-Type": "application/rss+xml", etag: '"test-validator"' } });
describe("news metadata adapters", () => {
  it("normalizes RSS, entities and UTC dates while excluding full content", () => {
    const result = feed(rssFixture); expect(result.rejected).toBe(0);
    expect(result.articles[0]).toMatchObject({ titleOriginal: "Fixture & update", excerptOriginal: "A synthetic short excerpt.", sourceUrl: "https://news.example.test/news/fixture-one", language: "en", sourceName: "Fixture Official" });
    expect(result.articles[0].publishedAt?.toISOString()).toBe("2026-10-16T04:00:00.000Z");
    expect(JSON.stringify(result)).not.toContain("FULL_BODY"); expect(JSON.stringify(result)).not.toContain("ignored()");
  });
  it("supports Atom alternative links and original publication time instead of updated time", () => {
    const result = feed(atomFixture); expect(result.articles[0].sourceUrl).toBe("https://news.example.test/news/fixture-atom");
    expect(result.articles[0].publishedAt?.toISOString()).toBe("2026-10-16T04:00:00.000Z");
    expect(JSON.stringify(result)).not.toContain("FULL_ATOM_BODY");
  });
  it("supports RSS with an additional namespaced Atom self-link", () => {
    const xml = rssFixture.replace('<item>', '<item><atom:link xmlns:atom="http://www.w3.org/2005/Atom" rel="self" href="https://news.example.test/feed"/>');
    expect(feed(xml).articles[0].sourceUrl).toBe("https://news.example.test/news/fixture-one");
  });
  it("normalizes HTML cards and JSON-LD without assigning the index canonical to every item", () => {
    const { articles } = parseNewsIndex(indexFixture, fixtureSource({ ingestionMethod: "HTML_INDEX" }), fixtureDefinition, newsNow, 20);
    expect(articles).toHaveLength(2); expect(articles.every((article) => article.canonicalUrl === null)).toBe(true);
    expect(articles[0].titleOriginal).toBe("Fixture JSON headline"); expect(articles[1].titleOriginal).toBe("Fixture index headline");
    expect(JSON.stringify(articles)).not.toContain("NEVER_STORE");
  });
  it("keeps absent/ambiguous dates null and does not substitute collection time", () => {
    const result = feed(rssFixture.replace(/<pubDate>.*?<\/pubDate>/, "")); expect(result.articles[0].publishedAt).toBeNull();
    expect(feed(rssFixture.replace("Fri, 16 Oct 2026 04:00:00 GMT", "yesterday")).articles[0].publishedAt).toBeNull();
  });
  it("caps permitted excerpts and stores no excerpt when permission covers headlines only", () => {
    expect(parseNewsFeed(rssFixture, fixtureSource({ maxExcerptChars: 8 }), fixtureDefinition, newsNow, 20).articles[0].excerptOriginal).toBe("A synth…");
    expect(parseNewsFeed(rssFixture, fixtureSource({ maxExcerptChars: 0 }), fixtureDefinition, newsNow, 20).articles[0].excerptOriginal).toBeNull();
  });
  it("handles canonical URLs and strips only recognized tracking parameters", () => {
    expect(articleUrl("/news/A?utm_medium=mail&edition=gb&fbclid=x#main", fixtureDefinition)).toBe("https://news.example.test/news/A?edition=gb");
    const xml = atomFixture.replace('rel="self"', 'rel="canonical"').replace("https://news.example.test/feed", "https://news.example.test/news/canonical");
    expect(feed(xml).articles[0].canonicalUrl).toBe("https://news.example.test/news/canonical");
    for (const url of ["https://evil.test/news/x", "http://news.example.test/news/x", "https://u:p@news.example.test/news/x", "/shop/item", "javascript:alert(1)"]) expect(() => articleUrl(url, fixtureDefinition)).toThrow();
  });
  it.each(["<rss><broken>", '<!DOCTYPE rss [<!ENTITY x "bomb">]><rss/>', "<html>Access denied</html>"])("rejects malformed or unsafe feed %s", (xml) => { expect(() => feed(xml)).toThrow(); });
  it("accepts a valid empty feed but rejects an unsupported HTML layout/challenge", () => {
    expect(feed("<rss><channel><title>Empty</title></channel></rss>").articles).toEqual([]);
    expect(() => parseNewsIndex("<html>Access check</html>", fixtureSource(), fixtureDefinition, newsNow, 20)).toThrow();
  });
  it("keeps valid records from partial feeds and counts malformed articles", () => {
    const xml = rssFixture.replace("</channel>", "<item><title>Broken</title><link>https://evil.test/item</link></item></channel>");
    expect(feed(xml)).toMatchObject({ rejected: 1, articles: [expect.objectContaining({ titleOriginal: "Fixture & update" })] });
  });
  it("isolates official source definitions and does not register restricted media defaults", () => {
    expect(officialNewsSources.map((source) => source.slug)).toEqual(["premier-league", "la-liga", "liverpool", "barcelona"]);
    expect(officialNewsSources.every((source) => source.termsUrl.startsWith("https://") && source.restriction)).toBe(true);
  });
  it.each(officialNewsSources)("parses metadata through the isolated $slug candidate configuration", (definition) => {
    const paths: Record<string, string> = { "premier-league": "/en/news/100/fixture", "la-liga": "/en-GB/news/fixture", liverpool: "/news/fixture", barcelona: "/en/football/first-team/news/100/fixture" };
    const source = fixtureSource({ name: definition.name, slug: definition.slug, domain: definition.domain, ingestionMethod: "HTML_INDEX" });
    const html = `<article><a href="${paths[definition.slug]}"><h3>Synthetic adapter fixture</h3></a><time datetime="2026-10-16T04:00:00Z"></time></article>`;
    const result = parseNewsIndex(html, source, definition, newsNow, 2);
    expect(result.articles[0]).toMatchObject({ sourceName: definition.name, titleOriginal: "Synthetic adapter fixture", sourceUrl: `https://${definition.domain}${paths[definition.slug]}` });
  });
  it.each([{ enabled: false }, { ingestionAllowed: false }, { termsReviewed: false }, { permissionReference: null }])("does not request anything when source is gated: %j", async (override) => {
    const fetcher = vi.fn(); const provider = new OfficialNewsProvider(fixtureSource(override), fixtureDefinition, { ...options, fetch: fetcher });
    await expect(provider.fetchLatestArticles({ limit: 2 })).rejects.toBeInstanceOf(NewsError); expect(fetcher).not.toHaveBeenCalled();
  });
  it("makes only robots + one metadata request, retaining conditional validators", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(allowRobots()).mockResolvedValueOnce(rssResponse());
    const page = await new OfficialNewsProvider(fixtureSource(), fixtureDefinition, { ...options, fetch: fetcher }, () => newsNow).fetchLatestArticles({ limit: 2 });
    expect(fetcher).toHaveBeenCalledTimes(2); expect(page.cursor).toEqual({ etag: '"test-validator"' });
    expect(fetcher.mock.calls[1][1]).toMatchObject({ redirect: "manual", cache: "no-store" });
  });
  it("handles HTTP 304 with the previous cursor and no body parsing", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(allowRobots()).mockResolvedValueOnce(new Response(null, { status: 304 }));
    const page = await new OfficialNewsProvider(fixtureSource(), fixtureDefinition, { ...options, fetch: fetcher }).fetchLatestArticles({ limit: 2, cursor: { etag: '"old"' } });
    expect(page.notModified).toBe(true); expect(page.articles).toEqual([]);
    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({ "If-None-Match": '"old"' });
  });
  it.each([403, 301, 429, 404])("does not retry permanent/blocked/quota HTTP %d", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(allowRobots()).mockResolvedValueOnce(new Response(null, { status }));
    await expect(new OfficialNewsProvider(fixtureSource(), fixtureDefinition, { ...options, fetch: fetcher }).fetchLatestArticles({ limit: 2 })).rejects.toMatchObject({ code: status === 429 ? "RATE_LIMITED" : status === 404 ? "HTTP_ERROR" : "BLOCKED" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(["User-agent: *\nDisallow: /news", "<html>blocked</html>"])("honors blocked robots without fetching news", async (robots) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(robots, { headers: { "Content-Type": "text/plain" } }));
    await expect(new OfficialNewsProvider(fixtureSource(), fixtureDefinition, { ...options, fetch: fetcher }).fetchLatestArticles({ limit: 2 })).rejects.toMatchObject({ code: "ROBOTS_DENIED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(["network", "timeout", "server"])("bounds retries on %s failure", async (failure) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(allowRobots());
    if (failure === "network") fetcher.mockRejectedValue(new Error("private-error"));
    if (failure === "timeout") fetcher.mockImplementation(() => new Promise<Response>(() => {}));
    if (failure === "server") fetcher.mockImplementation(async () => new Response(null, { status: 503 }));
    await expect(new OfficialNewsProvider(fixtureSource(), fixtureDefinition, { ...options, fetch: fetcher }).fetchLatestArticles({ limit: 2 })).rejects.toMatchObject({ code: failure === "network" ? "NETWORK" : failure === "timeout" ? "TIMEOUT" : "HTTP_ERROR" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("rejects oversized responses and enforces the timeout while reading a body", async () => {
    const large = vi.fn<typeof fetch>().mockResolvedValueOnce(allowRobots()).mockResolvedValueOnce(new Response("x", { headers: { "content-length": "2000001" } }));
    await expect(new OfficialNewsProvider(fixtureSource(), fixtureDefinition, { ...options, fetch: large }).fetchLatestArticles({ limit: 2 })).rejects.toMatchObject({ code: "TOO_LARGE" });
    const stalled = vi.fn<typeof fetch>().mockResolvedValueOnce(allowRobots()).mockImplementation(async () => new Response(new ReadableStream({ start() {} })));
    await expect(new OfficialNewsProvider(fixtureSource(), fixtureDefinition, { ...options, fetch: stalled }).fetchLatestArticles({ limit: 2 })).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(stalled).toHaveBeenCalledTimes(3);
  });
});
